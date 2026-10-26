/**
 * Tests for md-to-rst P0 fixes
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const toolPath = path.join(__dirname, '..', 'index.js');

function runConvert(md) {
  const inFile = `/tmp/md-to-rst-test-${Date.now()}.md`;
  const outFile = `/tmp/md-to-rst-test-${Date.now()}.rst`;
  fs.writeFileSync(inFile, md);
  execSync(`node "${toolPath}" convert -i "${inFile}" -o "${outFile}"`, { encoding: 'utf8' });
  const result = fs.readFileSync(outFile, 'utf8');
  fs.unlinkSync(inFile);
  fs.unlinkSync(outFile);
  return result;
}

describe('md-to-rst P0 fixes', () => {
  it('should match heading underline length to text (P0-13)', () => {
    const rst = runConvert('## LongHeading\n');
    const lines = rst.split('\n');
    const titleLine = lines[0]; // "LongHeading"
    const underline = lines[1]; // "==========="
    assert.strictEqual(underline.length, titleLine.length);
    assert.strictEqual(underline[0], '-');
  });

  it('should use # prefix in footnote definitions (P0-14)', () => {
    const rst = runConvert('[^1]: This is a footnote\n\nSome text [^1]');
    // Footnote definition should have [#1]
    assert.ok(rst.includes('[#1]'), `Expected [#1] in: ${rst}`);
    // Footnote reference should also have [#1]
    assert.ok(rst.includes('[#1]_'), `Expected [#1]_ in: ${rst}`);
  });

  it('should handle short heading underline correctly', () => {
    const rst = runConvert('### Hi\n');
    const lines = rst.split('\n');
    const underline = lines[1];
    assert.strictEqual(underline.length, 2);
    assert.strictEqual(underline, '~~');
  });
  it('should convert GFM tables to a valid list-table', () => {
    const rst = runConvert('| A | B |\n|---|---|\n| a | b |');
    assert.ok(rst.includes('.. list-table::'), rst);
    assert.ok(rst.includes(':header-rows: 1'), rst);
    assert.ok(rst.includes('* - A'), rst);
    assert.ok(!rst.includes('|---|'), rst);
  });

  it('should not apply inline/link rules inside code spans', () => {
    const rst = runConvert('`[x](http://y)` and `snake_case_name`');
    assert.ok(rst.includes('``[x](http://y)``'), rst);
    assert.ok(rst.includes('``snake_case_name``'), rst);
    assert.ok(!rst.includes('`x <http://y>`_'), rst);
  });

  it('should convert reference links and underscore emphasis', () => {
    const rst = runConvert('_italic_ and [ref][id]\n\n[id]: https://example.com');
    assert.ok(rst.includes('*italic*'), rst);
    assert.ok(rst.includes('`ref <https://example.com>`_'), rst);
    assert.ok(!rst.includes('[id]:'), rst);
  });

  it('should keep blockquote code as an indented code directive', () => {
    const rst = runConvert('> ```js\n> const x = 1;\n> ```');
    assert.ok(rst.includes('.. code:: js'), rst);
    assert.ok(rst.includes('   const x = 1;'), rst);
    assert.ok(!rst.includes('>'), rst);
  });
});
