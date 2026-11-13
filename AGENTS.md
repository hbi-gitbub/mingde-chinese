# AGENTS.md

Rules for any AI coding agent (Codex, Cursor, Copilot, Claude, and others) working in this repo.

## 1. Project overview
明德中文乐园 (Mingde Chinese) is a small static website of Chinese learning games. A main page
(`index.html`) shows one game at a time inside an iframe: 中文冒险世界 (an adventure with six
levels) and 拼音泡泡大作战 (a pinyin bubble game with a teacher word-list manager). The nav
shows only these two plus a "…" button that opens the contents page (`#contents`): a table of
the uploaded games with a filter drop-down and a text filter per column. A teacher
can also upload, replace, edit and delete more game pages from the site itself (⚙ 管理). Those
changes are committed to this GitHub repo through the GitHub API. It uses plain HTML, CSS and
JavaScript, with no build step and no framework.

## 2. File structure
```
index.html                main page: header (title, status, ⚙ 管理), nav (2 games + "…" + open game's title), description line,
                          iframe, contents table (#contents), Manage dialog
css/style.css             styles for the shell, the contents table and the dialog (light + dark tokens on :root)
js/main.js                main page logic: page map, hash routing, iframe swap, contents table + filters
js/manage.js              ⚙ 管理 dialog: GitHub token, upload / replace / edit / delete via the GitHub API
js/uploaded-pages.js      list of uploaded pages (window.MINGDE_UPLOADED_PAGES), written by manage.js
pages/adventure-world.html  vendored game: 中文冒险世界 · 六大魔法关卡 (~19 MB, self-contained)
pages/pinyin-bubbles.html   vendored game: 拼音泡泡大作战 (~6 MB, self-contained)
pages/uploads/<key>.html  games uploaded from the site (committed by manage.js; .gitkeep keeps the folder)
README.md                 how to run the site and manage pages
AGENTS.md                 this file
CLAUDE.md                 Claude Code notes (points here)
```

## 3. How to run
- Open `index.html` directly in a browser (double-click, or `start index.html` in PowerShell).
- Or use a static server from the project root, then open the printed URL:
  - `npx serve .`
  - `python -m http.server 8000` → http://localhost:8000
- Direct links: `index.html#adventure`, `index.html#bubbles`, `index.html#contents` (uploaded games),
  and `index.html#<key>` for an uploaded page.

## 4. Architecture rules
- **iframe shell:** `index.html` has a single `<iframe id="content" allow="autoplay">`. `js/main.js`
  owns a `BUILTIN_PAGES` map (`adventure`, `bubbles` → `src`, `title`, `description`, optional
  `author`), merges the
  uploaded pages into it, and is the only code that changes the iframe.
  `allow="autoplay"` must stay: the adventure game plays sound in its own inner iframe.
- **Hash routing:** the current page lives in the URL hash (`#adventure`, `#bubbles`,
  `#contents`, `#<key>`). One delegated click listener on the nav sets the hash, and a
  `hashchange` listener loads the page. Default is `adventure`. Each load swaps in a fresh iframe
  so the hash is the only browser history entry. The open page's `description` and `author` are
  shown in `#page-desc` under the nav, as "description · 作者：author".
- **Nav and contents page:** the nav has only the built-in game buttons and the "…" button
  (`data-page="contents"`). Uploaded games get no nav button. `#contents` hides the iframe
  (emptied, so game sound stops) and shows `#contents-view`: a table, built by `main.js`, with
  the columns Title, 课本/Book and Author (the description is not a column; it shows in the
  title's tooltip and in `#page-desc`). It lists only the uploaded games (the built-in
  ones have their own nav buttons); with none, it says "还没有上传的游戏". The header row holds, for each column, a `<select data-filter="…">` with
  "全部 / All" plus every value in that column, and under it an
  `<input type="search" data-filter-text="…">`. A row is shown only when, in every column, it
  matches the chosen drop-down value and its value contains the typed text (case-insensitive). Each title
  is a link (`href="#<key>"`, the HTML file name as its tooltip). While a game is still
  publishing, its title is plain text followed by "（发布中…）". The "…" button is marked active on
  `#contents` and on uploaded games. While an uploaded game is open, its title is shown right after
  "…" in the nav (`#nav-current`, a plain label, not a button). `contents` is a reserved key.
