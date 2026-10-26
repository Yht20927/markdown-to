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
});
