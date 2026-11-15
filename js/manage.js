"use strict";

// ⚙ 管理 dialog: upload, replace, edit and delete game pages by committing to the GitHub repo.
// Every change is ONE commit (the page file + js/uploaded-pages.js), so GitHub Pages rebuilds
// once and the file and the list never get out of step. Talks to main.js only through the
// "pages-changed" DOM event.
(() => {
  const OWNER = "hbi-gitbub";
  const REPO = "mingde-chinese";
  const BRANCH = "main";
  const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const SITE_URL = `https://${OWNER}.github.io/${REPO}/`;
  const LIST_PATH = "js/uploaded-pages.js";
  const LIST_HEADER =
    '"use strict";\n' +
    "// List of uploaded game pages. Written by the site's ⚙ 管理 dialog (js/manage.js); " +
    "don't hand-edit the format.\n";
  const UPLOAD_DIR = "pages/uploads";
  const MAX_UPLOAD_MB = 50;
  const LARGE_UPLOAD_MB = 25;
  const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const TITLE_MAX = 40;
  const DESC_MAX = 200;
  const AUTHOR_MAX = 40;
  const TEXTBOOK_MAX = 40;
  const VOLUME_MAX = 20;
  const LESSON_MAX = 999;
  const CN_DIGITS = "零一二三四五六七八九";
  // Optional thumbnail picture, saved as pages/uploads/<key>.<ext> in the same commit.
  const THUMB_EXTS = ["png", "jpg", "webp"];
  const THUMB_MAX_MB = 1;
  // Thumbnails made from the pictures embedded in a game file: 4:3, at most this many choices.
  const THUMB_WIDTH = 640;
  const THUMB_HEIGHT = 480;
  const THUMB_CHOICES_MAX = 6;
  const THUMB_SOURCES_MAX = 20; // biggest embedded pictures looked at
  const THUMB_SOURCE_MIN_B64 = 4000; // smaller data: URLs are icons
  const THUMB_SOURCE_MIN_PX = 160; // pictures narrower or shorter than this are skipped
  // A picture embedded as a data: URL. JSON and JS strings may write "\/" for "/".
  const DATA_IMAGE_RE = /data:image\\?\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/\\]+={0,2})/g;
  const TOKEN_STORAGE_KEY = "mingde.githubToken";
  const POLL_INTERVAL_MS = 10 * 1000;
  const POLL_LIMIT_MS = 5 * 60 * 1000;
  const MB = 1024 * 1024;
  const PUBLISHING_STATUS = "发布中… / Publishing…";

  // Keep our own reference, taken before any game page loads, so a page in the iframe
  // can't replace fetch and see the token.
  const nativeFetch = window.fetch.bind(window);

  const byId = (id) => document.getElementById(id);
  const dialog = byId("manage-dialog");
  const manageBtn = byId("manage-btn");
  const closeBtn = byId("manage-close");
  const tokenState = byId("token-state");
  const tokenInput = byId("token-input");
  const tokenUse = byId("token-use");
  const tokenForget = byId("token-forget");
  const tokenRemember = byId("token-remember");
  const uploadForm = byId("upload-form");
  const uploadFile = byId("upload-file");
  const uploadNote = byId("upload-note");
  const uploadKey = byId("upload-key");
  const uploadTitle = byId("upload-title");
  const uploadDesc = byId("upload-desc");
  const uploadTextbook = byId("upload-textbook");
  const uploadVolume = byId("upload-volume");
  const uploadLesson = byId("upload-lesson");
  const uploadAuthor = byId("upload-author");
  const uploadThumb = byId("upload-thumb");
  const uploadSubmit = uploadForm.querySelector('button[type="submit"]');
  const listNote = byId("list-note");
  const pageList = byId("page-list");
  const editForm = byId("edit-form");
  const editHeading = byId("edit-heading");
  const editTitle = byId("edit-title");
  const editDesc = byId("edit-desc");
  const editTextbook = byId("edit-textbook");
  const editVolume = byId("edit-volume");
  const editLesson = byId("edit-lesson");
  const editAuthor = byId("edit-author");
  const editThumb = byId("edit-thumb");
  const editThumbRemove = byId("edit-thumb-remove");
  const editThumbRemoveRow = byId("edit-thumb-remove-row");
  const editFromGame = byId("edit-thumb-from-game");
  const editCancel = byId("edit-cancel");
  const statusEl = byId("manage-status");

  // The fields of each form, by entry property (in the order they are saved).
  const uploadFields = {
    title: uploadTitle,
    description: uploadDesc,
    textbook: uploadTextbook,
    volume: uploadVolume,
    lesson: uploadLesson,
    author: uploadAuthor,
  };
  const editFields = {
    title: editTitle,
    description: editDesc,
    textbook: editTextbook,
    volume: editVolume,
    lesson: editLesson,
    author: editAuthor,
  };

  // Keys that uploaded pages may not use: the built-in games, "contents" and "manage".
  const RESERVED_KEYS = new Set(["contents", "manage"]);
  document.querySelectorAll(".nav-btn[data-builtin]").forEach((btn) => {
    RESERVED_KEYS.add(btn.dataset.page);
  });

  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  let token = loadSavedToken();
  let list = [];
  let listFromApi = false;
  let busy = false;
  let editingKey = null;
  const publishing = new Set();
  let pollRun = 0;

  // ---------- small helpers ----------

  function loadSavedToken() {
    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function saveToken(value) {
    try {
      if (value) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, value);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Storage blocked (private window, file:// in some browsers): keep it in memory only.
    }
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function nowIso() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  function pagePath(key) {
    return `${UPLOAD_DIR}/${key}.html`;
  }

  function thumbPath(key, ext) {
    return `${UPLOAD_DIR}/${key}.${ext}`;
  }

  // "png", "jpg" or "webp" from the file name ("" if it isn't one of those).
  function thumbExt(file) {
    const match = /\.(png|jpe?g|webp)$/i.exec(file.name);
    if (!match) return "";
    const ext = match[1].toLowerCase();
    return ext === "jpeg" ? "jpg" : ext;
  }

  function cleanText(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  }

  // A lesson is a whole number 1–LESSON_MAX, or null when not set.
  function cleanLesson(value) {
    return Number.isInteger(value) && value >= 1 && value <= LESSON_MAX ? value : null;
  }

  // 3 → "三", 12 → "十二", 25 → "二十五"; 100 and up stay as digits.
  function chineseNumber(n) {
    if (n < 10) return CN_DIGITS[n];
    if (n < 100) {
      const tens = Math.floor(n / 10);
      const ones = n % 10;
      return `${tens > 1 ? CN_DIGITS[tens] : ""}十${ones ? CN_DIGITS[ones] : ""}`;
    }
    return String(n);
  }

  function lessonLabel(lesson) {
    return lesson === null ? "" : `第${chineseNumber(lesson)}课`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setStatus(text, kind = "") {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  }

  function setBusy(value) {
    busy = value;
    dialog.setAttribute("aria-busy", String(value));
    dialog.querySelectorAll("button, input, textarea").forEach((control) => {
      if (control !== closeBtn) control.disabled = value;
    });
    updateUploadButton();
  }

  // Upload is enabled only with a token and the required fields (file, key, title) filled.
  // The full checks still run on submit.
  function updateUploadButton() {
    let missing = "";
    if (!token) {
      missing = "请先在 ① 输入令牌 / Enter a GitHub token in section ① first.";
    } else if (!uploadFile.files[0]) {
      missing = "请选择文件 / Choose a file.";
    } else if (!uploadKey.value.trim()) {
      missing = "请填写键 / Enter a key.";
    } else if (!uploadTitle.value.trim()) {
      missing = "请填写标题 / Enter a title.";
    }
    uploadSubmit.disabled = busy || Boolean(missing);
    uploadSubmit.title = missing;
  }

  // ---------- the list of uploaded pages ----------

  function cleanEntries(raw) {
    const result = [];
    if (!Array.isArray(raw)) return result;
    const seen = new Set();
    raw.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const { key, title } = entry;
      if (typeof key !== "string" || !KEY_PATTERN.test(key)) return;
      if (RESERVED_KEYS.has(key) || seen.has(key)) return;
      if (typeof title !== "string" || !title.trim() || title.length > TITLE_MAX) return;
      seen.add(key);
      result.push({
        key,
        title: title.trim(),
        description:
          typeof entry.description === "string" ? entry.description.slice(0, DESC_MAX) : "",
        // Older entries have a single "book" text instead (or nothing): it becomes the textbook,
        // and the next commit saves it that way.
        textbook: cleanText(
          Object.prototype.hasOwnProperty.call(entry, "textbook") ? entry.textbook : entry.book,
          TEXTBOOK_MAX,
        ),
        volume: cleanText(entry.volume, VOLUME_MAX),
        lesson: cleanLesson(entry.lesson),
        author: cleanText(entry.author, AUTHOR_MAX),
        // The picture's file extension, or "" when the game has no picture.
        thumb: THUMB_EXTS.includes(entry.thumb) ? entry.thumb : "",
        updated: typeof entry.updated === "string" ? entry.updated : "",
      });
    });
    return result;
  }

  function siteList() {
    return cleanEntries(window.MINGDE_UPLOADED_PAGES);
  }

  function serializeList(entries) {
    return `${LIST_HEADER}window.MINGDE_UPLOADED_PAGES = ${JSON.stringify(entries, null, 2)};\n`;
  }

  function parseList(text) {
    const match = /window\.MINGDE_UPLOADED_PAGES\s*=\s*([\s\S]*?);\s*$/.exec(text);
    if (!match) throw new Error(`${LIST_PATH} 格式不对 / ${LIST_PATH} has an unexpected format.`);
    return cleanEntries(JSON.parse(match[1]));
  }

  function decodeBase64Utf8(b64) {
    const binary = window.atob(b64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const dataUrl = String(reader.result);
        resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
      });
      reader.addEventListener("error", () => {
        reject(reader.error || new Error("无法读取文件 / Could not read the file."));
      });
      reader.readAsDataURL(file);
    });
  }

  // Tell main.js to redraw the contents page.
  function notifyPages(status) {
    const detail = { pages: list.map((page) => ({ ...page })), publishing: [...publishing] };
    if (status !== undefined) detail.status = status;
    document.dispatchEvent(new CustomEvent("pages-changed", { detail }));
  }

  // ---------- GitHub REST API ----------

  async function api(path, method = "GET", body) {
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    };
    const init = { method, headers, cache: "no-store" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await nativeFetch(`${API_BASE}/${path}`, init);
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = (await res.json()).message || message;
      } catch {
        // Not JSON: keep the status text.
      }
      throw new ApiError(res.status, message);
    }
    return res.json();
  }

  async function readListAt(ref) {
    try {
      const file = await api(`contents/${LIST_PATH}?ref=${encodeURIComponent(ref)}`);
      return parseList(decodeBase64Utf8(file.content || ""));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return [];
      throw err;
    }
  }

  async function uploadedFileNames(ref) {
    try {
      const entries = await api(`contents/${UPLOAD_DIR}?ref=${encodeURIComponent(ref)}`);
      return new Set(Array.isArray(entries) ? entries.map((entry) => entry.name) : []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return new Set();
      throw err;
    }
  }

  // One commit on top of the newest main. `update(before, parentSha)` gets the list as it is
  // in the repo and returns { list, message, files } (extra tree entries).
  async function commitChange(update) {
    for (let attempt = 1; ; attempt += 1) {
      const ref = await api(`git/ref/heads/${BRANCH}`);
      const parentSha = ref.object.sha;
      const parent = await api(`git/commits/${parentSha}`);
      const before = await readListAt(parentSha);
      const { list: next, message, files } = await update(before, parentSha);
      const listText = serializeList(next);
      const tree = await api("git/trees", "POST", {
        base_tree: parent.tree.sha,
        tree: [{ path: LIST_PATH, mode: "100644", type: "blob", content: listText }, ...files],
      });
      const commit = await api("git/commits", "POST", {
        message,
        tree: tree.sha,
        parents: [parentSha],
      });
      try {
        await api(`git/refs/heads/${BRANCH}`, "PATCH", { sha: commit.sha });
        return { list: next, listText };
      } catch (err) {
        // 422: main moved on while we worked (another commit landed). Start again once.
        if (attempt < 2 && err instanceof ApiError && err.status === 422) continue;
        throw err;
      }
    }
  }

  function describeError(err) {
    if (err instanceof ApiError) {
      switch (err.status) {
        case 401:
          return "令牌无效或已过期 / The token is invalid or has expired.";
        case 403:
          return `没有权限，令牌需要 Contents: Read and write / Not allowed: the token needs Contents read and write. (${err.message})`;
        case 404:
          return "找不到仓库，或令牌无权访问它 / Repository not found, or the token has no access to it.";
        case 409:
        case 422:
          return `GitHub 拒绝了这次修改，请重试 / GitHub rejected the change, please try again. (${err.message})`;
        default:
          return `GitHub ${err.status}: ${err.message}`;
      }
    }
    if (err instanceof TypeError) {
      return "网络错误，请检查网络后重试 / Network error. Check the connection and try again.";
    }
    return err && err.message ? err.message : String(err);
  }

  // ---------- publishing ----------

  // Wait until GitHub Pages serves the list we just committed. The page file is in the same
  // commit, so once the list is live the page is live too.
  async function watchPublish(listText) {
    const run = ++pollRun;
    const expected = listText.trim();
    const started = Date.now();
    while (Date.now() - started < POLL_LIMIT_MS) {
      await delay(POLL_INTERVAL_MS);
      if (run !== pollRun) return; // a newer change is being watched instead
      try {
        const res = await nativeFetch(`${SITE_URL}${LIST_PATH}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok && (await res.text()).trim() === expected) {
          if (run !== pollRun) return;
          publishing.clear();
          setStatus("✓ 已上线 / Live on the site.", "ok");
          notifyPages("✓ 已上线 / Live");
          return;
        }
      } catch {
        // Offline or blocked: try again next round.
      }
    }
    if (run !== pollRun) return;
    publishing.clear();
    setStatus(
      "发布时间比平常长，请几分钟后刷新网站 / Publishing is taking longer than usual. Reload the site in a few minutes.",
    );
    notifyPages("发布较慢，请稍后刷新 / Still publishing, reload later");
  }

  function afterCommit(result, key, waitForFile) {
    list = result.list;
    listFromApi = true;
    renderList();
    if (waitForFile) publishing.add(key);
    notifyPages(PUBLISHING_STATUS);
    watchPublish(result.listText);
  }

  // ---------- operations ----------

  // Send the chosen picture to GitHub as a blob: { ext, sha }, or null when none was chosen.
  async function uploadThumbBlob(file) {
    if (!file) return null;
    setStatus("正在上传图片… / Uploading the picture…");
    const content = await readAsBase64(file);
    const blob = await api("git/blobs", "POST", { content, encoding: "base64" });
    return { ext: thumbExt(file), sha: blob.sha };
  }

  // The picture part of a commit. `newThumb` (from uploadThumbBlob) replaces the picture,
  // `remove` drops it, neither keeps `oldThumb`. The old file is deleted when its name changes
  // (another extension) or the picture is removed. Returns { thumb, files }.
  async function thumbChanges(key, oldThumb, newThumb, remove, parentSha) {
    const files = [];
    let thumb = oldThumb;
    if (newThumb) {
      thumb = newThumb.ext;
      files.push({ path: thumbPath(key, thumb), mode: "100644", type: "blob", sha: newThumb.sha });
    } else if (remove) {
      thumb = "";
    }
    if (oldThumb && oldThumb !== thumb) {
      // Deleting a path that isn't in the tree makes GitHub reject the whole commit.
      const names = await uploadedFileNames(parentSha);
      if (names.has(`${key}.${oldThumb}`)) {
        files.push({ path: thumbPath(key, oldThumb), mode: "100644", type: "blob", sha: null });
      }
    }
    return { thumb, files };
  }

  // `fields` comes from pageFields(): key, title, description, textbook, volume, lesson, author.
  // `thumbFile` is the chosen picture, or undefined to keep the current one (if any).
  async function uploadPage(file, fields, thumbFile) {
    const { key } = fields;
    setStatus("正在读取文件… / Reading the file…");
    const content = await readAsBase64(file);
    setStatus(
      `正在上传 ${(file.size / MB).toFixed(1)} MB… / Uploading ${(file.size / MB).toFixed(1)} MB…`,
    );
    const blob = await api("git/blobs", "POST", { content, encoding: "base64" });
    const newThumb = await uploadThumbBlob(thumbFile);
    setStatus("正在提交… / Committing…");
    return commitChange(async (before, parentSha) => {
      const next = before.slice();
      const index = next.findIndex((page) => page.key === key);
      const oldThumb = index >= 0 ? next[index].thumb : "";
      const picture = await thumbChanges(key, oldThumb, newThumb, false, parentSha);
      const entry = { ...fields, thumb: picture.thumb, updated: nowIso() };
      if (index >= 0) {
        next[index] = entry;
      } else {
        next.push(entry);
      }
      return {
        list: next,
        message: `${index >= 0 ? "Replace" : "Upload"} page ${key}`,
        files: [
          { path: pagePath(key), mode: "100644", type: "blob", sha: blob.sha },
          ...picture.files,
        ],
      };
    });
  }

  // `thumbFile`: a new picture (or undefined). `removeThumb`: drop the picture.
  async function editPage(fields, thumbFile, removeThumb) {
    const { key } = fields;
    const newThumb = await uploadThumbBlob(thumbFile);
    setStatus("正在提交… / Committing…");
    return commitChange(async (before, parentSha) => {
      const next = before.slice();
      const index = next.findIndex((page) => page.key === key);
      if (index < 0) throw new Error("这个页面已不存在 / This page no longer exists.");
      const picture = await thumbChanges(key, next[index].thumb, newThumb, removeThumb, parentSha);
      next[index] = { ...next[index], ...fields, thumb: picture.thumb, updated: nowIso() };
      return { list: next, message: `Edit page ${key}`, files: picture.files };
    });
  }

  // Removes the page file and its picture (whatever its extension).
  async function deletePage(key) {
    setStatus("正在删除… / Deleting…");
    return commitChange(async (before, parentSha) => {
      const names = await uploadedFileNames(parentSha);
      const files = ["html", ...THUMB_EXTS]
        .filter((ext) => names.has(`${key}.${ext}`))
        .map((ext) => ({ path: `${UPLOAD_DIR}/${key}.${ext}`, mode: "100644", type: "blob", sha: null }));
      return {
        list: before.filter((page) => page.key !== key),
        message: `Delete page ${key}`,
        files,
      };
    });
  }

  function needToken() {
    if (token) return true;
    setStatus("请先在 ① 输入令牌 / Enter a GitHub token in section ① first.", "error");
    tokenInput.focus();
    return false;
  }

  async function runTask(work) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (err) {
      setStatus(describeError(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function refreshList() {
    if (!token || busy) return;
    await runTask(async () => {
      setStatus("正在从 GitHub 读取列表… / Loading the list from GitHub…");
      const ref = await api(`git/ref/heads/${BRANCH}`);
      list = await readListAt(ref.object.sha);
      listFromApi = true;
      renderList();
      notifyPages();
      setStatus("✓ 令牌可用，列表已更新 / Token works. List loaded from GitHub.", "ok");
    });
  }

  // ---------- thumbnails made from the game ----------
  // The game's HTML is only searched as text: none of its scripts run.

  // The biggest distinct pictures embedded in the HTML, as data: URLs.
  function findEmbeddedImages(html) {
    const seen = new Set();
    const found = [];
    for (const match of html.matchAll(DATA_IMAGE_RE)) {
      const data = match[2].replace(/\\/g, "");
      if (data.length < THUMB_SOURCE_MIN_B64) continue;
      const id = `${data.length}:${data.slice(-64)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      found.push(`data:image/${match[1]};base64,${data}`);
    }
    return found.sort((a, b) => b.length - a.length).slice(0, THUMB_SOURCES_MAX);
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.addEventListener("load", () => resolve(img));
      img.addEventListener("error", () => reject(new Error("unreadable picture")));
      img.src = url;
    });
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  // Crop to 4:3 and scale to THUMB_WIDTH × THUMB_HEIGHT. A tall picture keeps its top (where the
  // title usually is), a wide one its middle. WebP, or JPEG where the browser can't write WebP.
  async function makeThumb(img) {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const ratio = THUMB_WIDTH / THUMB_HEIGHT;
    let sx = 0;
    let sw = width;
    let sh = height;
    if (width / height > ratio) {
      sw = Math.round(height * ratio);
      sx = Math.round((width - sw) / 2);
    } else {
      sh = Math.round(width / ratio);
    }
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, 0, sw, sh, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    let blob = await canvasBlob(canvas, "image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") {
      // JPEG has no transparency: put the page's surface color behind the picture.
      const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
      if (surface) {
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = surface;
        ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
      }
      blob = await canvasBlob(canvas, "image/jpeg", 0.85);
    }
    if (!blob) throw new Error("无法生成缩略图 / Could not make the thumbnail.");
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `thumbnail.${ext}`, { type: blob.type });
  }

  // Thumbnail files made from the game's pictures, biggest picture first.
  async function thumbsFromHtml(html) {
    const files = [];
    for (const url of findEmbeddedImages(html)) {
      try {
        const img = await loadImage(url);
        if (Math.min(img.naturalWidth, img.naturalHeight) < THUMB_SOURCE_MIN_PX) continue;
        files.push(await makeThumb(img));
      } catch {
        // Not a picture the browser can read: skip it.
      }
      if (files.length >= THUMB_CHOICES_MAX) break;
    }
    return files;
  }

  // The thumbnail choices under a form. `selected` is an index into `files`, or -1 for the
  // last button ("No picture" / "Keep current").
  function makePicker(prefix) {
    return {
      box: byId(`${prefix}-thumb-pick`),
      note: byId(`${prefix}-thumb-pick-note`),
      choices: byId(`${prefix}-thumb-choices`),
      files: [],
      urls: [],
      selected: -1,
      run: 0,
    };
  }

  const uploadPicker = makePicker("upload");
  const editPicker = makePicker("edit");

  function clearPicker(picker) {
    picker.run += 1; // a scan still running for this form is dropped
    picker.urls.forEach((url) => URL.revokeObjectURL(url));
    picker.files = [];
    picker.urls = [];
    picker.selected = -1;
    picker.choices.replaceChildren();
    picker.note.textContent = "";
    picker.box.hidden = true;
  }

  function choiceButton(index, pressed) {
    const btn = el("button", "thumb-choice");
    btn.type = "button";
    btn.dataset.index = String(index);
    btn.setAttribute("aria-pressed", String(pressed));
    btn.disabled = busy;
    return btn;
  }

  function renderPicker(picker, noneLabel) {
    const buttons = picker.urls.map((url, index) => {
      const btn = choiceButton(index, picker.selected === index);
      btn.setAttribute("aria-label", `缩略图 ${index + 1} / Thumbnail ${index + 1}`);
      const img = el("img");
      img.src = url;
      img.alt = "";
      btn.append(img);
      return btn;
    });
    const none = choiceButton(-1, picker.selected === -1);
    none.classList.add("thumb-choice-none");
    none.textContent = noneLabel;
    picker.choices.replaceChildren(...buttons, none);
  }

  // The chosen thumbnail as a File, or undefined.
  function pickerFile(picker) {
    return picker.files[picker.selected];
  }

  // Find pictures in a game and offer them as thumbnails. `readHtml` returns the game's HTML.
  // `hasThumb`: the game already has a picture, so the last choice reads "Keep current".
  async function scanGame(picker, readHtml, { hasThumb, preferNone }) {
    clearPicker(picker);
    const run = picker.run;
    picker.box.hidden = false;
    picker.note.textContent = "正在从游戏中找图片… / Looking for pictures in the game…";
    try {
      const html = await readHtml();
      if (run !== picker.run) return;
      const files = await thumbsFromHtml(html);
      if (run !== picker.run) return;
      if (files.length === 0) {
        picker.note.textContent =
          "游戏里没有找到合适的图片，可以自己选一张图片 / No suitable picture in the game. You can choose a picture file instead.";
        return;
      }
      picker.files = files;
      picker.urls = files.map((file) => URL.createObjectURL(file));
      picker.selected = preferNone ? -1 : 0;
      picker.note.textContent =
        "用游戏里的图片做的缩略图，点一下选择；上面选了图片文件时以文件为准 / Thumbnails made from the game's pictures: click one to choose it. A picture file chosen above is used instead.";
      renderPicker(
        picker,
        hasThumb ? "保留原图片 / Keep current" : "不用图片 / No picture",
      );
    } catch (err) {
      if (run !== picker.run) return;
      picker.note.textContent = describeError(err);
    }
  }

  // The uploaded game as it is on the live site (it may still be publishing).
  async function fetchLiveGame(key) {
    const res = await nativeFetch(`${SITE_URL}${pagePath(key)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(
        `无法读取网站上的游戏（HTTP ${res.status}），如刚上传请等它上线 / Couldn't load the game from the site (HTTP ${res.status}). If it was just uploaded, wait until it is live.`,
      );
    }
    return res.text();
  }

  // ---------- validation ----------

  function fail(field, message) {
    setStatus(message, "error");
    field.focus();
    return false;
  }

  // `fields` is uploadFields or editFields.
  function checkPageFields(fields) {
    const title = fields.title.value.trim();
    if (!title) return fail(fields.title, "请填写标题 / Enter a title.");
    if (title.length > TITLE_MAX) {
      return fail(fields.title, `标题最多 ${TITLE_MAX} 个字 / Title: up to ${TITLE_MAX} characters.`);
    }
    if (fields.description.value.trim().length > DESC_MAX) {
      return fail(fields.description, `说明最多 ${DESC_MAX} 个字 / Description: up to ${DESC_MAX} characters.`);
    }
    if (fields.textbook.value.trim().length > TEXTBOOK_MAX) {
      return fail(fields.textbook, `教材最多 ${TEXTBOOK_MAX} 个字 / Textbook: up to ${TEXTBOOK_MAX} characters.`);
    }
    if (fields.volume.value.trim().length > VOLUME_MAX) {
      return fail(fields.volume, `册最多 ${VOLUME_MAX} 个字 / Volume: up to ${VOLUME_MAX} characters.`);
    }
    // A number field reports "" for text it can't read (like "abc"); badInput catches that.
    const lesson = fields.lesson.value.trim();
    if (
      fields.lesson.validity.badInput ||
      (lesson && (!/^\d+$/.test(lesson) || cleanLesson(Number(lesson)) === null))
    ) {
      return fail(
        fields.lesson,
        `课只能填 1–${LESSON_MAX} 的整数，或留空 / Lesson: a whole number from 1 to ${LESSON_MAX}, or empty.`,
      );
    }
    if (fields.author.value.trim().length > AUTHOR_MAX) {
      return fail(fields.author, `作者最多 ${AUTHOR_MAX} 个字 / Author: up to ${AUTHOR_MAX} characters.`);
    }
    return true;
  }

  // The picture is optional: nothing chosen is fine.
  function checkThumb(field) {
    const file = field.files[0];
    if (!file) return true;
    if (!thumbExt(file)) {
      return fail(field, "图片只能是 PNG、JPG 或 WebP / The picture must be a PNG, JPG or WebP file.");
    }
    if (file.size === 0) return fail(field, "图片是空的 / The picture is empty.");
    if (file.size > THUMB_MAX_MB * MB) {
      return fail(
        field,
        `图片太大（最大 ${THUMB_MAX_MB} MB）/ The picture is larger than ${THUMB_MAX_MB} MB.`,
      );
    }
    return true;
  }

  // The entry's fields as typed in a form. An empty lesson is saved as null.
  function pageFields(key, fields) {
    const lesson = fields.lesson.value.trim();
    return {
      key,
      title: fields.title.value.trim(),
      description: fields.description.value.trim(),
      textbook: fields.textbook.value.trim(),
      volume: fields.volume.value.trim(),
      lesson: lesson ? Number(lesson) : null,
      author: fields.author.value.trim(),
    };
  }

  // Put an entry's fields into a form.
  function fillFields(fields, page) {
    Object.keys(fields).forEach((name) => {
      const value = page[name];
      fields[name].value = value === null || value === undefined ? "" : String(value);
    });
  }

  function checkUploadForm() {
    const file = uploadFile.files[0];
    if (!file) return fail(uploadFile, "请选择文件 / Choose a file.");
    if (!/\.html?$/i.test(file.name)) {
      return fail(uploadFile, "只能上传 .html 文件 / Only .html or .htm files can be uploaded.");
    }
    if (file.size === 0) return fail(uploadFile, "文件是空的 / The file is empty.");
    if (file.size > MAX_UPLOAD_MB * MB) {
      return fail(
        uploadFile,
        `文件太大（最大 ${MAX_UPLOAD_MB} MB）/ The file is larger than ${MAX_UPLOAD_MB} MB.`,
      );
    }
    const key = uploadKey.value.trim();
    if (!KEY_PATTERN.test(key)) {
      return fail(
        uploadKey,
        "键只能用小写字母、数字和 -，以字母或数字开头，最多 40 个 / Key: a–z, 0–9 and -, starting with a letter or digit, up to 40.",
      );
    }
    if (RESERVED_KEYS.has(key)) {
      return fail(uploadKey, `“${key}” 已被内置页面使用 / "${key}" is used by a built-in page.`);
    }
    return checkPageFields(uploadFields) && checkThumb(uploadThumb);
  }

  // ---------- rendering ----------

  function renderTokenState() {
    if (!token) {
      tokenState.textContent = "未设置令牌：只能查看 / No token: view only.";
    } else if (loadSavedToken()) {
      tokenState.textContent = "令牌已设置，保存在此设备 / Token set and saved on this device.";
    } else {
      tokenState.textContent = "令牌已设置，仅本次打开有效 / Token set for this visit only.";
    }
  }

  function actionButton(action, label, page) {
    const btn = el("button", `btn btn-small${action === "delete" ? " btn-danger" : ""}`, label);
    btn.type = "button";
    btn.dataset.action = action;
    btn.dataset.key = page.key;
    btn.setAttribute("aria-label", `${label} ${page.title}`);
    btn.disabled = busy;
    return btn;
  }

  function renderList() {
    const rows = list.map((page) => {
      const row = el("li", "page-row");
      const info = el("div", "page-row-info");
      const title = el("strong", "page-row-title", page.title);
      title.lang = "zh-Hans";
      const desc = el("span", "page-row-desc", page.description || "—");
      desc.lang = "zh-Hans";
      desc.title = page.description;
      info.append(title, el("code", "page-row-key", page.key));
      // "教材：人教语文 · 二年级上册 · 第三课", leaving out the parts that are empty.
      const bookParts = [page.textbook, page.volume, lessonLabel(page.lesson)].filter(Boolean);
      if (bookParts.length > 0) {
        const book = el("span", "page-row-book", `教材：${bookParts.join(" · ")}`);
        book.lang = "zh-Hans";
        info.append(book);
      }
      if (page.author) {
        const author = el("span", "page-row-author", `作者：${page.author}`);
        author.lang = "zh-Hans";
        info.append(author);
      }
      if (page.thumb) info.append(el("span", "page-row-thumb", "有图片 / Has picture"));
      info.append(el("span", "page-row-date", page.updated.slice(0, 10)), desc);
      const actions = el("div", "page-row-actions");
      actions.append(
        actionButton("edit", "编辑 Edit", page),
        actionButton("replace", "替换 Replace", page),
        actionButton("delete", "删除 Delete", page),
      );
      row.append(info, actions);
      return row;
    });
    pageList.replaceChildren(...rows);

    if (list.length === 0) {
      listNote.textContent = "还没有上传的页面 / No uploaded pages yet.";
    } else if (!listFromApi) {
      listNote.textContent =
        "这是网站上的列表；输入令牌后显示 GitHub 上最新的列表 / This is the list on the site. Enter a token to see the newest list from GitHub.";
    } else {
      listNote.textContent = "";
    }
    listNote.hidden = !listNote.textContent;
  }

  function startEdit(page) {
    editingKey = page.key;
    editHeading.textContent = `编辑 / Edit: ${page.title} (${page.key})`;
    fillFields(editFields, page);
    editThumb.value = "";
    editThumbRemove.checked = false;
    editThumbRemoveRow.hidden = !page.thumb;
    clearPicker(editPicker);
    editForm.hidden = false;
    editTitle.focus();
  }

  function stopEdit() {
    editingKey = null;
    clearPicker(editPicker);
    editForm.hidden = true;
  }

  // ---------- events ----------

  manageBtn.addEventListener("click", () => {
    if (!listFromApi) list = siteList();
    tokenRemember.checked = Boolean(loadSavedToken());
    renderTokenState();
    renderList();
    updateUploadButton();
    if (!dialog.open) dialog.showModal();
    if (token && !listFromApi) refreshList();
  });

  closeBtn.addEventListener("click", () => dialog.close());

  tokenUse.addEventListener("click", () => {
    const value = tokenInput.value.trim();
    tokenInput.value = "";
    if (!value) {
      setStatus("请先粘贴令牌 / Paste a token first.", "error");
      tokenInput.focus();
      return;
    }
    token = value;
    saveToken(tokenRemember.checked ? value : "");
    renderTokenState();
    updateUploadButton();
    refreshList();
  });

  tokenInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      tokenUse.click();
    }
  });

  tokenForget.addEventListener("click", () => {
    token = "";
    saveToken("");
    tokenRemember.checked = false;
    listFromApi = false;
    list = siteList();
    renderTokenState();
    renderList();
    updateUploadButton();
    setStatus("令牌已清除 / Token forgotten.");
  });

  tokenRemember.addEventListener("change", () => {
    if (token) saveToken(tokenRemember.checked ? token : "");
    renderTokenState();
  });

  uploadFile.addEventListener("change", () => {
    const file = uploadFile.files[0];
    if (!file) {
      uploadNote.hidden = true;
      clearPicker(uploadPicker);
      return;
    }
    const sizeMb = file.size / MB;
    let note = `${file.name} · ${sizeMb.toFixed(1)} MB`;
    if (sizeMb > LARGE_UPLOAD_MB) {
      note += " · 文件较大，上传可能需要一两分钟 / Large file: the upload may take a minute or two.";
    }
    uploadNote.textContent = note;
    uploadNote.hidden = false;

    // Suggest a key from the file name unless the teacher has typed their own.
    const key = uploadKey.value.trim();
    if (!key || key === uploadKey.defaultValue) {
      const base = file.name.replace(/\.html?$/i, "");
      if (KEY_PATTERN.test(base) && !RESERVED_KEYS.has(base)) uploadKey.value = base;
    }
    updateUploadButton();

    // Offer thumbnails made from the game. When replacing a game that already has a picture,
    // keeping that picture stays the default.
    if (/\.html?$/i.test(file.name)) {
      const existing = list.find((page) => page.key === uploadKey.value.trim());
      const hasThumb = Boolean(existing && existing.thumb);
      scanGame(uploadPicker, () => file.text(), { hasThumb, preferNone: hasThumb });
    } else {
      clearPicker(uploadPicker);
    }
  });

  // Choosing one of the thumbnails made from the game.
  [uploadPicker, editPicker].forEach((picker) => {
    picker.choices.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-index]");
      if (!btn || busy) return;
      picker.selected = Number(btn.dataset.index);
      picker.choices.querySelectorAll("button[data-index]").forEach((choice) => {
        choice.setAttribute("aria-pressed", String(choice === btn));
      });
    });
  });

  // Edit → "From the game": load the game from the live site and offer its pictures.
  editFromGame.addEventListener("click", () => {
    const key = editingKey;
    if (!key || busy) return;
    const page = list.find((entry) => entry.key === key);
    editThumbRemove.checked = false;
    scanGame(editPicker, () => fetchLiveGame(key), {
      hasThumb: Boolean(page && page.thumb),
      preferNone: false,
    });
  });

  // Typing in the key or title, or picking a file.
  uploadForm.addEventListener("input", updateUploadButton);

  // Clear (and uploadForm.reset()) empties every field, instead of going back to the
  // example values written in index.html.
  uploadForm.addEventListener("reset", (event) => {
    event.preventDefault();
    uploadFile.value = "";
    uploadThumb.value = "";
    uploadKey.value = "";
    Object.values(uploadFields).forEach((field) => {
      field.value = "";
    });
    uploadNote.hidden = true;
    clearPicker(uploadPicker);
    updateUploadButton();
  });

  uploadForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || !needToken() || !checkUploadForm()) return;
    const file = uploadFile.files[0];
    // A picture file chosen by hand wins over a thumbnail made from the game.
    const thumbFile = uploadThumb.files[0] || pickerFile(uploadPicker);
    const fields = pageFields(uploadKey.value.trim(), uploadFields);
    const { key } = fields;
    if (
      list.some((page) => page.key === key) &&
      !window.confirm(`“${key}” 已存在，要替换它吗？\nA page with the key "${key}" already exists. Replace it?`)
    ) {
      return;
    }
    runTask(async () => {
      const result = await uploadPage(file, fields, thumbFile);
      uploadForm.reset();
      if (editingKey === key) stopEdit();
      afterCommit(result, key, true);
      setStatus(
        `✓ 已提交 “${fields.title}”，正在发布（约 1–2 分钟）/ Committed. Publishing takes about 1–2 minutes.`,
        "ok",
      );
    });
  });

  pageList.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn || busy) return;
    const page = list.find((entry) => entry.key === btn.dataset.key);
    if (!page) return;

    if (btn.dataset.action === "edit") {
      startEdit(page);
    } else if (btn.dataset.action === "replace") {
      uploadForm.reset();
      uploadKey.value = page.key;
      fillFields(uploadFields, page);
      updateUploadButton();
      setStatus(`请选择新文件来替换 “${page.title}” / Choose the new file to replace "${page.title}".`);
      uploadForm.scrollIntoView({ block: "nearest" });
      uploadFile.focus();
    } else if (btn.dataset.action === "delete") {
      if (!needToken()) return;
      if (!window.confirm(`删除 “${page.title}”（${page.key}）？\nDelete "${page.title}" (${page.key})?`)) {
        return;
      }
      runTask(async () => {
        const result = await deletePage(page.key);
        if (editingKey === page.key) stopEdit();
        afterCommit(result, page.key, false);
        setStatus("✓ 已删除，正在发布（约 1–2 分钟）/ Deleted. Publishing takes about 1–2 minutes.", "ok");
      });
    }
  });

  editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const key = editingKey;
    if (busy || !key || !needToken() || !checkPageFields(editFields) || !checkThumb(editThumb)) return;
    const fields = pageFields(key, editFields);
    // A picture file chosen by hand wins, then "Remove the picture", then a thumbnail from the game.
    const removeThumb = editThumbRemove.checked;
    const thumbFile = editThumb.files[0] || (removeThumb ? undefined : pickerFile(editPicker));
    runTask(async () => {
      const result = await editPage(fields, thumbFile, removeThumb);
      stopEdit();
      afterCommit(result, key, false);
      setStatus("✓ 已保存，正在发布（约 1–2 分钟）/ Saved. Publishing takes about 1–2 minutes.", "ok");
    });
  });

  editCancel.addEventListener("click", stopEdit);

  updateUploadButton();
})();
