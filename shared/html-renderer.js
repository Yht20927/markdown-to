const fs = require('fs');
const path = require('path');
const { make, assertAllRestored } = require('./placeholders');

const imageMimeByExt = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon'
};

/**
 * Inline local <img> sources as data URIs. Chrome's about:blank documents do
 * not reliably load file:// subresources even with a <base> tag.
 */
function inlineLocalImages(html, baseDir) {
  if (!baseDir) return html;
  return html.replace(/<img\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>/gi, (match, before, quote, src, after) => {
    if (/^(?:data:|https?:|\/\/|file:|blob:|#)/i.test(src)) return match;
    let clean = src.replace(/&amp;/g, '&').split(/[?#]/)[0];
    try { clean = decodeURIComponent(clean); } catch { /* keep raw */ }
    const filePath = path.resolve(baseDir, clean);
    let stat;
    try { stat = fs.statSync(filePath); } catch { return match; }
    if (!stat.isFile()) return match;
    const mime = imageMimeByExt[path.extname(filePath).toLowerCase()];
    if (!mime) return match;
    try {
      const data = fs.readFileSync(filePath).toString('base64');
      return `<img${before}src=${quote}data:${mime};base64,${data}${quote}${after}>`;
    } catch {
      return match;
    }
  });
}

function createRenderer({ Marked, katex, hljs, mathMode = 'katex' }) {
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderKatex(tex, displayMode) {
    if (mathMode === 'tex') {
      const source = escapeHtml(tex.trim());
      return displayMode
        ? `<div class="math math-display">${source}</div>`
        : `<span class="math math-inline">${source}</span>`;
    }
    try {
      return katex.renderToString(tex.trim(), { displayMode, throwOnError: false });
    } catch {
      return displayMode
        ? `<pre class="katex-error">${escapeHtml(tex)}</pre>`
        : `<code class="katex-error">${escapeHtml(tex)}</code>`;
    }
  }

  function highlightCode(code, lang) {
    const language = (lang || '').trim().split(/\s+/)[0];
    if (language && hljs && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language }).value;
      } catch {
        // Fall through to escaped plain text.
      }
    }
    return escapeHtml(code);
  }

  /**
   * Replace fenced code blocks with placeholders so math processing cannot
   * touch their contents. The raw block is restored before Marked runs, so
   * Marked still sees normal fences (including blockquote/list nesting).
   */
  function protectFences(md, blocks) {
    const lines = md.split('\n');
    const out = [];

    for (let i = 0; i < lines.length; i++) {
      const open = lines[i].match(/^([ \t]*(?:>[ \t]?)*[ \t]*)(`{3,}|~{3,})(.*)$/);
      if (!open) {
        out.push(lines[i]);
        continue;
      }

      const fence = open[2];
      const char = fence[0];
      const minLength = fence.length;
      let end = i + 1;

      for (; end < lines.length; end++) {
        const close = lines[end].match(/^([ \t]*(?:>[ \t]?)*[ \t]*)(`{3,}|~{3,})[ \t]*$/);
        if (close && close[2][0] === char && close[2].length >= minLength) break;
      }

      if (end >= lines.length) {
        out.push(lines[i]);
        continue;
      }

      blocks.push(lines.slice(i, end + 1).join('\n'));
      out.push(make('CB', blocks.length - 1));
      i = end;
    }

    return out.join('\n');
  }

  function protectInlineCode(md, spans) {
    return md.replace(/(`+)([\s\S]*?)\1/g, (match) => {
      spans.push(match);
      return make('IC', spans.length - 1);
    });
  }

  function restoreCode(md, blocks, spans) {
    let result = md;
    for (let i = 0; i < blocks.length; i++) {
      result = result.split(make('CB', i)).join(blocks[i]);
    }
    for (let i = 0; i < spans.length; i++) {
      result = result.split(make('IC', i)).join(spans[i]);
    }
    return result;
  }

  function processMath(md) {
    const codeBlocks = [];
    const codeSpans = [];
    let processed = protectFences(md, codeBlocks);
    processed = protectInlineCode(processed, codeSpans);

    const blockMath = [];
    processed = processed.replace(
      /(?<!\\)\$\$(?!\$)([\s\S]*?)(?<!\\)\$\$/g,
      (_m, tex) => {
        blockMath.push(renderKatex(tex, true));
        return make('BM', blockMath.length - 1);
      }
    );
    const inlineMath = [];
    processed = processed.replace(
      /(?<!\\)\$(?![\s$])([^\n$]*?)(?<![\s\\])\$(?!\$)/g,
      (_m, tex) => {
        inlineMath.push(renderKatex(tex, false));
        return make('IM', inlineMath.length - 1);
      }
    );

    return {
      text: restoreCode(processed, codeBlocks, codeSpans),
      codeBlocks,
      codeSpans,
      inlineMath,
      blockMath,
    };
  }

  function restorePlaceholders(html, codeBlocks = [], inlineMath = [], blockMath = []) {
    let result = html;
    for (let i = 0; i < codeBlocks.length; i++) {
      result = result.split(make('CB', i)).join(codeBlocks[i]);
    }
    for (let i = 0; i < inlineMath.length; i++) {
      result = result.split(make('IM', i)).join(inlineMath[i]);
    }
    for (let i = 0; i < blockMath.length; i++) {
      result = result.split(make('BM', i)).join(blockMath[i]);
    }
    assertAllRestored(result);
    return result;
  }

  function renderMarkdown(md) {
    const { text, inlineMath, blockMath } = processMath(md);
    const marked = new Marked();
    marked.use({
      renderer: {
        code(token) {
          const lang = (token.lang || '').trim().split(/\s+/)[0];
          const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
          const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
          return `<pre${langAttr}><code${langClass}>${highlightCode(token.text, lang)}</code></pre>\n`;
        },
      },
    });
    marked.setOptions({
      breaks: true,
      gfm: true,
      async: false,
    });
    const html = marked.parse(text, { async: false });
    return restorePlaceholders(html, [], inlineMath, blockMath);
  }

  return { escapeHtml, processMath, restorePlaceholders, renderMarkdown, renderKatex };
}

module.exports = { createRenderer, inlineLocalImages };
