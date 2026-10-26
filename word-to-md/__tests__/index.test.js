const { describe, it } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { markdownToDocx } = require('../../md-to-word/docx');

const cli = path.join(__dirname, '..', 'index.js');

describe('word-to-md CLI', () => {
  it('restores inline and fenced code from docx styles', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-to-md-'));
    const input = path.join(dir, 'input.docx');
    const output = path.join(dir, 'output.md');
    try {
      fs.writeFileSync(input, await markdownToDocx('Text `code`\n\n```js\nconst x = 1;\n```', { title: 'Code' }));
      const result = spawnSync(process.execPath, [cli, 'convert', '-i', input, '-o', output], { encoding: 'utf-8' });
      assert.strictEqual(result.status, 0, result.stderr);
      const md = fs.readFileSync(output, 'utf-8');
      assert.ok(md.includes('Text `code`'), md);
      assert.ok(md.includes('```\nconst x = 1;\n```'), md);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('restores inline and display math without escaping TeX', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-to-md-'));
    const input = path.join(dir, 'input.docx');
    const output = path.join(dir, 'output.md');
    try {
      fs.writeFileSync(input, await markdownToDocx('Inline $x_i$ and $\\frac{1}{2}$.\n\n$$\n\\sum_{i=1}^n i\n$$\n', { title: 'Math' }));
      const result = spawnSync(process.execPath, [cli, 'convert', '-i', input, '-o', output], { encoding: 'utf-8' });
      assert.strictEqual(result.status, 0, result.stderr);
      const md = fs.readFileSync(output, 'utf-8');
      assert.ok(md.includes('Inline $x_i$ and $\\frac{1}{2}$.'), md);
      assert.ok(md.includes('$$\n\\sum_{i=1}^n i\n$$'), md);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('restores tasks, quotes, and table alignment', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-to-md-'));
    const input = path.join(dir, 'input.docx');
    const output = path.join(dir, 'output.md');
    try {
      fs.writeFileSync(input, await markdownToDocx([
        '- [x] done',
        '- [ ] todo',
        '',
        '> Quote line',
        '>',
        '> Second paragraph',
        '>',
        '> ## Quote heading',
        '>',
        '> - quoted one',
        '> - quoted two',
        '>   - quoted nested',
        '>     1. quoted nested ordered',
        '>',
        '> 1. quoted ordered',
        '>    1. quoted ordered nested',
        '>',
        '> ```js',
        '> const x = 1;',
        '> ```',
        '',
        '| L | C | R |',
        '| :--- | :---: | ---: |',
        '| 1 | 2 | 3 |',
      ].join('\n'), { title: 'Features' }));
      const result = spawnSync(process.execPath, [cli, 'convert', '-i', input, '-o', output], { encoding: 'utf-8' });
      assert.strictEqual(result.status, 0, result.stderr);
      const md = fs.readFileSync(output, 'utf-8');
      assert.ok(md.includes('[x] done'), md);
      assert.ok(md.includes('[ ] todo'), md);
      assert.ok(md.includes('> Quote line\n> \n> Second paragraph'), md);
      assert.ok(md.includes('> ## Quote heading'), md);
      assert.match(md, /> \*\s+quoted one\n> \*\s+quoted two\n> +\*\s+quoted nested\n> +1\.\s+quoted nested ordered/);
      assert.match(md, /> 1\.\s+quoted ordered\n> +1\.\s+quoted ordered nested/);
      assert.ok(md.includes('> ```\n> const x = 1;\n> ```'), md);
      assert.ok(md.includes('| :--- | :---: | ---: |'), md);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
