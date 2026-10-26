const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createTurndown } = require('../turndown-factory');

function convert(html) {
  return createTurndown().turndown(html);
}

describe('turndown-factory P0 fixes', () => {
  it('should drop head, script and style content', () => {
    const md = convert('<html><head><title>T</title><style>.x{}</style><script>alert(1)</script></head><body><h1>Hi</h1><script>bad()</script><style>p{}</style></body></html>');
    assert.ok(md.includes('# Hi'), md);
    assert.ok(!md.includes('T'), md);
    assert.ok(!md.includes('.x{}'), md);
    assert.ok(!md.includes('alert(1)'), md);
    assert.ok(!md.includes('bad()'), md);
    assert.ok(!md.includes('p{}'), md);
  });

  it('should preserve inline formatting in table cells', () => {
    const md = convert('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><strong>x</strong></td><td><a href="https://e.test">link</a></td></tr></tbody></table>');
    assert.ok(md.includes('| **x** | [link](https://e.test) |'), md);
  });

  it('should escape pipes and convert breaks in table cells', () => {
    const md = convert('<table><tr><th>A|B</th><th>C</th></tr><tr><td>1<br>2</td><td>c</td></tr></table>');
    assert.ok(md.includes('| A\\|B | C |'), md);
    assert.ok(md.includes('| 1<br>2 | c |'), md);
    assert.ok(!md.includes('| 1  <br>2 |'), md);
  });

  it('should handle rows directly under table', () => {
    const md = convert('<table><tr><th>H</th></tr><tr><td>v</td></tr></table>');
    assert.ok(md.includes('| H |'), md);
    assert.ok(md.includes('| v |'), md);
  });
});

describe('turndown-factory HTML round-trip extensions', () => {
  it('restores KaTeX source instead of duplicating rendered text', () => {
    const md = convert('<p>Value <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x_i</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">xi</span></span>.</p><span class="katex-display"><span class="katex"><annotation encoding="application/x-tex">\\frac{1}{2}</annotation><span class="katex-html">12</span></span></span>');
    assert.ok(md.includes('Value $x_i$.'), md);
    assert.ok(md.includes('$$\n\\frac{1}{2}\n$$'), md);
    assert.ok(!md.includes('katex'), md);
  });

  it('restores TeX source from math-inline and math-display markup', () => {
    const md = convert('<p>Value <span class="math math-inline">x_i</span>.</p><div class="math math-display">\\sum_{i=1}^n i</div>');
    assert.ok(md.includes('Value $x_i$.'), md);
    assert.ok(md.includes('$$\n\\sum_{i=1}^n i\n$$'), md);
  });

  it('preserves task list checkboxes and strikethrough', () => {
    const md = convert('<p><del>gone</del></p><ul><li><input checked disabled type="checkbox"> done</li><li><input disabled type="checkbox"> todo</li></ul>');
    assert.ok(md.includes('~~gone~~'), md);
    assert.ok(md.includes('[x] done'), md);
    assert.ok(md.includes('[ ] todo'), md);
  });

  it('preserves table column alignment', () => {
    const md = convert('<table><thead><tr><th align="left">L</th><th style="text-align:center">C</th><th align="right">R</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>');
    assert.ok(md.includes('| :--- | :---: | ---: |'), md);
  });

  it('reads alignment classes emitted by Word styles', () => {
    const md = convert('<table><tr><th><p class="table-align-center">C</p></th><th><p class="table-align-right">R</p></th></tr><tr><td>1</td><td>2</td></tr></table>');
    assert.ok(md.includes('| :---: | ---: |'), md);
  });

  it('converts pre elements without nested code tags to fenced blocks', () => {
    const md = convert('<pre class="language-js">const x = 1;<br>console.log(x);</pre>');
    assert.ok(md.includes('```js\nconst x = 1;\nconsole.log(x);\n```'), md);

    const nestedFence = convert('<pre>```<br>code</pre>');
    assert.ok(nestedFence.includes('````\n```\ncode\n````'), nestedFence);
  });
});
