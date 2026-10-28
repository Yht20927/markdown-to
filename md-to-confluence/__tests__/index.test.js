const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const toolPath = path.join(__dirname, '..', 'index.js');

function runConvert(md) {
  const base = `/tmp/md-to-confluence-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs.writeFileSync(`${base}.md`, md);
  execFileSync('node', [toolPath, 'convert', '-i', `${base}.md`, '-o', `${base}.txt`]);
  const result = fs.readFileSync(`${base}.txt`, 'utf8');
  fs.unlinkSync(`${base}.md`);
  fs.unlinkSync(`${base}.txt`);
  return result;
}

describe('md-to-confluence P0 fixes', () => {
  it('should convert GFM tables to Confluence tables', () => {
    const out = runConvert('| A | B |\n|---|---|\n| a | b |');
    assert.match(out, /\|\|A\|\|B\|\|/);
    assert.match(out, /\|a\|b\|/);
    assert.doesNotMatch(out, /\|---\|/);
  });

  it('should protect inline code from bold/link rewriting', () => {
    const out = runConvert('`**not bold**` and `[x](http://y)` and `snake_case`');
    assert.ok(out.includes('{{**not bold**}}'), out);
    assert.ok(out.includes('{{[x](http://y)}}'), out);
    assert.ok(out.includes('{{snake_case}}'), out);
    assert.ok(!out.includes('[*x*|http://y]'), out);
  });

  it('should render bold, italic and strikethrough', () => {
    const out = runConvert('***both*** **bold** __bold2__ _italic_ ~~strike~~');
    assert.ok(out.includes('*_both_*'), out);
    assert.ok(out.includes('*bold*'), out);
    assert.ok(out.includes('*bold2*'), out);
    assert.ok(out.includes('_italic_'), out);
    assert.ok(out.includes('-strike-'), out);
  });

  it('should keep blockquote code out of bq. lines', () => {
    const out = runConvert('> ```js\n> const x = 1;\n> ```');
    assert.ok(out.includes('{code:language=js}'), out);
    assert.ok(out.includes('const x = 1;'), out);
    assert.ok(!out.includes('bq. {code'), out);
  });

  it('should not break table cells that contain links', () => {
    const out = runConvert('| A | B |\n|---|---|\n| [x](https://e.test/a) | `c` |');
    assert.ok(out.includes('|[x|https://e.test/a]|{{c}}|'), out);
  });

  it('should escape pipes inside inline code in table cells', () => {
    const out = runConvert('| A | B |\n|---|---|\n| `a|b` | `c` |\n\n`x|y`');
    assert.ok(out.includes('|{{a\\|b}}|{{c}}|'), out);
    assert.ok(out.includes('{{x|y}}'), out);
  });

  it('should preserve nested blockquotes and their block structure', () => {
    const out = runConvert('> ## Quote\n>\n> - bullet\n>   - nested\n>\n> > deep');
    assert.ok(out.includes('{quote}\nh2. Quote\n\n* bullet\n** nested'), out);
    assert.ok(out.includes('{quote}\ndeep\n{quote}'), out);
    assert.ok(!out.includes('bq. '), out);
  });

  it('should keep blank lines before lists', () => {
    const out = runConvert('## A\n\n- b');
    assert.ok(out.includes('h2. A\n\n* b'), out);
  });

  it('should convert reference links and footnote references', () => {
    const out = runConvert('[ref][id] and note [^1]\n\n[id]: https://example.com\n[^1]: foot');
    assert.ok(out.includes('[ref|https://example.com]'), out);
    assert.ok(out.includes('[fn:1]'), out);
    assert.ok(!out.includes('[id]:'), out);
  });

  it('should keep > content inside fenced code', () => {
    const out = runConvert('```diff\n> old line\n< new line\n```');
    assert.ok(out.includes('> old line'), out);
    assert.ok(!out.includes('{quote}'), out);
  });

  it('should keep backslash-escaped markdown literals', () => {
    const out = runConvert('\\*not bold\\* and \\_not italic\\_');
    assert.ok(out.includes('\\*not bold\\*'), out);
    assert.ok(out.includes('\\_not italic\\_'), out);
  });

  it('should handle link destinations with parentheses and titles', () => {
    const out = runConvert('[wiki](https://en.wikipedia.org/wiki/Foo_(bar)) and [x](https://e.test/a "title")');
    assert.ok(out.includes('[wiki|https://en.wikipedia.org/wiki/Foo_(bar)]'), out);
    assert.ok(out.includes('[x|https://e.test/a]'), out);
    assert.ok(!out.includes('title'), out);
  });

  it('should convert emphasis nested inside bold', () => {
    const out = runConvert('**bold with *italic* inside**');
    assert.ok(out.includes('*bold with _italic_ inside*'), out);
  });

  it('should decode HTML entities and email autolinks', () => {
    const out = runConvert('AT&amp;T &lt;x&gt; <a.b+c@example.co.uk>');
    assert.ok(out.includes('AT&T <x> a.b+c@example.co.uk'), out);
    assert.ok(!out.includes('&amp;'), out);
  });

  it('should keep lines after a nested quote on separate lines', () => {
    const out = runConvert('> outer\n> > inner\n> outer again');
    assert.ok(out.includes('{quote}\ninner\n{quote}\nouter again'), out);
  });

  it('should strip closing hashes from headings', () => {
    assert.strictEqual(runConvert('## Title ##').trim(), 'h2. Title');
  });

  it('should not treat a rule after a list item as a setext heading', () => {
    const out = runConvert('- item\n---\n* next');
    assert.ok(out.includes('----'), out);
    assert.ok(!out.includes('h2.'), out);
  });

  it('should not treat a rule after a code block as a setext heading', () => {
    const out = runConvert('```\ncode\n```\n---');
    assert.ok(out.includes('----'), out);
    assert.ok(!out.includes('h2.'), out);
  });

  it('should keep footnote continuation paragraphs in the note', () => {
    const out = runConvert('Text[^1].\n\n[^1]: First.\n\n    Second.');
    assert.ok(out.includes('[fn:1] First. Second.'), out);
    assert.ok(!/^\s+Second/m.test(out), out);
  });
});
