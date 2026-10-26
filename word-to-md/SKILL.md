---
name: word-to-md
description: Convert Word (.docx) to Markdown via mammoth + turndown pipeline
triggers:
  - Convert Word to Markdown
  - Extract markdown from Word documents
  - Word 转 Markdown
  - docx to md
  - Convert docx to markdown
---

# word-to-md Skill

Convert Word (.docx) to Markdown — mammoth + turndown, same pipeline as md-to.com. Code styles (`Code Char`, `Verbatim Char`, `Code Block`, `HTML Preformatted`), quote styles, task checkboxes, table column alignment, and inline/display math are restored where possible.

## Usage

```bash
node index.js convert -i document.docx -o output.md
```