- **Uploaded pages (⚙ 管理):**
  - Files live at `pages/uploads/<key>.html`. The list lives in `js/uploaded-pages.js` as
    `window.MINGDE_UPLOADED_PAGES = [{ key, title, description, book, author, updated }]`. There is no
    path field: the path is always built from the key. Key `^[a-z0-9][a-z0-9-]{0,39}$`, not a
    built-in key, not `contents` and not `manage`. Title 1–40 characters. Description 0–200 characters.
    Book (课本, the textbook) 0–40 characters. Author 0–40 characters. Book and author are set
    in the Upload and Edit forms. Entries without `book` or `author` (older ones) read them as `""`.
  - The list is a script, not JSON, so it also loads from `file://`. `manage.js` writes it in
    an exact format (`serializeList` / `parseList`), so don't hand-edit its layout.
  - `js/manage.js` commits through the GitHub Git Data API (blob → tree → commit → update ref).
    Each upload, replace, edit or delete is **one commit** that contains both the page file and
    the list. On 422 (`main` moved) it retries once. Owner, repo and branch are constants at the
    top of `manage.js`.
  - After a commit it checks the live site's `js/uploaded-pages.js?t=…` every 10 s, for up to
    5 min, until it matches. Meanwhile, the game's title in the contents table shows "（发布中…）"
    and isn't a link.
  - `manage.js` and `main.js` talk only through the DOM event
    `document.dispatchEvent(new CustomEvent("pages-changed", { detail: { pages, publishing, status } }))`.
  - Over http(s), `main.js` reloads `js/uploaded-pages.js?t=<now>` once, to get past GitHub's
    ~10 min cache.
  - User text (titles, descriptions, books, authors) is only ever shown with `textContent` or attributes,
    never with `innerHTML`.
  - Upload limits: `.html`/`.htm`, not empty, at most `MAX_UPLOAD_MB` (50). The file must be
    self-contained: linked images or scripts are not uploaded.
- **GitHub token:**
  - The teacher pastes a fine-grained token (this repo only, Contents: Read and write) into the
    dialog. By default it is kept only in memory. "Remember on this device" stores it in
    localStorage under `mingde.githubToken`.
  - `manage.js` keeps its own `fetch` reference, taken before any game page loads.
  - Uploaded pages run on the same origin, so only trusted pages should be uploaded.
  - Never put a token in a file or a commit.
- **Vendored game pages:** the files in `pages/` are self-contained templates (inline scripts,
  embedded audio and images, localStorage for teacher mode). Keep them as delivered: don't edit,
  reformat or split them unless asked. Don't Read them whole (19 MB / 6 MB). Search them with
  grep instead. They are exempt from the one-JS-file and no-inline-script rules below.
- **New authored pages** (if any are added) are complete HTML documents that load their own
  `<script src="../js/<name>.js" defer></script>` and link `../css/style.css`.
- **No shared globals:** every authored script is wrapped in an IIFE. Pages never read each other.
  The one exception is the data global `window.MINGDE_UPLOADED_PAGES` from `js/uploaded-pages.js`.
