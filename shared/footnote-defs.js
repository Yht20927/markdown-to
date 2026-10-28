/**
 * Collect footnote definitions, including their indented continuation lines.
 *
 * `onDef(label, content)` may return a replacement line (e.g. a placeholder);
 * when it returns undefined the definition is removed from the body.
 */

function extractFootnoteDefs(md, onDef) {
  const lines = md.split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\[\^([^\]]+)\]:[ \t]*(.*)$/);
    if (!match) {
      out.push(lines[i]);
      continue;
    }

    const parts = [match[2].trim()];
    let j = i + 1;
    while (j < lines.length) {
      const line = lines[j];
      if (line.trim() !== '' && /^[ \t]+/.test(line)) {
        parts.push(line.trim());
        j++;
        continue;
      }
      if (line.trim() === '' && j + 1 < lines.length && /^[ \t]+\S/.test(lines[j + 1])) {
        j++;
        continue;
      }
      break;
    }

    const replacement = onDef(match[1], parts.filter(Boolean).join(' '));
    if (replacement !== undefined) out.push(replacement);
    i = j - 1;
  }

  return out.join('\n');
}

module.exports = { extractFootnoteDefs };
