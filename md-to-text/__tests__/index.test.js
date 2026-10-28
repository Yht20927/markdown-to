/**
 * Tests for md-to-text P0 fixes
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const toolPath = path.join(__dirname, '..', 'index.js');

function runConvert(md) {
  const inFile = `/tmp/md-to-text-test-${Date.now()}.md`;
  const outFile = `/tmp/md-to-text-test-${Date.now()}.txt`;
  fs.writeFileSync(inFile, md);
  execSync(`node "${toolPath}" convert -i "${inFile}" -o "${outFile}"`, { encoding: 'utf8' });
  const result = fs.readFileSync(outFile, 'utf8');
  fs.unlinkSync(inFile);
  fs.unlinkSync(outFile);
  return result;
}

describe('md-to-text P0 fixes', () => {
  it('should not leave ! residue from images (P0-11)', () => {
    const text = runConvert('![x](u.png) [link](url)');
    assert.ok(!text.includes('!'), `Output should not contain '!': ${text}`);
    assert.ok(text.includes('link'));
  });

  it('should protect code block content from formatting strips (P0-12)', () => {
    const md = '```\n**not bold**\n```';
    const text = runConvert(md);
    assert.ok(text.includes('**not bold**'), `Code block content should be preserved: ${text}`);
  });

  it('should protect inline code from formatting strips (P0-12)', () => {
    const text = runConvert('This `**not bold**` is code');
    assert.ok(text.includes('**not bold**'), `Inline code content should be preserved: ${text}`);
  });

  it('should handle images before links correctly', () => {
    const text = runConvert('![img](a.png) [link](url)');
    assert.ok(text.includes('link'));
    assert.ok(!text.includes('!'));
    assert.ok(!text.includes('img'));
    assert.ok(!text.includes('a.png'));
  });
  it('should preserve snake_case identifiers and inline math', () => {
    const text = runConvert('name is snake_case_name and $x_i$');
    assert.ok(text.includes('snake_case_name'), text);
    assert.ok(text.includes('x_i'), text);
  });

  it('should preserve ordered list numbers and nested bullets', () => {
    const text = runConvert('1. first\n2. second\n\n- one\n  - nested');
    assert.ok(text.includes('1. first'), text);
    assert.ok(text.includes('2. second'), text);
    assert.ok(text.includes('  • nested'), text);
  });

  it('should render GFM tables as readable rows', () => {
    const text = runConvert('| A | B |\n|---|:--:|\n| a | b |');
    assert.ok(text.includes('A | B'), text);
    assert.ok(text.includes('a | b'), text);
    assert.ok(!text.includes('---'), text);
  });

  it('should replace footnote references and append definitions', () => {
    const text = runConvert('Text [^1]\n\n[^1]: note');
    assert.ok(text.includes('Text [1]'), text);
    assert.ok(text.includes('[1] note'), text);
  });

  it('should strip all quote markers from nested quoted code and text', () => {
    const text = runConvert('> > quoted text\n>\n> > ```js\n> > const x = 1;\n> > ```\n>\n> tail');
    assert.ok(text.includes('quoted text'), text);
    assert.ok(text.includes('const x = 1;'), text);
    assert.ok(text.includes('tail'), text);
    assert.ok(!text.includes('>'), text);
  });

  it('should keep > content inside fenced code', () => {
    const text = runConvert('```diff\n> old line\n< new line\n```');
    assert.ok(text.includes('> old line'), text);
  });

  it('should strip only the quote level from quoted code content', () => {
    const text = runConvert('> ```\n> > literal\n> ```');
    assert.ok(text.includes('> literal'), text);
  });

  it('should keep backslash-escaped markdown literals', () => {
    const text = runConvert('Price is \\$5 and \\*not italic\\* and \\[not a link\\].');
    assert.ok(text.includes('Price is $5 and *not italic* and [not a link].'), text);
  });

  it('should handle link destinations with parentheses and titles', () => {
    const text = runConvert('[wiki](https://en.wikipedia.org/wiki/Foo_(bar)) and [x](https://e.test/a "title").');
    assert.ok(text.includes('wiki and x.'), text);
  });

  it('should flatten emphasis nested inside bold', () => {
    const text = runConvert('**bold with *italic* inside**');
    assert.strictEqual(text.trim(), 'bold with italic inside');
  });

  it('should strip heading markers inside blockquotes', () => {
    const text = runConvert('> ## Quoted heading\n>\n> body');
    assert.ok(text.includes('Quoted heading'), text);
    assert.ok(!text.includes('##'), text);
  });

  it('should decode HTML entities and email autolinks', () => {
    const text = runConvert('AT&amp;T &lt;x&gt; <a.b+c@example.co.uk>');
    assert.ok(text.includes('AT&T <x> a.b+c@example.co.uk'), text);
    assert.ok(!text.includes('&amp;'), text);
  });

  it('should strip closing hashes from headings', () => {
    assert.strictEqual(runConvert('## Title ##').trim(), 'Title');
  });

  it('should keep footnote continuation paragraphs in the note', () => {
    const text = runConvert('Text[^1].\n\n[^1]: First.\n\n    Second.');
    assert.ok(text.includes('[1] First. Second.'), text);
    assert.ok(!/^\s+Second/m.test(text), text);
  });
});
