# AGENTS.md

Rules for any AI coding agent (Codex, Cursor, Copilot, Claude, and others) working in this repo.

## 1. Project overview
明德中文乐园 (Mingde Chinese) is a small static website of Chinese learning games. A main page
(`index.html`) shows one game at a time inside an iframe: 中文冒险世界 (an adventure with six
levels) and 拼音泡泡大作战 (a pinyin bubble game with a teacher word-list manager). The nav
shows only these two plus a "…" button that opens the contents page (`#contents`): a grid of
thumbnail cards for the uploaded games, under a filter bar (field → value, or a keyword) whose filters add up. A teacher
can also upload, replace, edit and delete more game pages from the site itself (⚙ 管理). Those
changes are committed to this GitHub repo through the GitHub API. It uses plain HTML, CSS and
JavaScript, with no build step and no framework.

## 2. File structure
```
index.html                main page: header (title, status, ⚙ 管理), nav (2 games + "…" + open game's title), description line,
                          iframe, contents page (#contents: filter bar + card grid), Manage dialog
css/style.css             styles for the shell, the contents page and the dialog (light + dark tokens on :root)
js/main.js                main page logic: page map, hash routing, iframe swap, contents cards + filters
js/manage.js              ⚙ 管理 dialog: GitHub token, upload / replace / edit / delete via the GitHub API
js/uploaded-pages.js      list of uploaded pages (window.MINGDE_UPLOADED_PAGES), written by manage.js
pages/adventure-world.html  vendored game: 中文冒险世界 · 六大魔法关卡 (~19 MB, self-contained)
pages/pinyin-bubbles.html   vendored game: 拼音泡泡大作战 (~6 MB, self-contained)
pages/uploads/<key>.html  games uploaded from the site (committed by manage.js; .gitkeep keeps the folder)
pages/uploads/<key>.png   optional thumbnail picture of that game (.png, .jpg or .webp), also committed by manage.js
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
  (emptied, so game sound stops) and shows `#contents-view`: a filter bar and a grid of cards
  (`#contents-grid`), both built by `main.js`. It lists only the uploaded games (the built-in
  ones have their own nav buttons); with none, it says "还没有上传的游戏".
  - Filter bar: `#filter-field` picks a field (Title, 教材/Textbook, 册/Volume, 课/Lesson, Author,
    关键词/Text; default Title), and next to it is that field's control. For the first five it is
    `#filter-value`: "全部 / All" plus the values of that field found in the games that pass the
    other fields' values and the keyword (the chosen value always stays listed). For 关键词/Text
    (`KEYWORD_FIELD`) it is `#filter-text` instead (only one of the two is shown): one keyword that
    the title, description, textbook, volume, lesson or author must contain (case-insensitive; a
    lesson matches `3` and 第三课). Each field keeps its own value in `criteria`, and the keyword is
    kept apart, so the filters add up: a card is shown only when it passes the value of every field
    and the keyword. Switching the field shows that field's saved setting. `#filter-active` lists
    each filter that is set as a button ("作者 = 王老师 ✕", "关键词 包含 “3” ✕") that removes it.
    "Clear filters" resets everything. Filters are not kept across a reload.
  - Card: a link (`href="#<key>"`) with a 4:3 thumbnail and the title under it, nothing else. Its
    tooltip holds the description, "textbook · volume · lesson", "作者：author" and the HTML file
    name. The thumbnail is `pages/uploads/<key>.<thumb>?v=<updated>` (no `?v` under `file://`).
    Without a picture, or if it fails to load, it is a colored tile with the title's first
    character; the color (`--tile-0` … `--tile-5`) is picked from the key. While a game is still
    publishing, its card is not a link and its title is followed by "（发布中…）". The "…" button is marked active on
  `#contents` and on uploaded games. While an uploaded game is open, its title is shown right after
  "…" in the nav (`#nav-current`, a plain label, not a button). `contents` is a reserved key.
