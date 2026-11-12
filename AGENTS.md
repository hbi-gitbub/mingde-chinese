# AGENTS.md

Rules for any AI coding agent (Codex, Cursor, Copilot, Claude, and others) working in this repo.

## 1. Project overview
明德中文乐园 (Mingde Chinese) is a small static website of Chinese learning games. A main page
(`index.html`) shows one game at a time inside an iframe: 中文冒险世界 (an adventure with six
levels) and 拼音泡泡大作战 (a pinyin bubble game with a teacher word-list manager). It uses
plain HTML, CSS and JavaScript, with no build step and no framework.

## 2. File structure
```
index.html                main page: header + status line, nav with two buttons, iframe content area
css/style.css             styles for the main page shell (light + dark theme tokens on :root)
js/main.js                main page logic: page map, hash routing, iframe swap, postMessage listener
pages/adventure-world.html  vendored game: 中文冒险世界 · 六大魔法关卡 (~19 MB, self-contained)
pages/pinyin-bubbles.html   vendored game: 拼音泡泡大作战 (~6 MB, self-contained)
README.md                 how to run the site
AGENTS.md                 this file
CLAUDE.md                 Claude Code notes (points here)
```

## 3. How to run
- Open `index.html` directly in a browser (double-click, or `start index.html` in PowerShell).
- Or use a static server from the project root, then open the printed URL:
  - `npx serve .`
  - `python -m http.server 8000` → http://localhost:8000
- Direct links: `index.html#adventure`, `index.html#bubbles`.

## 4. Architecture rules
- **iframe shell:** `index.html` has a single `<iframe id="content" allow="autoplay">`. `js/main.js`
  owns a `PAGES` map (`adventure`, `bubbles` → `src`, `title`) and is the only code that changes it.
  `allow="autoplay"` must stay: the adventure game plays sound in its own inner iframe.
- **Hash routing:** the current page lives in the URL hash (`#adventure` / `#bubbles`). Nav
  buttons set the hash, and a `hashchange` listener loads the page. Default is `adventure`.
  Each load swaps in a fresh iframe so the hash is the only browser history entry.
- **Vendored game pages:** the files in `pages/` are self-contained templates (inline scripts,
  embedded audio and images, localStorage for teacher mode). Keep them as delivered: don't edit,
  reformat or split them unless asked. Don't Read them whole (19 MB / 6 MB). Search them with
  grep instead. They are exempt from the one-JS-file and no-inline-script rules below.
- **New authored pages** (if any are added) are complete HTML documents that load their own
  `<script src="../js/<name>.js" defer></script>` and link `../css/style.css`.
- **No shared globals:** every authored script is wrapped in an IIFE. Pages never read each other.
- **Messages between pages (optional):** a page can tell the main page something with
  `window.parent.postMessage({ type: "status", text }, targetOrigin)`. `main.js` accepts a
  message only when `event.source` is the current iframe and `event.origin` is trusted
  (the page's own origin over http, or `"null"` / `"file://"` under `file://`). The two games
  don't send any, so the header status line stays empty for them.
- **file:// compatible:** no `fetch()` of local files, no ES modules (`type="module"`),
  no `import`/`export`.
- **No build step, no npm dependencies, no external CDNs.**

## 5. Coding conventions (authored files)
- Semantic HTML5 (`header`, `nav`, `main`, `section`, real `<button>`s); `lang="zh-Hans"`
  on Chinese text.
- Vanilla ES2020, `"use strict";` at the top of every JS file, `const`/`let` only (no `var`).
- `addEventListener` only. No inline `onclick` or other inline handlers.
- 2-space indent. kebab-case ASCII file names. camelCase JS names. UPPER_CASE for constants.
- Colors come from CSS custom properties in `css/style.css`. Don't hard-code colors elsewhere.

## 6. Adding a page (checklist)
1. Put the file in `pages/` with a kebab-case ASCII name (rename vendored files; don't edit them).
2. Pick a short hash key, e.g. `story`.
3. In `index.html`, add `<button type="button" class="nav-btn" data-page="story">…</button>`.
4. In `js/main.js`, add `story: { src: "pages/<file>.html", title: "…" }` to `PAGES`.
5. Update the file lists in `README.md` and in section 2 of this file.

## 7. Testing
- Open `index.html` in Chrome and in Edge, both from `file://` and from a static server.
- DevTools console must show no errors from `index.html` / `main.js`.
- Click both nav buttons. The hash, the active button and the iframe all change together.
- Reload on `#bubbles` and you stay there. Back/Forward moves between pages.
  A bad hash (e.g. `#nope`) falls back to `#adventure`.
- Start a level in each game. Sound plays after the first click.
- Check a 375px-wide viewport (DevTools device mode): the nav wraps and there's no horizontal scroll.

## 8. Don'ts
- No frameworks (React, Vue, …), bundlers (Vite, webpack, …), or transpilers.
- No inline `<script>` blocks or inline event handlers in authored files (vendored games excepted).
- Don't edit a vendored game page while working on the shell, or the shell while working on a page.
- Don't add globals, `fetch()` of local files, or ES modules.
