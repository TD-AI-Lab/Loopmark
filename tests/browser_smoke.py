"""Offline Playwright smoke test against a YouTube-like player fixture.
This is not a substitute for testing on youtube.com in actual Firefox.
Requirements: pip install playwright; local Chromium binary available.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = """<!doctype html><html lang='fr'><head><meta charset='utf-8'><style>
*{box-sizing:border-box}body{background:#0f0f0f;margin:0;font:14px Arial,sans-serif;color:#f1f1f1}
header{height:62px;display:flex;align-items:center;gap:24px;padding:0 25px}
#outside{border:0;border-radius:8px;padding:10px 22px;background:#282828;color:white;cursor:pointer}
main{width:1000px;margin:12px auto}#movie_player{height:560px;position:relative;background:linear-gradient(145deg,#272727,#4d4d4d 55%,#222);border-radius:14px;overflow:hidden}
video{position:absolute;inset:0;width:100%;height:100%}
.ytp-chrome-bottom{position:absolute;bottom:0;left:0;right:0;height:52px;background:#080808c9;display:flex;justify-content:flex-end;align-items:center;z-index:5}
.ytp-right-controls{height:100%;display:flex;align-items:center}
.ytp-button{color:white;background:transparent;border:0;width:48px;height:100%;cursor:pointer}
.ytp-settings-button{display:flex;align-items:center;justify-content:center}
.ytp-settings-button svg{width:30px;height:30px}
.ytp-progress-bar-container{position:absolute;bottom:48px;left:12px;right:12px;height:4px;background:#555}
.ytp-progress-bar-container:before{content:'';display:block;height:100%;width:20%;background:#ff0033}
.player-label{position:absolute;top:40%;left:18%;font-size:50px;font-weight:700;color:#ffffff4b}
h3{font-size:21px;font-weight:650}
</style></head><body><header><strong>YouTube Premium</strong><button id='outside'>Rechercher</button></header>
<main><div id='movie_player'><video class='html5-main-video'></video><span class='player-label'>YouTube</span>
<div class='ytp-progress-bar-container'></div><div class='ytp-chrome-bottom'><div class='ytp-right-controls'>
<button class='ytp-button ytp-subtitles-button' title='Sous-titres'>▣</button>
<button class='ytp-button ytp-settings-button' aria-label='Paramètres' title='Paramètres'><svg viewBox='0 0 36 36' aria-hidden='true'><path stroke='white' fill='none' stroke-width='2' d='M18 5v4 M18 27v4 M5 18h4 M27 18h4 M9 9l3 3 M24 24l3 3 M27 9l-3 3 M12 24l-3 3'/><circle cx='18' cy='18' r='7' fill='none' stroke='white' stroke-width='2'/></svg></button>
<button class='ytp-button ytp-size-button' title='Cinéma'>▱</button>
<button class='ytp-button ytp-fullscreen-button' title='Plein écran'>⛶</button>
</div></div></div>
<h3>Vidéo de test · Interface de lecteur simulée</h3></main></body></html>"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1350, 'height': 860}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(HTML)
    page.evaluate("""() => {
      const data = {};
      window.browser = {storage: {local: {
        get: async (k) => ({[k]: data[k]}),
        set: async (items) => Object.assign(data, items)
      }}};
      const video = document.querySelector('video');
      Object.defineProperty(video, 'duration', {get: () => 256.5});
      Object.defineProperty(video, 'currentTime', {value: 5, writable: true});
      Object.defineProperty(video, 'paused', {get: () => true});
      video.play = () => Promise.resolve();
    }""")
    page.add_style_tag(path=str(ROOT / 'src/content.css'))
    page.evaluate("window.__testVideoId = 'loopmark-test-1'")
    script = (ROOT / 'src/content.js').read_text(encoding='utf8')
    script = script.replace("location.hostname === 'www.youtube.com' && location.pathname === '/watch'", 'true')
    script = script.replace("new URLSearchParams(location.search).get('v')", 'globalThis.__testVideoId')
    page.add_script_tag(content=script)

    trigger = page.locator('.loopmark-trigger')
    trigger.wait_for(state='visible')
    assert page.evaluate("""() => {
      const t = document.querySelector('.loopmark-trigger');
      return t.parentElement.classList.contains('ytp-right-controls') &&
        t.nextElementSibling.classList.contains('ytp-settings-button') &&
        getComputedStyle(t).position !== 'absolute';
    }"""), 'AB must be directly before the settings gear in native controls'
    assert trigger.count() == 1, 'exactly one Loopmark trigger'
    # A periodic reconciliation on an unchanged toolbar must be read-only.
    # Otherwise YouTube can react to our DOM writes and keep copying controls.
    page.evaluate("""() => {
      window.__loopmarkDomWrites = [];
      window.__loopmarkObserver = new MutationObserver(records =>
        window.__loopmarkDomWrites.push(...records));
      window.__loopmarkObserver.observe(document.querySelector('.ytp-right-controls'),
        {childList:true, attributes:true, subtree:true});
      for (let i=0; i<12; i++) document.dispatchEvent(new Event('yt-page-data-updated'));
    }""")
    assert page.evaluate("""() => {
      window.__loopmarkObserver.disconnect();
      return window.__loopmarkDomWrites.length;
    }""") == 0, 'stable toolbar reconciliation must have zero DOM mutations'

    # The old bug: YouTube cloned/reinserted our controls and the page ended
    # up with rows of duplicate AB buttons. Reproduce that 30 times.
    for _ in range(30):
        page.evaluate("""() => {
          const controls = document.querySelector('.ytp-right-controls');
          const trigger = controls.querySelector('.loopmark-trigger');
          controls.appendChild(trigger.cloneNode(true));
          document.dispatchEvent(new Event('yt-page-data-updated'));
        }""")
        assert trigger.count() == 1, 'orphan AB buttons must be removed on every reconciliation'
    assert page.evaluate("""() =>
      document.querySelector('.loopmark-trigger').nextElementSibling.classList.contains('ytp-settings-button')
    """), 'AB must stay directly before Settings after clone cleanup'

    # Regression: YouTube can put Settings inside a wrapper. Earlier versions
    # passed a non-direct child to insertBefore, so insertion threw.
    page.evaluate("""() => {
      const gear = document.querySelector('.ytp-settings-button');
      const wrapper = document.createElement('div');
      wrapper.className = 'ytp-settings-wrapper';
      wrapper.style.cssText = 'display:flex;height:100%';
      gear.before(wrapper);
      wrapper.append(gear);
      document.dispatchEvent(new Event('yt-page-data-updated'));
    }""")
    assert trigger.count() == 1, 'nested Settings must keep exactly one trigger'
    assert page.evaluate("""() => {
      const t = document.querySelector('.loopmark-trigger');
      return t.parentElement.classList.contains('ytp-right-controls') &&
        t.nextElementSibling.classList.contains('ytp-settings-wrapper');
    }"""), 'AB must appear immediately before the direct-child Settings wrapper'
    for _ in range(30):
        page.evaluate("document.dispatchEvent(new Event('yt-page-data-updated'))")
        assert trigger.count() == 1, 'nested toolbar must not cause duplicates'

    # No Settings gear? Use the next native control as fallback, not the video.
    page.evaluate("""() => {
      window.__gear = document.querySelector('.ytp-settings-button');
      window.__gear.remove();
      document.dispatchEvent(new Event('yt-page-data-updated'));
    }""")
    assert trigger.count() == 1, 'native fallback must keep the button visible'
    assert page.evaluate("""() => document.querySelector('.loopmark-trigger').nextElementSibling.classList.contains('ytp-size-button')"""), 'fallback before theater mode'
    page.evaluate("""() => {
      document.querySelector('.ytp-settings-wrapper').append(window.__gear);
      document.dispatchEvent(new Event('yt-page-data-updated'));
    }""")
    assert trigger.count() == 1, 'AB survives Settings being restored'
    assert page.evaluate("""() => document.querySelector('.loopmark-trigger').nextElementSibling.classList.contains('ytp-settings-wrapper')"""), 'AB moves back next to settings wrapper'
    trigger.click()
    panel = page.locator('.loopmark-popover')
    assert panel.is_visible(), 'panel should open'
    page.screenshot(path=str(ROOT / 'dist/Loopmark_v0.1.5_ui_preview.png'), full_page=True)
    page.locator('#outside').click()
    assert not panel.is_visible(), 'outside click should dismiss'
    trigger.click()
    page.keyboard.press('Escape')
    assert not panel.is_visible(), 'Escape should dismiss'
    trigger.click()
    page.locator('.loopmark-capture').first.click()
    assert panel.is_visible(), 'inside click must not dismiss'
    page.locator('#loopmark-start').fill('0:12.3')
    page.locator('#loopmark-start').press('Tab')
    page.locator('#loopmark-end').fill('0:44.4')
    page.locator('#loopmark-end').press('Tab')
    page.locator('.loopmark-primary').click()
    assert 'loopmark-is-active' in trigger.get_attribute('class'), 'loop should activate'
    page.evaluate("""() => {
      const v = document.querySelector('video'); v.currentTime = 50;
      v.dispatchEvent(new Event('timeupdate'));
    }""")
    assert page.evaluate("document.querySelector('video').currentTime") == 12.3, 'should loop to A at B'
    page.locator('#outside').click()
    assert not panel.is_visible() and 'loopmark-is-active' in trigger.get_attribute('class'), 'outside click keeps loop active'

    # YouTube toolbar rebuilt in the same video: button must return without resetting state.
    trigger.click()
    page.evaluate("""() => {
      const controls = document.querySelector('.ytp-right-controls');
      const rebuilt = controls.cloneNode(true);
      rebuilt.querySelector('.loopmark-trigger')?.remove();
      controls.replaceWith(rebuilt);
      document.dispatchEvent(new Event('yt-page-data-updated'));
    }""")
    assert trigger.count() == 1, 'toolbar rebuild must not duplicate trigger'
    assert page.evaluate("""() => {
      const t = document.querySelector('.loopmark-trigger');
      return t.nextElementSibling.classList.contains('ytp-settings-wrapper');
    }"""), 'trigger must return immediately before Settings wrapper'
    assert panel.is_visible(), 'popover must remain open after toolbar rebuild'
    assert 'loopmark-is-active' in trigger.get_attribute('class'), 'loop stays active after toolbar rebuild'
    page.locator('#outside').click()

    # YouTube navigation without a page refresh.
    page.evaluate("""() => {
      window.__testVideoId = 'loopmark-test-2';
      document.dispatchEvent(new Event('yt-navigate-finish'));
    }""")
    page.wait_for_timeout(150)
    assert not panel.is_visible(), 'route change closes panel'
    assert 'loopmark-is-active' not in trigger.get_attribute('class'), 'settings are scoped per video'
    # If native controls are absent, no button should float over the picture.
    page.evaluate('''() => {
      const host = document.querySelector('.ytp-right-controls');
      window.__nativeControls = host;
      host.remove();
      document.dispatchEvent(new Event('yt-page-data-updated'));
    }''' )
    assert trigger.count() == 0, 'never fall back to a floating button'
    page.evaluate('''() => {
      document.querySelector('.ytp-chrome-bottom').append(window.__nativeControls);
      document.dispatchEvent(new Event('yt-page-data-updated'));
    }''' )
    assert trigger.count() == 1, 'restore button when controls return'
    assert page.evaluate('''() => document.querySelector('.loopmark-trigger').nextElementSibling.classList.contains('ytp-settings-wrapper')'''), 'recovery placement'
    # Start with a gear that is nested BEFORE Loopmark is injected.
    # This exact scenario threw NotFoundError in v0.1.3/0.1.4.
    nested = browser.new_page(viewport={'width': 1350, 'height': 860})
    nested_errors = []
    nested.on('pageerror', lambda e: nested_errors.append(str(e)))
    nested.set_content(HTML)
    nested.evaluate("""() => {
      const gear = document.querySelector('.ytp-settings-button');
      const wrapper = document.createElement('div');
      wrapper.className = 'ytp-settings-wrapper';
      wrapper.style.cssText = 'display:flex;height:100%';
      gear.before(wrapper); wrapper.append(gear);
      window.browser = {storage:{local:{get:async()=>({}),set:async()=>{}}}};
      window.__testVideoId = 'nested-at-start';
      const video = document.querySelector('video');
      Object.defineProperty(video, 'duration', {get: () => 250});
      Object.defineProperty(video, 'paused', {get: () => true});
    }""")
    nested.add_style_tag(path=str(ROOT / 'src/content.css'))
    nested.add_script_tag(content=script)
    nested.locator('.loopmark-trigger').wait_for(state='visible')
    assert nested.locator('.loopmark-trigger').count() == 1
    assert nested.evaluate("""() => {
      const trigger = document.querySelector('.loopmark-trigger');
      return trigger.parentElement.classList.contains('ytp-right-controls') &&
        trigger.nextElementSibling.classList.contains('ytp-settings-wrapper');
    }"""), 'initial nested settings works without inserting inside wrapper'
    nested.wait_for_timeout(1400)  # also exercise the periodic reconciliation
    assert nested.locator('.loopmark-trigger').count() == 1
    assert not nested_errors, f'nested settings JS exceptions: {nested_errors}'
    nested.close()
    assert not errors, f'uncaught JS exceptions: {errors}'
    print('PASS — one native AB, nested settings, 30 cloned triggers, fallback, panel, A/B loop, toolbar rebuild, SPA')
    print('Preview:', ROOT / 'dist/Loopmark_v0.1.5_ui_preview.png')
    browser.close()
