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

  it('should convert reference links and footnote references', () => {
    const out = runConvert('[ref][id] and note [^1]\n\n[id]: https://example.com\n[^1]: foot');
    assert.ok(out.includes('[ref|https://example.com]'), out);
    assert.ok(out.includes('[fn:1]'), out);
    assert.ok(!out.includes('[id]:'), out);
  });
});
