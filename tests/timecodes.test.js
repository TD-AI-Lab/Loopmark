// Extract the *actual* helpers from content.js to test what the extension runs.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/content.js'), 'utf8');
const match = source.match(/function formatTime\(s\) \{[\s\S]*?\n  \}\n\n  function parseTime\(raw\) \{[\s\S]*?\n  \}/);
assert.ok(match, 'helpers available in source');
const {formatTime, parseTime} = new Function(`${match[0]}; return {formatTime, parseTime};`)();

test('formats basic seconds', () => {
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(83.5), '1:23.5');
  assert.equal(formatTime(9.99), '0:09.9');
});
test('formats long videos with hours', () => {
  assert.equal(formatTime(3821.7), '1:03:41.7');
  assert.equal(formatTime(36000), '10:00:00.0');
});
test('accepts seconds, minutes, hours and decimal comma', () => {
  assert.equal(parseTime('12.5'), 12.5);
  assert.equal(parseTime('01:23.5'), 83.5);
  assert.equal(parseTime('01:02:03.25'), 3723.25);
  assert.equal(parseTime('1,5'), 1.5);
});
test('rejects invalid timecodes', () => {
  for (const value of ['', 'abc', '-1', '1:75', '1:60:00', '1:02:60', '2.0.1', 'NaN']) {
    assert.equal(parseTime(value), null, value);
  }
});
test('manifest contains privacy declaration and minimal permissions', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/manifest.json'), 'utf8'));
  assert.equal(manifest.version, '0.1.5');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, ['https://www.youtube.com/*']);
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
});
