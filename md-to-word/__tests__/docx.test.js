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

  it('embeds images referenced by data URI', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const buffer = await markdownToDocx(`![dot](data:image/png;base64,${png})`, { title: 'Image' });
    const zip = await JSZip.loadAsync(buffer);
    assert.ok(Object.keys(zip.files).some((name) => name.startsWith('word/media/')));
    const document = await zip.file('word/document.xml').async('string');
    assert.match(document, /w:drawing/);
  });
});
