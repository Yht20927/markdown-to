const test = require('node:test');
const assert = require('node:assert/strict');
const { Marked } = require('marked');
const katex = require('katex');
const hljs = require('highlight.js');
const { createRenderer, inlineLocalImages } = require('../html-renderer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { renderMarkdown } = createRenderer({ Marked, katex, hljs });
const { renderMarkdown: renderTexMath } = createRenderer({ Marked, katex, hljs, mathMode: 'tex' });

test('html-renderer: renders inline and display math', () => {
  const html = renderMarkdown('inline $x_i$ math\n\n$$\n\\sum_{i=1}^n i\n$$\n');
  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-display"/);
  assert.doesNotMatch(html, /IM:0|BM:0/);
});

test('html-renderer: tex math mode preserves readable source', () => {
  const html = renderTexMath('inline $x_i$ math\n\n$$\n\\sum_{i=1}^n i\n$$\n');
  assert.match(html, /class="math math-inline">x_i</);
  assert.match(html, /class="math math-display">/);
  assert.doesNotMatch(html, /class="katex"/);
});

test('html-renderer: does not treat currency as math', () => {
  const html = renderMarkdown('Price is $5 and $10, or $5.00 total.');
  assert.doesNotMatch(html, /class="katex"/);
  assert.match(html, /\$5 and \$10/);
});

test('html-renderer: escaped dollars and code spans are not math', () => {
  const html = renderMarkdown('escaped \\$5 and `$x$` and ``a ` b``');
  assert.doesNotMatch(html, /class="katex"/);
  assert.match(html, /<code>\$x\$<\/code>/);
  assert.match(html, /<code>a ` b<\/code>/);
});

test('html-renderer: math inside code fences is not processed', () => {
  const html = renderMarkdown('```js\nconst x = "$not math$";\n```\n');
  assert.doesNotMatch(html, /class="katex"/);
  assert.match(html, /<pre data-lang="js"><code class="language-js">/);
  assert.match(html, /hljs-string/);
  assert.match(html, /\$not math\$/);
});

test('html-renderer: blockquote and list code fences are preserved', () => {
  const html = renderMarkdown('> ```js\n> const y = "$not math$";\n> ```\n\n- item\n\n  ```js\n  const z = "$not math$";\n  ```\n');
  assert.doesNotMatch(html, /class="katex"/);
  assert.match(html, /<blockquote>[\s\S]*<pre data-lang="js"><code/);
  assert.match(html, /<li><p>item<\/p>[\s\S]*<pre data-lang="js"><code/);
});

test('html-renderer: literal placeholder-like text is preserved', () => {
  const html = renderMarkdown('User <!--IM:0--> stays.');
  assert.match(html, /User <!--IM:0--> stays\./);
});

test('html-renderer: tilde fences are protected from math', () => {
  const html = renderMarkdown('~~~js\nconst a = "$not math$";\n~~~\n');
  assert.doesNotMatch(html, /class="katex"/);
  assert.match(html, /<pre data-lang="js"><code class="language-js">/);
});

test('html-renderer: exposes code language for styling', () => {
  const html = renderMarkdown('```js\nconst a = 1;\n```\n');
  assert.match(html, /<pre data-lang="js"><code class="language-js">/);
});

test('html-renderer: inlines local images and leaves remote ones alone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-img-'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4xoAAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(path.join(dir, 'p.png'), png);
  const html = '<p><img src="p.png" alt="x"><img src="https://e.test/x.png" alt="r"></p>';
  const out = inlineLocalImages(html, dir);
  assert.match(out, /src="data:image\/png;base64,/);
  assert.match(out, /src="https:\/\/e\.test\/x\.png"/);
  fs.rmSync(dir, { recursive: true, force: true });
});
