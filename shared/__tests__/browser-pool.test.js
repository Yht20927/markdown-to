const test = require('node:test');
const assert = require('node:assert/strict');
const { isRequestAllowed } = require('../browser-pool');

test('browser-pool: local resource schemes are allowed', () => {
  assert.equal(isRequestAllowed('data:image/png;base64,abc', false), true);
  assert.equal(isRequestAllowed('file:///tmp/image.png', false), true);
  assert.equal(isRequestAllowed('about:blank', false), true);
  assert.equal(isRequestAllowed('blob:http://localhost/123', false), true);
});

test('browser-pool: remote requests are blocked by default', () => {
  assert.equal(isRequestAllowed('https://example.com/image.png', false), false);
  assert.equal(isRequestAllowed('http://127.0.0.1/image.png', false), false);
});

test('browser-pool: remote requests require explicit opt-in', () => {
  assert.equal(isRequestAllowed('https://example.com/image.png', true), true);
  assert.equal(isRequestAllowed('http://127.0.0.1/image.png', true), true);
});

test('browser-pool: non-http schemes are still blocked by default', () => {
  assert.equal(isRequestAllowed('ftp://example.com/file', false), false);
  assert.equal(isRequestAllowed('chrome://settings', false), false);
});
