const { describe, it } = require('node:test');
const assert = require('node:assert');
const { layoutToMarkdown, cleanExtractedText } = require('../layout');

const styles = {
  sans: { fontFamily: 'sans-serif' },
  bold: { fontFamily: 'sans-serif' },
  serif: { fontFamily: 'serif' },
  mono: { fontFamily: 'monospace' },
};

function item(str, x, y, height = 9, fontName = 'sans') {
  return { str, transform: [1, 0, 0, 1, x, y], width: str.length * height * 0.55, height, fontName };
}

function page(items) {
  return { items, styles };
}

describe('pdf-to-md layout', () => {
  it('reconstructs headings, paragraphs, lists, tables and code', () => {
    const items = [
      item('1 / 1', 540, 17, 5, 'sans'),
      item('Report Title', 42, 750, 12, 'bold'),
      item('First paragraph', 42, 720),
      item('continues here', 42, 706),
      item('Section', 42, 680, 10.5, 'bold'),
      item('alpha', 60, 650),
      item('beta', 60, 630),
      item('A', 52, 600, 9, 'bold'),
      item('B', 307, 600, 9, 'bold'),
      item('1', 52, 570),
      item('2', 307, 570),
      item('js', 538, 540, 5.5, 'mono'),
      item('const x = 1;', 52, 532, 7.5, 'mono'),
      item('Quote line', 57, 500),
      item('continues here', 57, 482),
    ];
    const markdown = layoutToMarkdown([page(items)]);
    assert.match(markdown, /^# Report Title/m);
    assert.ok(markdown.includes('First paragraph continues here'), markdown);
    assert.match(markdown, /^## Section/m);
    assert.ok(markdown.includes('- alpha\n- beta'), markdown);
    assert.ok(markdown.includes('| A | B |'), markdown);
    assert.ok(markdown.includes('| 1 | 2 |'), markdown);
    assert.ok(markdown.includes('```js\nconst x = 1;\n```'), markdown);
    assert.ok(markdown.includes('> Quote line\n> continues here'), markdown);
    assert.ok(!markdown.includes('1 / 1'), markdown);
  });

  it('does not treat CJK fonts reported as monospace as code', () => {
    const items = [
      item('中文标题', 42, 750, 15, 'mono'),
      item('这是正文内容。', 42, 720, 9, 'mono'),
    ];
    const markdown = layoutToMarkdown([page(items)]);
    assert.match(markdown, /^# 中文标题/m);
    assert.ok(markdown.includes('这是正文内容。'), markdown);
    assert.ok(!markdown.includes('```'), markdown);
  });

  it('cleans page-number-only lines from fallback text', () => {
    assert.strictEqual(cleanExtractedText('\n1 / 2\nHello\n\n2 / 2\n'), 'Hello');
  });
});
