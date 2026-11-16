/* Loopmark 0.1.5 — readable source, no telemetry, remote resources or page data collection. */
(() => {
  'use strict';

  if (window.__loopmarkInitialized) return;
  window.__loopmarkInitialized = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const makeDefault = () => ({ start: 0, end: null, enabled: false });
  const state = {
    id: null, video: null, player: null, config: makeDefault(),
    panelOpen: false, button: null, panel: null, markers: null, controls: null,
    raf: null, generation: 0, drag: null
  };

  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  const duration = () => {
    const d = state.video?.duration;
    return Number.isFinite(d) && d > 0 ? d : 0;
  };
  const endValue = () => state.config.end ?? duration();
  const isValid = () => duration() > 0 && endValue() - state.config.start >= 0.1;

  function formatTime(s) {
    if (!Number.isFinite(s) || s < 0) return '0:00.0';
    const tenth = Math.floor(s * 10 + 1e-7);
    const totalSeconds = Math.floor(tenth / 10);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const dec = tenth % 10;
    if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${dec}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}.${dec}`;
  }

  function parseTime(raw) {
    const text = String(raw).trim().replace(',', '.');
    if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(text)) return null;
    const items = text.split(':');
    if (items.length >= 2 && Number(items.at(-1)) >= 60) return null;
    if (items.length === 3 && Number(items[1]) >= 60) return null;
    const seconds = items.reduce((total, item) => total * 60 + Number(item), 0);
    return Number.isFinite(seconds) ? seconds : null;
  }

  const currentVideoId = () => location.hostname === 'www.youtube.com' && location.pathname === '/watch'
    ? new URLSearchParams(location.search).get('v') : null;
  const storageKey = id => `loopmark:video:${id}`;

  function normalize() {
    const d = duration();
    if (!d) return;
    state.config.start = clamp(state.config.start, 0, Math.max(0, d - 0.1));
    if (state.config.end !== null) state.config.end = clamp(state.config.end, 0, d);
    if (!isValid()) state.config.enabled = false;
  }

  async function loadConfig(id, generation) {
    let savedConfig = makeDefault();
    try {
      const result = await api.storage.local.get(storageKey(id));
      const saved = result?.[storageKey(id)];
      if (saved && typeof saved === 'object') {
        if (Number.isFinite(saved.start) && saved.start >= 0) savedConfig.start = saved.start;
        if (saved.end === null || (Number.isFinite(saved.end) && saved.end >= 0)) savedConfig.end = saved.end;
        savedConfig.enabled = saved.enabled === true;
      }
    } catch (error) {
      console.warn('[Loopmark] Stockage local inaccessible', error);
    }
    if (generation !== state.generation || id !== state.id) return;
    state.config = savedConfig;
    normalize();
    updateUI();
    scheduleFrame();
  }

  function saveConfig() {
    if (!state.id) return;
    try {
      const write = api.storage.local.set({ [storageKey(state.id)]: { ...state.config } });
      if (write?.catch) write.catch(error => console.warn('[Loopmark] Échec de sauvegarde', error));
    } catch (error) {
      console.warn('[Loopmark] Échec de sauvegarde', error);
    }
  }

  function changeBoundary(which, seconds, persist = true) {
    const d = duration();
    if (!d || !Number.isFinite(seconds)) return false;
    const next = Math.round(clamp(seconds, 0, d) * 10) / 10;
    const start = which === 'start' ? next : state.config.start;
    const end = which === 'end' ? next : endValue();
    if (end - start < 0.099) return false;
    state.config[which] = next;
    if (persist) saveConfig();
    showError('');
    updateUI();
    return true;
  }

  function node(tag, cls = '', text = undefined, parent = null) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }

  function button(parent, cls, text, label, action) {
    const el = node('button', cls, text, parent);
    el.type = 'button';
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('click', action);
    return el;
  }

  function showError(message) {
    if (state.controls?.error) state.controls.error.textContent = message;
  }

  function setPanelOpen(open) {
    state.panelOpen = !!open;
    updateUI();
    if (state.panelOpen) positionPanel();
    if (!state.panelOpen && state.panel?.contains(document.activeElement)) {
      state.button?.focus({ preventScroll: true });
    }
  }

  // YouTube sometimes clones/rebuilds its toolbar. DOM copies of our button
  // do not contain the original click handler, and can accumulate on screen.
  // Treat the trigger as a singleton: remove all clones before any insertion.
  const TRIGGER_SELECTOR = '.ytp-right-controls .loopmark-trigger';
  const TRIGGER_ID = 'loopmark-player-trigger';

  // YouTube may wrap Settings in one or more DIVs. querySelector() sees
  // descendants, but insertBefore() accepts ONLY a direct child of controls.
  // In v0.1.3, the button was appended before insertBefore() threw, causing
  // unlimited orphan buttons; v0.1.4 detached it first and showed nothing.
  function directChildUnder(parent, element) {
    let child = element;
    while (child && child.parentElement !== parent) child = child.parentElement;
    return child?.parentElement === parent ? child : null;
  }

  function nativeControlSlot() {
    const controls = state.player?.querySelector('.ytp-chrome-bottom .ytp-right-controls')
      ?? state.player?.querySelector('.ytp-right-controls');
    if (!controls?.isConnected) return null;

    // Prefer the Settings gear, but don't require its exact internal markup.
    // On some layouts Settings can be missing, deferred or nested.
    const settings = controls.querySelector('.ytp-settings-button, [data-tooltip-target-id="ytp-settings-button"]');
    const fallback = controls.querySelector('.ytp-size-button, .ytp-fullscreen-button');
    const anchor = directChildUnder(controls, settings ?? fallback);
    // No native anchor yet: retry later rather than floating over the video.
    return anchor ? { controls, anchor, hasSettings: !!settings } : null;
  }

  function createToggleButton() {
    // Create the node DETACHED. In the previous version we appended the node
    // to the end of the toolbar, then moved it before Settings (two mutations).
    const trigger = button(null, 'ytp-button loopmark-trigger', '',
      'Loopmark : régler la boucle A–B', event => {
        event.stopPropagation();
        setPanelOpen(!state.panelOpen);
      });
    trigger.id = TRIGGER_ID;
    trigger.title = 'Loopmark · Boucle A–B';
    trigger.innerHTML = '<svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true" focusable="false"><path d="M9 12.5h18l-4.5-4.2M27 23.5H9l4.5 4.2" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linejoin="round" stroke-linecap="round"/><path d="M26.9 12.5l-4.4 4.1M9.1 23.5l4.4-4.1" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linejoin="round" stroke-linecap="round"/><text x="18" y="20.1" text-anchor="middle" fill="currentColor" font-family="Roboto,Arial,sans-serif" font-weight="700" font-size="8.8">AB</text></svg><span class="loopmark-trigger-indicator" aria-hidden="true"></span>';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.addEventListener('dblclick', event => event.stopPropagation());
    state.button = trigger;
    return trigger;
  }

  function removeOrphanTriggers() {
    // Keep *only* our live node. YouTube can copy a node when rebuilding the
    // controls; a clone is not our button, even if it has the same id/classes.
    const triggers = state.player?.querySelectorAll(TRIGGER_SELECTOR);
    if (!triggers) return;
    for (const candidate of triggers) {
      if (candidate !== state.button) candidate.remove();
    }
  }

  function ensureNativeButton() {
    const slot = nativeControlSlot();
    removeOrphanTriggers();
    if (!slot) {
      // An incomplete toolbar is normal during navigation. Keep the panel
      // state, but don't create an extra button in the wrong location.
      if (state.button?.isConnected) state.button.remove();
      if (state.panelOpen) setPanelOpen(false);
      return;
    }
    const { controls, anchor } = slot;
    if (!state.button) createToggleButton();
    // IMPORTANT: reconciliation runs periodically. A stable toolbar must
    // produce ZERO DOM writes; YouTube may react to every DOM change.
    let reinserted = false;
    if (state.button.parentElement !== controls || state.button.nextElementSibling !== anchor) {
      controls.insertBefore(state.button, anchor);
      reinserted = true;
    }
    removeOrphanTriggers();
    if (reinserted) updateUI();
    if (state.panelOpen) positionPanel();
  }

  function positionPanel() {
    if (!state.panel || !state.button || !state.player || !state.panelOpen) return;
    const playerRect = state.player.getBoundingClientRect();
    const triggerRect = state.button.getBoundingClientRect();
    if (triggerRect.width <= 0 || playerRect.width <= 0) return;
    const panelWidth = Math.min(318, Math.max(0, playerRect.width - 24));
    const right = clamp(playerRect.right - triggerRect.right, 8,
      Math.max(8, playerRect.width - panelWidth - 8));
    const bottom = clamp(playerRect.bottom - triggerRect.top + 8, 52,
      Math.max(52, playerRect.height - 16));
    state.panel.style.setProperty('--loopmark-panel-right', `${Math.round(right)}px`);
    state.panel.style.setProperty('--loopmark-panel-bottom', `${Math.round(bottom)}px`);
  }

  function bindTimeField(parent, which, letter, title) {
    const field = node('div', 'loopmark-field', undefined, parent);
    const label = node('label', 'loopmark-field-label', undefined, field);
    const tag = node('span', 'loopmark-letter', letter, label);
    tag.setAttribute('aria-hidden', 'true');
    node('span', '', title, label);
    const input = node('input', 'loopmark-time-input', undefined, field);
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.id = `loopmark-${which}`;
    input.setAttribute('aria-label', `Timecode ${title.toLowerCase()}`);
    label.htmlFor = input.id;
    const capture = button(field, 'loopmark-capture', 'Position actuelle', `Placer ${letter} sur la position actuelle de la vidéo`, () => {
      if (!changeBoundary(which, state.video?.currentTime ?? 0)) {
        showError(which === 'start' ? 'Le point A doit précéder B.' : 'Le point B doit suivre A.');
      }
    });
    const commit = () => {
      const value = parseTime(input.value);
      if (value === null || !changeBoundary(which, value)) {
        showError('Timecode invalide : vérifie que A est avant B.');
        input.value = formatTime(which === 'start' ? state.config.start : endValue());
      }
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { commit(); input.blur(); }
    });
    return { input, capture };
  }

  function buildPanel() {
    const panel = node('section', 'loopmark-popover', undefined, state.player);
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Réglages de boucle A–B');
    // No seek/play events should be passed on to the YouTube player.
    for (const name of ['click', 'dblclick', 'keydown', 'wheel']) {
      panel.addEventListener(name, event => event.stopPropagation());
    }

    const header = node('div', 'loopmark-heading', undefined, panel);
    const headingLeft = node('div', 'loopmark-heading-left', undefined, header);
    node('strong', 'loopmark-title', 'Boucle A–B', headingLeft);
    const status = node('span', 'loopmark-status', 'Inactive', headingLeft);
    const close = button(header, 'loopmark-icon-button', '×', 'Fermer le panneau Loopmark', () => setPanelOpen(false));
    close.title = 'Fermer';
    node('p', 'loopmark-description', 'Répéter un passage de cette vidéo.', panel);

    const fields = node('div', 'loopmark-fields', undefined, panel);
    const start = bindTimeField(fields, 'start', 'A', 'Début');
    const end = bindTimeField(fields, 'end', 'B', 'Fin');

    const timelineWrap = node('div', 'loopmark-timeline-wrap', undefined, panel);
    const timelineLabel = node('div', 'loopmark-timeline-caption', 'Extrait sélectionné', timelineWrap);
    const timeline = node('div', 'loopmark-timeline', undefined, timelineWrap);
    timeline.setAttribute('aria-label', 'Déplacer les bornes A et B');
    const fill = node('span', 'loopmark-timeline-fill', undefined, timeline);
    const markA = node('span', 'loopmark-thumb loopmark-thumb-a', undefined, timeline);
    const markB = node('span', 'loopmark-thumb loopmark-thumb-b', undefined, timeline);
    for (const [thumb, label] of [[markA, 'A : début'], [markB, 'B : fin']]) {
      thumb.tabIndex = 0;
      thumb.setAttribute('role', 'slider');
      thumb.setAttribute('aria-label', label);
      thumb.setAttribute('aria-valuemin', '0');
      thumb.setAttribute('aria-orientation', 'horizontal');
    }
    const times = node('div', 'loopmark-preview-times', undefined, timelineWrap);
    const tickA = node('span', '', '', times);
    const tickB = node('span', '', '', times);
    const error = node('p', 'loopmark-error', '', panel);
    error.setAttribute('role', 'status');

    const actions = node('div', 'loopmark-actions', undefined, panel);
    const toggle = button(actions, 'loopmark-primary', 'Activer la boucle', 'Activer ou désactiver la boucle', () => {
      normalize();
      if (!isValid()) { showError('Définis A et B avant de lancer la boucle.'); return; }
      state.config.enabled = !state.config.enabled;
      if (state.config.enabled && state.video &&
          (state.video.currentTime < state.config.start || state.video.currentTime >= endValue())) {
        state.video.currentTime = state.config.start;
      }
      if (!state.config.enabled) stopFrame();
      saveConfig();
      updateUI();
      scheduleFrame();
    });
    const reset = button(actions, 'loopmark-secondary', 'Réinitialiser', 'Réinitialiser les points A et B', () => {
      state.config = makeDefault();
      stopFrame();
      showError('');
      saveConfig();
      updateUI();
    });
    node('p', 'loopmark-privacy', 'Enregistré uniquement dans Firefox', panel);

    // Pointer-friendly two-handle segment selector; writes one local setting when the drag ends.
    timeline.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !duration()) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = timeline.getBoundingClientRect();
      const position = clamp((event.clientX - rect.left) / rect.width, 0, 1) * duration();
      const which = event.target === markA ? 'start' : event.target === markB ? 'end'
        : Math.abs(position - state.config.start) <= Math.abs(position - endValue()) ? 'start' : 'end';
      state.drag = { pointerId: event.pointerId, which };
      timeline.setPointerCapture(event.pointerId);
      changeBoundary(which, position, false);
    });
    timeline.addEventListener('pointermove', event => {
      if (!state.drag || state.drag.pointerId !== event.pointerId) return;
      const rect = timeline.getBoundingClientRect();
      changeBoundary(state.drag.which, clamp((event.clientX - rect.left) / rect.width, 0, 1) * duration(), false);
    });
    function finishDrag(event) {
      if (!state.drag || state.drag.pointerId !== event.pointerId) return;
      state.drag = null;
      saveConfig();
    }
    timeline.addEventListener('pointerup', finishDrag);
    timeline.addEventListener('pointercancel', finishDrag);
    timeline.addEventListener('lostpointercapture', finishDrag);

    for (const [which, element] of [['start', markA], ['end', markB]]) {
      element.addEventListener('keydown', event => {
        const step = event.shiftKey ? 5 : 0.1;
        let next;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'ArrowUp') next = which === 'start' ? state.config.start : endValue();
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = duration();
        else return;
        if (event.key.startsWith('Arrow')) next += (event.key === 'ArrowRight' || event.key === 'ArrowUp' ? step : -step);
        event.preventDefault();
        changeBoundary(which, next);
      });
    }

    state.panel = panel;
    state.controls = { status, start, end, fill, markA, markB, tickA, tickB, error, toggle };
  }

  function buildPlayerMarkers() {
    const host = state.player?.querySelector('.ytp-progress-bar-container');
    if (!host) return;
    const root = node('div', 'loopmark-player-markers', undefined, host);
    const section = node('span', 'loopmark-player-segment', undefined, root);
    const a = node('span', 'loopmark-player-endpoint', undefined, root);
    const b = node('span', 'loopmark-player-endpoint', undefined, root);
    state.markers = { root, section, a, b };
  }

  function updateUI() {
    if (!state.panel || !state.controls) return;
    const c = state.controls;
    const d = duration();
    const start = state.config.start;
    const end = endValue();
    const left = d ? clamp(start / d * 100, 0, 100) : 0;
    const right = d ? clamp(end / d * 100, 0, 100) : 100;
    state.panel.hidden = !state.panelOpen;
    state.button?.classList.toggle('loopmark-is-active', state.config.enabled);
    state.button?.setAttribute('aria-expanded', String(state.panelOpen));
    state.button?.setAttribute('aria-pressed', String(state.config.enabled));
    c.status.textContent = state.config.enabled ? 'Active' : 'Inactive';
    c.status.classList.toggle('loopmark-status-on', state.config.enabled);
    if (document.activeElement !== c.start.input) c.start.input.value = formatTime(start);
    if (document.activeElement !== c.end.input) c.end.input.value = formatTime(end);
    c.toggle.textContent = state.config.enabled ? 'Désactiver' : 'Activer la boucle';
    c.toggle.classList.toggle('loopmark-primary-on', state.config.enabled);
    c.toggle.disabled = !isValid();
    c.fill.style.left = `${left}%`;
    c.fill.style.width = `${Math.max(0, right - left)}%`;
    c.markA.style.left = `${left}%`;
    c.markB.style.left = `${right}%`;
    c.tickA.textContent = formatTime(start);
    c.tickB.textContent = formatTime(end);
    for (const [thumb, val] of [[c.markA, start], [c.markB, end]]) {
      thumb.setAttribute('aria-valuemax', String(Math.round(d * 10) / 10));
      thumb.setAttribute('aria-valuenow', String(Math.round(val * 10) / 10));
      thumb.setAttribute('aria-valuetext', formatTime(val));
    }
    if (state.markers) {
      state.markers.root.hidden = !state.config.enabled || !isValid();
      state.markers.section.style.left = `${left}%`;
      state.markers.section.style.width = `${Math.max(0, right - left)}%`;
      state.markers.a.style.left = `${left}%`;
      state.markers.b.style.left = `${right}%`;
    }
  }

  function checkLoop() {
    const video = state.video;
    if (!video || !state.config.enabled || !isValid()) return;
    if (video.currentTime >= endValue() - 0.035) video.currentTime = state.config.start;
  }
  function nextFrame() { state.raf = null; checkLoop(); scheduleFrame(); }
  function scheduleFrame() {
    if (state.raf !== null || !state.video || state.video.paused || document.hidden || !state.config.enabled) return;
    state.raf = requestAnimationFrame(nextFrame);
  }
  function stopFrame() {
    if (state.raf !== null) cancelAnimationFrame(state.raf);
    state.raf = null;
  }
  function onVideoEnded() {
    if (!state.config.enabled || !isValid() || !state.video) return;
    state.video.currentTime = state.config.start;
    state.video.play().catch(() => {});
  }
  function onMetadata() { normalize(); updateUI(); }

  function unmount() {
    stopFrame();
    const video = state.video;
    if (video) {
      video.removeEventListener('timeupdate', checkLoop);
      video.removeEventListener('seeked', checkLoop);
      video.removeEventListener('play', scheduleFrame);
      video.removeEventListener('pause', stopFrame);
      video.removeEventListener('ended', onVideoEnded);
      video.removeEventListener('loadedmetadata', onMetadata);
    }
    state.panel?.remove(); state.button?.remove(); state.markers?.root.remove();
    // Clones made by YouTube are not referenced by state.button.
    state.player?.querySelectorAll(TRIGGER_SELECTOR).forEach(el => el.remove());
    state.panel = null; state.button = null; state.markers = null; state.controls = null;
    state.video = null; state.player = null; state.drag = null; state.panelOpen = false;
  }

  function reconcile() {
    const id = currentVideoId();
    const player = document.querySelector('#movie_player') ?? document.querySelector('.html5-video-player');
    const video = player?.querySelector('video.html5-main-video') ?? player?.querySelector('video');
    if (!id || !player || !video) {
      if (state.id || state.player) { state.generation++; unmount(); state.id = null; }
      return;
    }
    const changed = id !== state.id || player !== state.player || video !== state.video;
    if (!changed && state.panel?.isConnected) {
      ensureNativeButton();
      if (!state.markers?.root.isConnected) { buildPlayerMarkers(); updateUI(); }
      return;
    }
    if (changed) {
      state.generation++;
      unmount();
      state.id = id;
      state.video = video;
      state.player = player;
      state.config = makeDefault();
    } else {
      state.button?.remove(); state.panel?.remove(); state.markers?.root.remove();
      state.button = null; state.panel = null; state.markers = null;
      state.panelOpen = false;
    }
    buildPanel();
    ensureNativeButton();
    buildPlayerMarkers();
    if (changed) {
      video.addEventListener('timeupdate', checkLoop);
      video.addEventListener('seeked', checkLoop);
      video.addEventListener('play', scheduleFrame);
      video.addEventListener('pause', stopFrame);
      video.addEventListener('ended', onVideoEnded);
      video.addEventListener('loadedmetadata', onMetadata);
      loadConfig(id, state.generation);
    }
    updateUI();
    scheduleFrame();
  }

  // These handlers work even if YouTube handles its own click events.
  document.addEventListener('pointerdown', event => {
    if (!state.panelOpen || !state.panel || !state.button) return;
    if (state.panel.contains(event.target) || state.button.contains(event.target)) return;
    setPanelOpen(false);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !state.panelOpen) return;
    event.stopPropagation();
    setPanelOpen(false);
  }, true);

  window.addEventListener('resize', () => { if (state.panelOpen) positionPanel(); });
  document.addEventListener('fullscreenchange', () => { if (state.panelOpen) requestAnimationFrame(positionPanel); });
  document.addEventListener('yt-navigate-finish', reconcile);
  document.addEventListener('yt-page-data-updated', reconcile);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopFrame();
    else { reconcile(); scheduleFrame(); }
  });
  // YouTube can rebuild its internal DOM without changing the URL.
  setInterval(reconcile, 1200);
  console.info('[Loopmark] v0.1.5 loaded');
  reconcile();
})();