- **Uploaded pages (⚙ 管理):**
  - Files live at `pages/uploads/<key>.html`, plus an optional picture `pages/uploads/<key>.<thumb>`.
    The list lives in `js/uploaded-pages.js` as
    `window.MINGDE_UPLOADED_PAGES = [{ key, title, description, textbook, volume, lesson, author, thumb, updated }]`.
    There is no path field: the paths are always built from the key. `thumb` is the picture's
    extension (`"png"`, `"jpg"` or `"webp"`), or `""` (also when missing) for no picture. Key `^[a-z0-9][a-z0-9-]{0,39}$`, not a
    built-in key, not `contents` and not `manage`. Title 1–40 characters. Description 0–200 characters.
    Textbook (教材, e.g. 人教语文) 0–40 characters. Volume (册, e.g. 二年级上册) 0–20 characters.
    Lesson (课) a whole number 1–999, or `null` when empty; it is shown as 第三课 (Chinese numerals
    up to 99, digits from 100) and sorts by number. Author 0–40 characters. All are set in the
    Upload and Edit forms. Missing text fields read as `""` and a missing lesson as `null`. Older
    entries have one `book` text instead: it is read as the textbook, and the next commit saves it
    that way. `main.js` and `manage.js` each have their own copy of the lesson-label helper.
  - The list is a script, not JSON, so it also loads from `file://`. `manage.js` writes it in
    an exact format (`serializeList` / `parseList`), so don't hand-edit its layout.
  - `js/manage.js` commits through the GitHub Git Data API (blob → tree → commit → update ref).
    Each upload, replace, edit or delete is **one commit** that contains the page file, the
    picture (if one changes) and the list. Upload/Replace and Edit take an optional new picture;
    leaving it empty keeps the current one. Edit can also remove it. When the extension changes or
    the picture is removed, the old file is deleted in the same commit; Delete removes the page and
    its picture. On 422 (`main` moved) it retries once. Owner, repo and branch are constants at the
    top of `manage.js`.
  - After a commit it checks the live site's `js/uploaded-pages.js?t=…` every 10 s, for up to
    5 min, until it matches. Meanwhile, the game's card on the contents page shows "（发布中…）"
    and isn't a link.
  - `manage.js` and `main.js` talk only through the DOM event
    `document.dispatchEvent(new CustomEvent("pages-changed", { detail: { pages, publishing, status } }))`.
  - Over http(s), `main.js` reloads `js/uploaded-pages.js?t=<now>` once, to get past GitHub's
    ~10 min cache.
  - User text (titles, descriptions, textbooks, volumes, authors) is only ever shown with `textContent` or attributes,
    never with `innerHTML`.
  - Picture limits: `.png`, `.jpg`/`.jpeg` (saved as `jpg`) or `.webp`, not empty, at most
    `THUMB_MAX_MB` (1).
  - Thumbnails from the game: the game's HTML is searched **as text** (its scripts never run) for
    embedded `data:image/png|jpeg|webp|gif;base64,…` pictures (also with `\/` from JS/JSON strings).
    Small ones (icons) are skipped and duplicates dropped. The biggest, up to `THUMB_CHOICES_MAX` (6),
    are cropped to 4:3 on a canvas (tall: keep the top; wide: keep the middle), scaled to 640×480
    and saved as WebP (JPEG where the browser can't write WebP). They show as buttons under the
    form (`#upload-thumb-pick` / `#edit-thumb-pick`), plus a last "No picture" / "Keep current".
    - Upload: runs when a game file is chosen. The first thumbnail is preselected, except when
      replacing a game that already has a picture (then "Keep current").
    - Edit: "从游戏生成 / From the game" loads `pages/uploads/<key>.html` from the live site.
    - Which picture is saved: a picture file chosen by hand, then (Edit) "Remove the picture",
      then the chosen thumbnail; with none of them the current picture is kept.
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
  no `import`/`export`. `fetch()` is used only in `manage.js`: for `api.github.com`, for the
  live-site check, and for Edit → "From the game" (the game's HTML from the live site).
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
   `BUILTIN_PAGES` (optionally also `author: "…"`). Built-in games are not listed on the
   contents page.
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
- "…" opens `#contents`: a card for every uploaded game and none for the built-in ones, each with
  a thumbnail (the picture, or a colored tile with the title's first character) and only the title.
  Hovering a card shows its description, textbook · volume · lesson and author. The filter bar has
  Field (Title, 教材/Textbook, 册/Volume, 课/Lesson, Author, 关键词/Text) and, next to it, Value.
  Pick Field = Author and a value: the cards narrow and "作者 = … ✕" appears under the bar. Switch
  Field to Lesson: the values show as 第三课, sort by number and are only that author's lessons.
  Switch Field to 关键词/Text: Value is replaced by a text box; typing `3` or 三 narrows the cards
  (as you type) to that author's lesson 3 (a word from a description works too), and
  "关键词 包含 “3” ✕" appears. Back on Lesson, the Value list has shrunk to match. Switching back
  to Author still shows the chosen author, and back to 关键词 still shows the typed text. ✕ on one
  button removes only that filter. "Clear filters" resets everything (Field back to Title) and
  shows all again; it is disabled when nothing is set. Clicking a card opens its game (with "…"
  still highlighted for uploaded games, and the game's title right after "…"; the title disappears
  on `#contents` and the built-in games). At 375px Field and Value (or the text box) share a row,
  the cards are 2 per row, and there's no horizontal scroll.
- Pictures: upload a game with a picture and its card shows it; Replace without choosing a picture
  keeps it; Edit with a new `.jpg` replaces a `.png` (the old file is gone in that commit); Edit →
  "Remove the picture" brings back the tile; Delete removes both files. A `.gif` or a picture over
  1 MB is refused.
- Thumbnails from the game: choosing `rj-2a-3-adventure.html` in Upload shows one thumbnail (the top
  of its title map) and "No picture"; the thumbnail is preselected and clicking switches the outline.
  A game without embedded pictures says none was found. Edit → "From the game" does the same from
  the live site (from `file://` too). Choosing a picture file by hand wins over the thumbnail.
- ⚙ 管理 without a token: the list is visible, Upload is disabled, and Edit or Delete asks for a token.
  With a token, Upload stays disabled until a file is chosen and Key and Title are filled
  (its tooltip says what's missing); clearing any of them disables it again. Clear empties
  every Upload field (it doesn't bring back the example values).
- Test uploads with a throwaway key (e.g. `test`) on the live site. Each action makes one commit.
  Its card on the contents page shows "（发布中…）" until it is live. Delete it again afterwards, and `git pull`.

## 8. Don'ts
- No frameworks (React, Vue, …), bundlers (Vite, webpack, …), or transpilers.
- No inline `<script>` blocks or inline event handlers in authored files (vendored games excepted).
- Don't edit a vendored game page while working on the shell, or the shell while working on a page.
- Don't add globals (besides `MINGDE_UPLOADED_PAGES`), `fetch()` of local files, or ES modules.
- Never commit a GitHub token, and never write one into a file.
- Don't hand-edit the layout of `js/uploaded-pages.js`; `manage.js` parses it.
- Don't use `innerHTML` with page titles, descriptions, textbooks, volumes or authors.
