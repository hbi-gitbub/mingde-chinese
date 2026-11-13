# 明德中文乐园 (Mingde Chinese)

A small static website of Chinese learning games. It has no build step and no dependencies.

- **中文冒险世界** (`#adventure`): an adventure with six magic levels, plus a teacher mode.
- **拼音泡泡大作战** (`#bubbles`): a pinyin bubble game with a teacher word-list manager.
- **目录 / Contents** (`#contents`, the **…** button): a table of the uploaded games (title,
  description, author). Click a title to open the game. Each column header has a drop-down to filter the rows.

## Run it

Open `index.html` in a browser. Or serve the folder from the project root:

```powershell
# PowerShell or Git Bash
npx serve .
# or
python -m http.server 8000   # then open http://localhost:8000
```

You can link straight to a game with `index.html#adventure`, `index.html#bubbles`, or
`index.html#<key>` for an uploaded game, and to the table with `index.html#contents`.

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
  an optional **description** and an optional **author**. Uploaded games appear in the
  contents table (**…**), not as their own button. While the game opens, the line under the
  buttons shows "description · 作者：author". Its title in the table shows "（发布中…）" until the page is live.
- **Edit:** change the title, description or author. The file isn't uploaded again.
- **Replace:** upload a new version of the file under the same key.
- **Delete:** removes the page and its button.
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
index.html                  main page: header (⚙ 管理), nav (2 games + …), description line, iframe,
                            contents table, Manage dialog
css/style.css               main page styles (light + dark)
js/main.js                  switches games via the URL hash; builds the contents table and its filters
js/manage.js                ⚙ 管理: upload / replace / edit / delete through the GitHub API
js/uploaded-pages.js        list of uploaded games (written by the site; don't hand-edit)
pages/adventure-world.html  中文冒险世界 (self-contained, ~19 MB)
pages/pinyin-bubbles.html   拼音泡泡大作战 (self-contained, ~6 MB)
pages/uploads/              games uploaded from the site
```

## Teacher data

Both games save teacher settings and word lists in the browser's localStorage. The data
stays in the browser and computer where it was saved. Opening the site from disk (`file://`)
and through a server (`http://localhost`) use **separate** storage, so word lists saved in one
won't appear in the other.

See [AGENTS.md](AGENTS.md) for the architecture rules and how to add a page.
