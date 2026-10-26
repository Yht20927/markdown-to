const fs = require('fs');
const path = require('path');

const mimeByExt = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject'
};

let katexCache = null;
const hljsCache = new Map();

function inlineKatexCss() {
  if (katexCache !== null) return katexCache;
  try {
    const cssPath = require.resolve('katex/dist/katex.min.css');
    const fontDir = path.join(path.dirname(cssPath), 'fonts');
    let css = fs.readFileSync(cssPath, 'utf-8');
    css = css.replace(/url\((['"]?)fonts\/([^)'"]+)\1\)/g, (match, _quote, filename) => {
      try {
        const filePath = path.join(fontDir, filename);
        const mime = mimeByExt[path.extname(filename).toLowerCase()] || 'application/octet-stream';
        const data = fs.readFileSync(filePath).toString('base64');
        return `url(data:${mime};base64,${data})`;
      } catch {
        return match;
      }
    });
    katexCache = css;
  } catch {
    katexCache = '';
  }
  return katexCache;
}

function hljsCss(dark) {
  const key = dark ? 'dark' : 'light';
  if (hljsCache.has(key)) return hljsCache.get(key);
  let css = '';
  try {
    const theme = dark ? 'atom-one-dark' : 'atom-one-light';
    css = fs.readFileSync(require.resolve('highlight.js/styles/' + theme + '.css'), 'utf-8');
  } catch { /* hljs theme not available */ }
  hljsCache.set(key, css);
  return css;
}

function isDarkTemplate(template) {
  if (template.id && template.id.includes('dark')) return true;
  const bg = template.colors && template.colors.background;
  if (!bg || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(bg)) return false;
  let hex = bg.slice(1);
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
}

function buildMathHeadExtras({ dark = false } = {}) {
  return `<style>${inlineKatexCss()}</style>\n  <style>${hljsCss(dark)}</style>`;
}

module.exports = { buildMathHeadExtras, inlineKatexCss, hljsCss, isDarkTemplate };
