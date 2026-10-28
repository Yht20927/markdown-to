const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const toolPath = path.join(__dirname, '..', 'index.js');

function runConvert(md) {
  const base = `/tmp/md-to-latex-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs.writeFileSync(`${base}.md`, md);
  execFileSync('node', [toolPath, 'convert', '-i', `${base}.md`, '-o', `${base}.tex`]);
  const result = fs.readFileSync(`${base}.tex`, 'utf8');
  fs.unlinkSync(`${base}.md`);
  fs.unlinkSync(`${base}.tex`);
  return result;
}

describe('md-to-latex P0 fixes', () => {
  it('should escape plain text without breaking math', () => {
    const out = runConvert('50% of C:\\Users\\name and snake_case_name and $x_i$ and \\$5\n\n$$\n\\sum_{i=1}^n i\n$$');
    assert.ok(out.includes('50\\%'), out);
    assert.ok(out.includes('C:\\textbackslash{}Users\\textbackslash{}name'), out);
    assert.ok(out.includes('snake\\_case\\_name'), out);
    assert.ok(out.includes('$x_i$'), out);
    assert.ok(out.includes('\\$5'), out);
    assert.ok(out.includes('\\[\n\\sum_{i=1}^n i\n\\]'), out);
    assert.ok(!out.includes('\\textbackslash{}sum'), out);
  });

  it('should keep inline code literal', () => {
    const out = runConvert('`C:\\Users\\_name` and `**not bold**` and `[x](http://y)`');
    assert.ok(out.includes('\\texttt{C:\\textbackslash{}Users\\textbackslash{}\\_name}'), out);
    assert.ok(out.includes('\\texttt{**not bold**}'), out);
    assert.ok(out.includes('\\texttt{[x](http://y)}'), out);
  });

  it('should format table cells and escaped pipes', () => {
    const out = runConvert('| A | B |\n|---|---|\n| **a** | c\\|d |');
    assert.ok(out.includes('\\textbf{a} & c\\textbar{}d'), out);
    assert.ok(out.includes('\\begin{tabular}'), out);
  });

  it('should emit valid listings language options', () => {
    const out = runConvert('```js\nconst x = 1;\n```');
    assert.ok(out.includes('\\begin{lstlisting}[language={js}]'), out);
    assert.ok(!out.includes('[language=js]'), out);
  });

  it('should map heading levels', () => {
    const out = runConvert('# A\n## B\n### C\n\n> ## Quote\n>\n> - bullet');
    assert.ok(out.includes('\\section{A}'), out);
    assert.ok(out.includes('\\subsection{B}'), out);
    assert.ok(out.includes('\\subsubsection{C}'), out);
    assert.ok(out.includes('\\begin{quote}'), out);
    assert.ok(out.includes('\\textbf{Quote}'), out);
    assert.ok(out.includes('\\begin{itemize}'), out);
  });

  it('should keep quoted code and display math inside the quote', () => {
    const out = runConvert('> ```js\n> const x = 1;\n> ```\n>\n> $$\n> a+b\n> $$');
    const start = out.indexOf('\\begin{quote}');
    const end = out.indexOf('\\end{quote}');
    assert.ok(start >= 0, out);
    assert.ok(out.indexOf('\\begin{lstlisting}') > start, out);
    assert.ok(out.indexOf('\\[\na+b\n\\]') > start, out);
    assert.ok(out.indexOf('\\begin{lstlisting}') < end, out);
    assert.ok(out.indexOf('\\[\na+b\n\\]') < end, out);
  });

  it('should join multiline list items', () => {
    const out = runConvert('- one\n  continuation\n   - nested\n1. first\n   more\n2. second');
    assert.ok(out.includes('\\item one continuation'), out);
    assert.ok(out.includes('\\begin{itemize}'), out);
    assert.ok(out.includes('\\item nested'), out);
    assert.ok(out.includes('\\item first more'), out);
  });

  it('should render links and footnotes', () => {
    const out = runConvert('[x](https://e.test) and note [^1]\n\n[^1]: 50%');
    assert.ok(out.includes('\\href{https://e.test}{x}'), out);
    assert.ok(out.includes('\\footnote{50\\%}'), out);
  });

  it('should render tables nested in blockquotes', () => {
    const out = runConvert('> | A | B |\n> |---|---|\n> | a | b |');
    const start = out.indexOf('\\begin{quote}');
    const end = out.indexOf('\\end{quote}');
    assert.ok(start >= 0, out);
    assert.ok(out.indexOf('\\begin{tabular}') > start, out);
    assert.ok(out.indexOf('\\begin{tabular}') < end, out);
    assert.ok(out.includes('A & B \\\\'), out);
    assert.ok(!out.includes('| A |'), out);
  });

  it('should keep > content inside fenced code', () => {
    const out = runConvert('```diff\n> old line\n< new line\n```');
    assert.ok(out.includes('> old line'), out);
  });

  it('should keep backslash-escaped markdown literals', () => {
    const out = runConvert('Price is \\$5 and \\*not italic\\*.');
    assert.ok(out.includes('Price is \\$5 and *not italic*.'), out);
  });

  it('should handle link destinations with parentheses and titles', () => {
    const out = runConvert('[wiki](https://en.wikipedia.org/wiki/Foo_(bar)) and [x](https://e.test/a "title")');
    assert.ok(out.includes('\\href{https://en.wikipedia.org/wiki/Foo_(bar)}{wiki}'), out);
    assert.ok(out.includes('\\href{https://e.test/a}{x}'), out);
    assert.ok(!out.includes('title'), out);
  });

  it('should handle image destinations with parentheses', () => {
    const out = runConvert('![alt](dir/pic_(1).png)');
    assert.ok(out.includes('\\includegraphics[width=\\linewidth]{dir/pic_(1).png}'), out);
  });

  it('should convert emphasis nested inside bold', () => {
    const out = runConvert('**bold with *italic* inside**');
    assert.ok(out.includes('\\textbf{bold with \\textit{italic} inside}'), out);
  });

  it('should keep nested lists together across blank lines', () => {
    const out = runConvert('- top\n\n  - nested a\n  - nested b\n\n- top2');
    assert.strictEqual((out.match(/\\begin\{itemize\}/g) || []).length, 2, out);
    assert.strictEqual((out.match(/\\end\{itemize\}/g) || []).length, 2, out);
    assert.ok(out.includes('\\item nested a'), out);
  });

  it('should decode HTML entities and email autolinks', () => {
    const out = runConvert('AT&amp;T and <a.b+c@example.co.uk>');
    assert.ok(out.includes('AT\\&T'), out);
    assert.ok(out.includes('\\url{a.b+c@example.co.uk}'), out);
    assert.ok(!out.includes('amp;'), out);
  });

  it('should strip closing hashes from headings', () => {
    assert.ok(runConvert('## Title ##').includes('\\subsection{Title}'));
  });

  it('should convert setext headings inside quotes to bold', () => {
    const out = runConvert('> Title\n> =====\n>\n> body');
    assert.ok(out.includes('\\textbf{Title}'), out);
    assert.ok(!out.includes('====='), out);
  });

  it('should not treat a rule after a list item as a setext heading', () => {
    const out = runConvert('- item\n---\n* next');
    assert.ok(out.includes('\\hrulefill'), out);
    assert.ok(!out.includes('\\subsection'), out);
  });

  it('should keep indented continuation paragraphs inside list items', () => {
    const out = runConvert('- item\n\n  continuation\n\n- next');
    assert.strictEqual((out.match(/\\begin\{itemize\}/g) || []).length, 1, out);
    assert.ok(out.includes('continuation'), out);
  });

  it('should not treat a rule after a code block as a setext heading', () => {
    const out = runConvert('```\ncode\n```\n---');
    assert.ok(out.includes('\\hrulefill'), out);
    assert.ok(!out.includes('\\subsection'), out);
  });

  it('should keep footnote continuation paragraphs in the note', () => {
    const out = runConvert('Text[^1].\n\n[^1]: First.\n\n    Second.');
    assert.ok(out.includes('\\footnote{First. Second.}'), out);
  });

  it('should keep word boundaries around HTML breaks and block tags', () => {
    assert.ok(runConvert('a<br>b and c</p><p>d').includes('a b and c d'));
  });

  it('should convert Markdown hard breaks', () => {
    const out = runConvert('line one  \nline two\n\nline three\\\nline four');
    assert.ok(out.includes('line one\\\\\nline two'), out);
    assert.ok(out.includes('line three\\\\\nline four'), out);
  });
});
