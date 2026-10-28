/**
 * Tests for shared/entities.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { decodeEntities } = require('../entities');

describe('entities', () => {
  it('should decode named entities', () => {
    assert.strictEqual(decodeEntities('AT&amp;T &lt;x&gt; &quot;q&quot; &apos;a&apos;'), 'AT&T <x> "q" \'a\'');
  });

  it('should decode numeric and hex entities', () => {
    assert.strictEqual(decodeEntities('&#65;&#x42;&#169;'), 'AB©');
  });

  it('should decode only one level', () => {
    assert.strictEqual(decodeEntities('&amp;lt;'), '&lt;');
  });

  it('should leave unknown entities untouched', () => {
    assert.strictEqual(decodeEntities('&bogus; &#x110000;'), '&bogus; &#x110000;');
  });
});
