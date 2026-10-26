const { describe, it } = require('node:test');
const assert = require('node:assert');
const JSZip = require('jszip');
const { markdownToDocx } = require('../docx');

describe('md-to-word docx', () => {
  it('emits OOXML headings, tables, links, and lists', async () => {
    const buffer = await markdownToDocx([
      '# Title',
      '',
      '**bold** and [link](https://example.com)',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
    ].join('\n'), { title: 'Test' });

    assert.strictEqual(buffer.subarray(0, 2).toString(), 'PK');
    const zip = await JSZip.loadAsync(buffer);
    assert.ok(zip.file('[Content_Types].xml'));
    const document = await zip.file('word/document.xml').async('string');
    assert.match(document, /Title/);
    assert.match(document, /w:tbl/);
    assert.match(document, /w:hyperlink/);
    assert.match(document, /w:numPr/);
    const numbering = await zip.file('word/numbering.xml').async('string');
    assert.match(numbering, /w:numFmt w:val="decimal"/);
    assert.match(numbering, /w:numFmt w:val="bullet"/);
  });

  it('emits semantic styles for inline and block code', async () => {
    const buffer = await markdownToDocx('Text `code`\n\n```js\nconst x = 1;\n```', { title: 'Code' });
    const zip = await JSZip.loadAsync(buffer);
    const document = await zip.file('word/document.xml').async('string');
    const styles = await zip.file('word/styles.xml').async('string');
    assert.match(document, /w:rStyle w:val="CodeChar"/);
    assert.match(document, /w:pStyle w:val="CodeBlock"/);
    assert.match(styles, /w:styleId="CodeChar"/);
    assert.match(styles, /w:styleId="CodeBlock"/);
  });

  it('emits quote and table alignment styles', async () => {
    const buffer = await markdownToDocx('> Quote\n>\n> ## Quote heading\n>\n> ```js\n> const x = 1;\n> ```\n>\n> - quoted one\n> - quoted two\n>\n> 1. ordered quote\n\n| L | C | R |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |', { title: 'Styles' });
    const zip = await JSZip.loadAsync(buffer);
    const document = await zip.file('word/document.xml').async('string');
    const styles = await zip.file('word/styles.xml').async('string');
    assert.match(document, /w:pStyle w:val="Quote"/);
    assert.match(document, /w:pStyle w:val="QuoteCode"/);
    assert.match(document, /w:pStyle w:val="QuoteHeading2"/);
    assert.match(document, /w:pStyle w:val="QuoteBullet1"/);
    assert.match(document, /w:pStyle w:val="QuoteNumber1"/);
    assert.match(document, /w:pStyle w:val="TableAlignCenter"/);
    assert.match(styles, /w:styleId="Quote"/);
    assert.match(styles, /w:styleId="QuoteCode"/);
    assert.match(styles, /w:styleId="QuoteHeading2"/);
    assert.match(styles, /w:styleId="QuoteBullet1"/);
    assert.match(styles, /w:styleId="QuoteNumber1"/);
    assert.match(styles, /w:styleId="TableAlignCenter"/);
  });

  it('emits inline and display math styles without touching currency or code', async () => {
    const buffer = await markdownToDocx('Inline $x_i$ and price $5 and $10.\n\n$$\n\\sum_{i=1}^n i\n$$\n\n```js\nconst x = "$no$";\n```', { title: 'Math' });
    const zip = await JSZip.loadAsync(buffer);
    const document = await zip.file('word/document.xml').async('string');
    const styles = await zip.file('word/styles.xml').async('string');
    assert.match(document, /w:rStyle w:val="InlineMath"/);
    assert.match(document, /w:pStyle w:val="MathBlock"/);
    assert.match(document, /price \$5 and \$10\./);
    assert.match(document, /const x = &quot;\$no\$&quot;;/);
    assert.match(styles, /w:styleId="InlineMath"/);
    assert.match(styles, /w:styleId="MathBlock"/);
  });

  it('embeds images referenced by data URI', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const buffer = await markdownToDocx(`![dot](data:image/png;base64,${png})`, { title: 'Image' });
    const zip = await JSZip.loadAsync(buffer);
    assert.ok(Object.keys(zip.files).some((name) => name.startsWith('word/media/')));
    const document = await zip.file('word/document.xml').async('string');
    assert.match(document, /w:drawing/);
  });
});
