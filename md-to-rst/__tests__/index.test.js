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

  it('should size heading underline after inline markup restoration', () => {
    const rst = runConvert('# Inline `code` and $x_i$ and [ref](https://e.test)');
    const [title, underline] = rst.split('\n');
    assert.strictEqual(title, 'Inline ``code`` and :math:`x_i` and `ref <https://e.test>`_');
    assert.strictEqual(underline.length, title.length);
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
    const rst = runConvert('> ## Quote\n>\n> - bullet\n>\n> > nested\n>\n> ```js\n> const x = 1;\n> ```');
    assert.ok(rst.includes('    **Quote**'), rst);
    assert.ok(rst.includes('    - bullet'), rst);
    assert.ok(rst.includes('        nested'), rst);
    assert.ok(rst.includes('.. code:: js'), rst);
    assert.ok(rst.includes('   const x = 1;'), rst);
    assert.ok(!rst.includes('>'), rst);
  });

  it('should convert inline and display math', () => {
    const rst = runConvert('Inline $x_i$ and\n\n$$\n\\sum_{i=1}^n i\n$$');
    assert.ok(rst.includes(':math:`x_i`'), rst);
    assert.ok(rst.includes('.. math::'), rst);
    assert.ok(rst.includes('   \\sum_{i=1}^n i'), rst);
    assert.ok(!rst.includes('$$'), rst);
  });

  it('should convert tables nested in blockquotes', () => {
    const rst = runConvert('> | A | B |\n> |---|---|\n> | a | b |');
    assert.ok(rst.includes('    .. list-table::'), rst);
    assert.ok(rst.includes('       * - A'), rst);
    assert.ok(rst.includes('       * - a'), rst);
    assert.ok(rst.includes('          - b'), rst);
    assert.ok(!rst.includes('> |'), rst);
  });

  it('should keep > content inside fenced code', () => {
    const rst = runConvert('```diff\n> old line\n< new line\n```');
    assert.ok(rst.includes('> old line'), rst);
    assert.ok(!rst.includes('{quote}'), rst);
  });

  it('should strip only the quote level from quoted code content', () => {
    const rst = runConvert('> ```\n> > literal\n> ```');
    assert.ok(rst.includes('   > literal'), rst);
  });

  it('should convert same-line display math to an inline role', () => {
    const rst = runConvert('Inline $$y_i$$ math');
    assert.ok(rst.includes(':math:`y_i`'), rst);
    assert.ok(!rst.includes('$$'), rst);
  });

  it('should handle link destinations with parentheses and titles', () => {
    const rst = runConvert('[wiki](https://en.wikipedia.org/wiki/Foo_(bar)) and [x](https://e.test/a "title")');
    assert.ok(rst.includes('`wiki <https://en.wikipedia.org/wiki/Foo_(bar)>`_'), rst);
    assert.ok(rst.includes('`x <https://e.test/a>`_'), rst);
    assert.ok(!rst.includes('title'), rst);
  });

  it('should handle image destinations with parentheses', () => {
    const rst = runConvert('![alt](dir/pic_(1).png)');
    assert.ok(rst.includes('.. image:: dir/pic_(1).png'), rst);
  });

  it('should decode HTML entities and email autolinks', () => {
    const rst = runConvert('AT&amp;T &lt;x&gt; <a.b+c@example.co.uk>');
    assert.ok(rst.includes('AT&T <x> a.b+c@example.co.uk'), rst);
    assert.ok(!rst.includes('&amp;'), rst);
  });

  it('should strip closing hashes from headings', () => {
    const rst = runConvert('## Title ##');
    assert.ok(rst.includes('Title\n-----'), rst);
    assert.ok(!rst.includes('##'), rst);
  });

  it('should convert setext headings inside quotes to bold', () => {
    const rst = runConvert('> Title\n> =====\n>\n> body');
    assert.ok(rst.includes('    **Title**'), rst);
    assert.ok(!rst.includes('====='), rst);
  });

  it('should keep footnote continuation paragraphs in the note', () => {
    const rst = runConvert('Text[^1].\n\n[^1]: First.\n\n    Second.');
    assert.ok(rst.includes('.. [#1] First. Second.'), rst);
    assert.ok(!/^\s+Second/m.test(rst), rst);
  });
});
