# Markdown Format Converter Suite

> [md-to.com](https://md-to.com) 的本地 CLI 复刻版 — 16 个工具，默认本地运行、禁止远程请求，隐私安全。
>
> **v2.0** — 架构重构：11 个 shared 模块 · 多项 P0 修复 · 142 个回归测试 · 美化增强

## 工具概览

### Markdown → 其他格式

| 工具 | 输出 | 特性 | 速度 |
|------|------|------|------|
| **md-to-pdf** | PDF (29 主题) | KaTeX 数学 + hljs 高亮 + 页码（可关闭） | ~3s |
| **md-to-word** | Word .doc / .docx | `.doc` mso 样式；`.docx` 原生 OOXML（图片/表格/列表/公式/代码样式） | <0.5s |
| **md-to-html** | HTML5 | GitHub 风格 CSS, `--theme dark` 暗色模式 | <0.5s |
| **md-to-image** | PNG / JPG | `--scale` 高 DPI, `--watermark` 水印, `--padding` | ~2s |
| **md-to-text** | 纯文本 | 代码块保护, 图片/链接顺序修正 | <0.1s |
| **md-to-latex** | LaTeX .tex | CJK 自动检测 → ctexart, 特殊字符转义 | <0.3s |
| **md-to-rst** | reStructuredText | 动态标题下划线, 脚注 `#` 配对 | <0.3s |
| **md-to-confluence** | Confluence wiki | `***粗斜体***` 支持 | <0.2s |

> `md-to-word` 的 `.doc` 是 HTML-as-doc（兼容 Word），`.docx` 是原生 OOXML；公式保留 TeX 源码。

### 其他格式 → Markdown

| 工具 | 输入 | 特性 | 速度 |
|------|------|------|------|
| **html-to-md** | HTML → MD | GFM 表格, KaTeX 源码还原, 任务列表, 表格对齐, 删除线 | <0.3s |
| **word-to-md** | .docx → MD | GFM 表格, 代码/引用/任务/表对齐还原 | <1s |
| **pdf-to-md** | PDF → MD | 字体/坐标重建标题/列表/表格/代码块，过滤页码，`--allow-empty` | <1s |

### 表格工具

| 工具 | 方向 | 特性 | 速度 |
|------|------|------|------|
| **csv-to-md** | CSV → MD Table | RFC 4180, BOM, 引号内换行/分隔符 | <0.1s |
| **md-table-to-csv** | MD Table → CSV | 空 cell 保留, `\|` 转义, RFC 4180 引号 | <0.1s |
| **json-to-md** | JSON → MD Table | union 所有 keys, 对象/数组序列化 | <0.1s |
| **md-table-to-image** | MD Table → PNG | KaTeX/hljs, browser-pool 复用 | ~2s |
| **md-table-to-pdf** | MD Table → PDF | KaTeX/hljs, browser-pool 复用 | ~2s |

## 安装

要求 Node.js >= 22.12（Puppeteer 25）。

### npm workspace（推荐）

```bash
# 在项目根目录一次性安装所有依赖（会下载 Puppeteer 自带的 Chrome）
npm install
```

如果本机已经安装 Chrome/Chromium，可跳过下载并让工具自动探测系统浏览器：

```bash
PUPPETEER_SKIP_DOWNLOAD=1 npm install
```

也可显式指定浏览器路径：

```bash
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

如果没有任何可用浏览器，手动安装：

```bash
npx puppeteer browsers install chrome
```

浏览器类工具默认禁用 JavaScript，并阻止远程图片/字体请求；确实需要远程资源时加 `--allow-remote`。

### 单工具安装

```bash
cd <tool-dir> && npm install
```

## 使用

所有 16 个工具遵循统一 CLI：

```bash
node <tool-dir>/index.js convert -i <input> -o <output> [options]
```

### md-to-pdf

```bash
# 列出 29 个主题
node md-to-pdf/index.js list

# 查看主题详情
node md-to-pdf/index.js info github-dark-sans-modern

# 转换（默认主题: github-dark-sans-modern-standard）
node md-to-pdf/index.js convert -i in.md -o out.pdf -t <theme-id>

# 关闭页码
node md-to-pdf/index.js convert -i in.md -o out.pdf --no-page-numbers

# 预览 HTML（不生成 PDF）
node md-to-pdf/index.js convert -i in.md -o out.html
```

### md-to-html

```bash
# 亮色主题（默认）
node md-to-html/index.js convert -i in.md -o out.html

# 暗色模式
node md-to-html/index.js convert -i in.md -o out.html --theme dark
```

### md-to-image

```bash
# 基础转换
node md-to-image/index.js convert -i in.md -o out.png

# 高 DPI + 水印 + 自定义 padding/背景
node md-to-image/index.js convert -i in.md -o out.png \
  --scale 2 --padding 40 --bg "#fafafa" --watermark "© 2026"
```

### md-to-word

```bash
# 原生 OOXML .docx
node md-to-word/index.js convert -i in.md -o out.docx

# HTML-as-doc（旧格式，兼容 Word）
node md-to-word/index.js convert -i in.md -o out.doc
```

### csv-to-md

```bash
# 自动检测分隔符
node csv-to-md/index.js convert -i in.csv -o out.md

# 指定分隔符
node csv-to-md/index.js convert -i in.csv -o out.md -d ';'
```

### pdf-to-md

```bash
node pdf-to-md/index.js convert -i in.pdf -o out.md

# 允许空输出（扫描版 PDF）
node pdf-to-md/index.js convert -i in.pdf -o out.md --allow-empty
```

## 架构

### 三条转换管线

| 范式 | 工具 | 引擎 |
|------|------|------|
| **marked → HTML** | md-to-pdf / html / word / image | marked + katex + hljs（word 另含 docx OOXML） |
| **纯 regex 顺序替换** | md-to-latex / rst / confluence / text | 占位符保护 + 正则管线 |
| **反向转换** | html-to-md / word-to-md / pdf-to-md | turndown / mammoth / pdf-parse + layout |
| **表格专用** | csv-to-md / md-table-to-csv / json-to-md | shared/csv.js + shared/gfm-table.js |

### shared 模块 (`shared/`)

| 模块 | 用途 | 消费者 |
|------|------|--------|
| `html-renderer.js` | marked+katex+hljs 渲染工厂 | md-to-pdf/html/word/image |
| `placeholders.js` | NUL 前缀统一占位符 + 泄漏断言 | md-to-latex/rst/confluence |
| `gfm-table.js` | GFM 表格构造 (buildTable) | csv-to-md, json-to-md |
| `md-table-parser.js` | MD 表格解析 (parseTables) | md-table-to-csv |
| `csv.js` | RFC 4180 CSV 解析器+写入器 | csv-to-md, md-table-to-csv |
| `turndown-factory.js` | 反向转换共享工厂 | html-to-md, word-to-md |
| `frontmatter.js` | YAML frontmatter 剥离 | 全部 Markdown 读取工具 |
| `math-assets.js` | KaTeX 字体内联 + hljs 主题 | md-to-pdf/image, md-table-to-image/pdf |
| `browser-pool.js` | Puppeteer 单例池 | md-to-image/pdf, md-table-to-image/pdf |
| `html-page.js` | HTML 文档外壳 | md-to-html/word/image |
| `cli.js` | 统一 CLI 工具 | 全部 16 工具 |

## 项目结构

```
markdownFomart/
├── README.md
├── REFACTOR_PLAN.md          ← 重构方案（v2.0 蓝图）
├── package.json              ← npm workspace 根配置
├── shared/                   ← 共享模块（11 个）
│   ├── __tests__/            ← 共享模块测试（92 个）
│   ├── html-renderer.js
│   ├── placeholders.js
│   ├── gfm-table.js
│   ├── md-table-parser.js
│   ├── csv.js
│   ├── turndown-factory.js
│   ├── frontmatter.js
│   ├── math-assets.js
│   ├── browser-pool.js
│   ├── html-page.js
│   └── cli.js
├── md-to-pdf/                ← Markdown → PDF (29 主题 + 美化)
│   └── lib/
│       ├── renderer.js       ← 主题 CSS + KaTeX/hljs 注入
│       ├── templates.js      ← 模板缓存 + 去重
│       ├── converter.js      ← Puppeteer 适配
│       └── cli.js            ← list / info / convert
├── md-to-html/               ← Markdown → HTML (暗色模式)
├── md-to-word/               ← Markdown → Word .doc / .docx (mso / OOXML)
├── md-to-image/              ← Markdown → PNG/JPG (高DPI/水印)
├── md-to-latex/              ← Markdown → LaTeX (CJK 检测)
├── md-to-rst/                ← Markdown → reStructuredText
├── md-to-confluence/         ← Markdown → Confluence wiki
├── md-to-text/               ← Markdown → 纯文本
├── html-to-md/               ← HTML → Markdown (GFM 表格)
├── word-to-md/               ← .docx → Markdown (GFM 表格)
├── pdf-to-md/                ← PDF → Markdown
├── csv-to-md/                ← CSV → MD Table (RFC 4180)
├── md-table-to-csv/          ← MD Table → CSV (空cell/转义)
├── json-to-md/               ← JSON → MD Table (union keys)
├── md-table-to-image/        ← MD Table → PNG (KaTeX/hljs)
└── md-table-to-pdf/          ← MD Table → PDF (KaTeX/hljs)
```

## 测试

```bash
# 运行所有测试（142 个）
npm test

# 仅共享模块测试（92 个）
npm run test:shared

# 仅工具集成测试（50 个）
npm run test:tools

# 语法检查
npm run lint
```

## v2.0 更新日志

### 数据正确性 (多项 P0 修复)
- 表格工具：空 cell 保留、`\|` 转义、RFC 4180 CSV 引号、BOM、引号内分隔符检测
- 文本工具：图片/链接顺序修正、代码块占位符保护、粗斜体 `***` 嵌套
- LaTeX/RST：特殊字符转义、标题下划线长度匹配、脚注配对、CJK 支持
- 反向转换：GFM 表格 rule 补齐、无 thead 表格处理；HTML 还原 KaTeX 源码/任务列表/表格对齐/删除线；PDF 基于字体/坐标重建标题、列表、表格和代码块

### 依赖安全
- Puppeteer 25.16 / KaTeX 0.19.1 / Mammoth 1.13，并对 `@xmldom/xmldom`、`js-yaml` 做安全版本覆盖
- `npm audit --omit=dev` 当前为 0 vulnerabilities

### 架构统一
- 抽取 11 个 shared 模块消除重复代码
- 全部 16 工具使用统一 CLI (`shared/cli.js`)
- npm workspace 统一依赖版本
- 浏览器工具默认禁用 JavaScript 与远程请求，显式 `--allow-remote` 才放行

### 美化
- **PDF**: 代码块圆角+阴影+语言标签、表格斑马纹+sticky 表头、引用块彩色边框、admonition 块、封面页/TOC/页码 CSS
- **HTML**: GitHub 风格 CSS、`--theme dark` 暗色模式、`prefers-color-scheme` 自动切换
- **Image**: `--scale` 高 DPI、`--watermark` 水印、`--padding`/`--bg` 自定义
- **Word**: `.doc` mso 命名空间样式；`.docx` 原生 OOXML，支持标题/表格/列表/图片/链接/TeX 公式

## 与原版对比

| | md-to.com | 本工具 v2.0 |
|------|-----------|---------|
| 运行方式 | 浏览器在线 | 命令行本地 |
| 编辑器 | 分屏实时预览 | — |
| 隐私 | 浏览器本地处理 | 完全本地，无网络依赖 |
| 批量处理 | 单个文件 | 支持脚本批量 |
| 集成 | 手动操作 | 可嵌入 CI/脚本 |
| 主题 | — | 29 个 PDF 主题 + 暗色模式 |
| 数据正确性 | — | 21 项 P0 bug 修复 + 142 回归测试 |
| 收费 | 免费 | 开源 MIT |

## License

MIT
