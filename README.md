# 明德中文乐园 (Mingde Chinese)

A small static website of Chinese learning games. It has no build step and no dependencies.

- **中文冒险世界** (`#adventure`): an adventure with six magic levels, plus a teacher mode.
- **拼音泡泡大作战** (`#bubbles`): a pinyin bubble game with a teacher word-list manager.
- **目录 / Contents** (`#contents`, the **…** button): a card for each uploaded game, showing its
  thumbnail picture (or a colored tile with the title's first character) and its title. Hover over a
  card to see its description, textbook, volume, lesson and author. Click a card to open the game;
  its title then shows next to the **…** button. Above the cards, pick a field (title, 教材 /
  textbook, 册 / volume, 课 / lesson, author), then one of its values. Or pick 关键词 / Text and
  type a keyword that the title, description, textbook, volume, lesson or author must contain
  (a lesson matches both `3` and 第三课). Filters add up, e.g. one author's lesson 3. The filters
  that are set are listed under the bar; click ✕ on one to remove it.

## Run it

Open `index.html` in a browser. Or serve the folder from the project root:

```powershell
# PowerShell or Git Bash
npx serve .
# or
python -m http.server 8000   # then open http://localhost:8000
```

You can link straight to a game with `index.html#adventure`, `index.html#bubbles`, or
`index.html#<key>` for an uploaded game, and to the contents page with `index.html#contents`.

## Add, change or remove games (⚙ 管理)

Teachers can add more games straight from the website. Each change is saved as a commit in
this GitHub repo, and GitHub Pages publishes it for every visitor about **1–2 minutes** later.

**1. Create a GitHub token (once).**
1. On GitHub, go to Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Expiration: 90 days. Repository access: **Only select repositories** → `mingde-chinese`.
3. Repository permissions: **Contents → Read and write**.
4. Generate the token and copy it. It starts with `github_pat_`.

**2. Use it on the site.** Click **⚙ 管理** (top right), paste the token and press **Use**.
- The token is kept only for this visit, unless you tick **Remember on this device**.
- Never put the token in a file or share it.
- Uploaded pages run on the same site as the token, so only upload pages you trust.

**3. Manage pages.**
- **Upload:** choose an `.html` file (at most 50 MB). Enter a **key**: a–z, 0–9 and `-`. It is
  used in the link `#key` and in the file name, and can't be changed later. Enter a **title**,
  an optional **description**, and optionally the **教材 / textbook** (e.g. 人教语文), the
  **册 / volume** (e.g. 二年级上册), the **课 / lesson** as a number (3 is shown as 第三课), the **author** and a **缩略图 / thumbnail
  picture** (PNG, JPG or WebP, at most 1 MB; a 4:3 landscape picture fits best).
  You usually don't need your own picture: after you choose the game file, the site makes
  thumbnails from the pictures inside the game and shows them under the form. The first one is
  already chosen; click another one or **No picture** to change it. A picture file you choose
  yourself is used instead.
  The form starts filled in with example values (key `rj-2a-3-adventure`, title 中文冒险世界,
  description 六大魔法关卡，闯关学中文, textbook 人教语文, volume 二年级上册, lesson 3, author 王老师). Change them as
  needed, or press **Clear** to empty every field. Choosing a file replaces the example key with the file name, unless you
  typed your own key. The **Upload** button works only once a token is set and the file, key
  and title are filled in; hover over it to see what's missing. Uploaded games appear as cards on the contents page (**…**), not as
  their own button. While the game opens, the line under the buttons shows "description · 作者：author".
  Its card shows "（发布中…）" until the page is live.
- **Edit:** change the title, description, textbook, volume, lesson or author, choose a new
  picture, press **从游戏生成 / From the game** to make thumbnails from the game (it loads the game
  from the website), or tick **Remove the picture**. The game file isn't uploaded again.
- **Replace:** upload a new version of the file under the same key. If the game already has a
  picture, **Keep current** is chosen; click a thumbnail to use it instead.
- **Delete:** removes the game and its picture.
- The built-in games (中文冒险世界, 拼音泡泡大作战) can't be changed here.

**Limits**
- An upload must be **one self-contained HTML file**. Pictures, sounds or scripts it links to
  are not uploaded.
- GitHub rejects files over 100 MB, and the site should stay under 1 GB in total.
- Replacing a file keeps the old version in the git history, so the repo grows with every replace.
- GitHub Pages publishes about 10 times per hour at most. Later changes go live a little late.
- From `file://`, a newly uploaded game only appears after `git pull`.

**If you also edit the code on your computer:** the site commits to `main`, so run `git pull`
before you start and again before you push.

## Files

```
index.html                  main page: header (⚙ 管理), nav (2 games + … + open game's title), description line, iframe,
                            contents page (filters + cards), Manage dialog
css/style.css               main page styles (light + dark)
js/main.js                  switches games via the URL hash; builds the contents cards and their filters
js/manage.js                ⚙ 管理: upload / replace / edit / delete through the GitHub API
js/uploaded-pages.js        list of uploaded games (written by the site; don't hand-edit)
pages/adventure-world.html  中文冒险世界 (self-contained, ~19 MB)
pages/pinyin-bubbles.html   拼音泡泡大作战 (self-contained, ~6 MB)
pages/uploads/              games uploaded from the site (<key>.html) and their pictures (<key>.png/.jpg/.webp)
```

## Teacher data

Both games save teacher settings and word lists in the browser's localStorage. The data
stays in the browser and computer where it was saved. Opening the site from disk (`file://`)
and through a server (`http://localhost`) use **separate** storage, so word lists saved in one
won't appear in the other.

See [AGENTS.md](AGENTS.md) for the architecture rules and how to add a page.
