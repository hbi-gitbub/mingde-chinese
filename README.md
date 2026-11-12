# 明德中文乐园 (Mingde Chinese)

A small static website of Chinese learning games. It has no build step and no dependencies.

- **中文冒险世界** (`#adventure`): an adventure with six magic levels, plus a teacher mode.
- **拼音泡泡大作战** (`#bubbles`): a pinyin bubble game with a teacher word-list manager.

## Run it

Open `index.html` in a browser. Or serve the folder from the project root:

```powershell
# PowerShell or Git Bash
npx serve .
# or
python -m http.server 8000   # then open http://localhost:8000
```

You can link straight to a game with `index.html#adventure` or `index.html#bubbles`.

## Files

```
index.html                  main page: header, nav, iframe that shows the current game
css/style.css               main page styles (light + dark)
js/main.js                  switches games via the URL hash
pages/adventure-world.html  中文冒险世界 (self-contained, ~19 MB)
pages/pinyin-bubbles.html   拼音泡泡大作战 (self-contained, ~6 MB)
```

## Teacher data

Both games save teacher settings and word lists in the browser's localStorage. The data
stays in the browser and computer where it was saved. Opening the site from disk (`file://`)
and through a server (`http://localhost`) use **separate** storage, so word lists saved in one
won't appear in the other.

See [AGENTS.md](AGENTS.md) for the architecture rules and how to add a page.