- **Messages between pages (optional):** a page can tell the main page something with
  `window.parent.postMessage({ type: "status", text }, targetOrigin)`. `main.js` accepts a
  message only when `event.source` is the current iframe and `event.origin` is trusted
  (the page's own origin over http, or `"null"` / `"file://"` under `file://`). The two games
  don't send any, so the header status line stays empty for them.
- **file:// compatible:** no `fetch()` of local files, no ES modules (`type="module"`),
  no `import`/`export`. `fetch()` is used only for `api.github.com` and for the live-site check
  in `manage.js`.
- **The site commits to `main`:** every change made in ⚙ 管理 is a new commit on GitHub. Before
  you work locally, run `git pull`, and pull again before you push.
- **No build step, no npm dependencies, no external CDNs.**

## 5. Coding conventions (authored files)
- Semantic HTML5 (`header`, `nav`, `main`, `section`, real `<button>`s); `lang="zh-Hans"`
  on Chinese text.
- Vanilla ES2020, `"use strict";` at the top of every JS file, `const`/`let` only (no `var`).
- `addEventListener` only. No inline `onclick` or other inline handlers.
- 2-space indent. kebab-case ASCII file names. camelCase JS names. UPPER_CASE for constants.
- Colors come from CSS custom properties in `css/style.css`. Don't hard-code colors elsewhere.

## 6. Adding a page (checklist)
Normally a teacher adds a page from the site: ⚙ 管理 → Upload. Nothing in the code changes.
To add a new **built-in** page (fixed, can't be deleted from the site):
1. Put the file in `pages/` with a kebab-case ASCII name (rename vendored files; don't edit them).
2. Pick a short hash key, e.g. `story`. It must not be used by an uploaded page, and not be
   `contents` or `manage`.
3. In `index.html`, add `<button type="button" class="nav-btn" data-page="story" data-builtin>…</button>`
   before the "…" button (`data-page="contents"`).
4. In `js/main.js`, add `story: { src: "pages/<file>.html", title: "…", description: "…" }` to
   `BUILTIN_PAGES` (optionally also `author: "…"`). Built-in games are not listed in the
   contents table.
5. Update the file lists in `README.md` and in section 2 of this file.

## 7. Testing
- Open `index.html` in Chrome and in Edge, both from `file://` and from a static server.
- DevTools console must show no errors from `index.html` / `main.js`.
- Click both nav buttons. The hash, the active button and the iframe all change together.
- Reload on `#bubbles` and you stay there. Back/Forward moves between pages.
  A bad hash (e.g. `#nope`) falls back to `#adventure`.
- Start a level in each game. Sound plays after the first click.
- Check a 375px-wide viewport (DevTools device mode): the nav wraps and there's no horizontal scroll.
  The header stays on one row with ⚙ 管理 at the right end. The open dialog fits the screen.
- Each game shows its description under the nav, followed by "· 作者：…" when it has an author.
- "…" opens `#contents`: the table lists every uploaded game and no built-in one, with the columns
  Title, 课本/Book and Author. Hovering a title shows its description. Each filter drop-down narrows the rows, and
  so does typing part of a value in the text box under it (rows narrow as you type; both together
  must match). "Clear filters" resets the drop-downs, empties the boxes and shows all again, and clicking a title opens its game (with "…" still highlighted for
  uploaded games, and the game's title right after "…"; the title disappears on `#contents` and the
  built-in games). At 375px the table fits without page-wide horizontal scroll.
- ⚙ 管理 without a token: the list is visible, Upload is disabled, and Edit or Delete asks for a token.
  With a token, Upload stays disabled until a file is chosen and Key and Title are filled
  (its tooltip says what's missing); clearing any of them disables it again. Clear empties
  every Upload field (it doesn't bring back the example values).
- Test uploads with a throwaway key (e.g. `test`) on the live site. Each action makes one commit.
  Its title in the contents table shows "（发布中…）" until it is live. Delete it again afterwards, and `git pull`.

## 8. Don'ts
- No frameworks (React, Vue, …), bundlers (Vite, webpack, …), or transpilers.
- No inline `<script>` blocks or inline event handlers in authored files (vendored games excepted).
- Don't edit a vendored game page while working on the shell, or the shell while working on a page.
- Don't add globals (besides `MINGDE_UPLOADED_PAGES`), `fetch()` of local files, or ES modules.
- Never commit a GitHub token, and never write one into a file.
- Don't hand-edit the layout of `js/uploaded-pages.js`; `manage.js` parses it.
- Don't use `innerHTML` with page titles, descriptions, books or authors.
