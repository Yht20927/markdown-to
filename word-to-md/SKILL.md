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

Convert Word (.docx) to Markdown — mammoth + turndown, same pipeline as md-to.com. Common Word code styles (`Code Char`, `Verbatim Char`, `Code Block`, `HTML Preformatted`) are restored as inline/fenced code.

## Usage

```bash
node index.js convert -i document.docx -o output.md
```
