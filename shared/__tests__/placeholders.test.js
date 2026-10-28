/**
 * Tests for shared/placeholders.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { PREFIX, make, RE, assertAllRestored } = require('../placeholders');

describe('placeholders', () => {
  it('should generate unique placeholders with NUL prefix', () => {
    const p1 = make('CB', 0);
    const p2 = make('CB', 1);
    assert.ok(p1.includes(PREFIX));
    assert.ok(p1.includes('CB:0'));
    assert.notStrictEqual(p1, p2);
  });

  it('should match all placeholder types with RE', () => {
    const ph1 = make('CB', 5);
    const ph2 = make('IM', 3);
    const ph3 = make('CODEBLOCK', 0);
    const ph4 = make('MATHBLOCK', 2);
    const ph5 = make('ESC', 4);
    const text = `before ${ph1} middle ${ph2} end ${ph3} math ${ph4} esc ${ph5}`;
    const matches = text.match(RE);
    assert.strictEqual(matches.length, 5);
  });

  it('should not match non-placeholder text', () => {
    const text = 'just regular text with no placeholders';
    assert.strictEqual(RE.test(text), false);
  });

  it('assertAllRestored should throw on leaked placeholders', () => {
    const leaked = `some text ${make('CB', 0)} remaining`;
    assert.throws(() => assertAllRestored(leaked), /Placeholder leaked/);
  });

  it('assertAllRestored should not throw on clean text', () => {
    assert.doesNotThrow(() => assertAllRestored('clean text'));
  });

  it('should not collide with normal markdown characters', () => {
    const ph = make('CB', 0);
    // Normal markdown shouldn't contain NUL
    assert.ok(!'**bold** `code` [link](url)'.includes(PREFIX));
    // Placeholder should be distinguishable
    assert.ok(ph.includes(PREFIX));
  });
});
