/**
 * Tests for shared/footnote-defs.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { extractFootnoteDefs } = require('../footnote-defs');

describe('footnote-defs', () => {
  it('should collect indented continuation paragraphs', () => {
    const seen = [];
    const body = extractFootnoteDefs('Body[^1]\n\n[^1]: First.\n\n    Second.\n', (label, content) => {
      seen.push([label, content]);
    });
    assert.strictEqual(body, 'Body[^1]\n\n');
    assert.deepStrictEqual(seen, [['1', 'First. Second.']]);
  });

  it('should stop at an unindented paragraph', () => {
    const seen = [];
    extractFootnoteDefs('[^a]: Note.\n\nAfter.\n', (label, content) => seen.push([label, content]));
    assert.deepStrictEqual(seen, [['a', 'Note.']]);
  });

  it('should preserve a replacement placeholder', () => {
    const body = extractFootnoteDefs('[^a]: Note.\nNext.\n', () => 'PLACEHOLDER');
    assert.strictEqual(body, 'PLACEHOLDER\nNext.\n');
  });
});
