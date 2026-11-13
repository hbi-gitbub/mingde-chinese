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
  const BOOK_MAX = 40;
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
  const uploadBook = byId("upload-book");
  const uploadAuthor = byId("upload-author");
  const listNote = byId("list-note");
  const pageList = byId("page-list");
  const editForm = byId("edit-form");
  const editHeading = byId("edit-heading");
  const editTitle = byId("edit-title");
  const editDesc = byId("edit-desc");
  const editBook = byId("edit-book");
  const editAuthor = byId("edit-author");
  const editCancel = byId("edit-cancel");
  const statusEl = byId("manage-status");

  // The text fields of each form, by entry property.
  const uploadFields = { title: uploadTitle, description: uploadDesc, book: uploadBook, author: uploadAuthor };
  const editFields = { title: editTitle, description: editDesc, book: editBook, author: editAuthor };

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
        // Older entries have no book or author.
        book: typeof entry.book === "string" ? entry.book.trim().slice(0, BOOK_MAX) : "",
        author: typeof entry.author === "string" ? entry.author.trim().slice(0, AUTHOR_MAX) : "",
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

  // Tell main.js to redraw the contents table.
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

  async function uploadPage(file, { key, title, description, book, author }) {
    setStatus("正在读取文件… / Reading the file…");
    const content = await readAsBase64(file);
    setStatus(
      `正在上传 ${(file.size / MB).toFixed(1)} MB… / Uploading ${(file.size / MB).toFixed(1)} MB…`,
    );
    const blob = await api("git/blobs", "POST", { content, encoding: "base64" });
    setStatus("正在提交… / Committing…");
    return commitChange(async (before) => {
      const entry = { key, title, description, book, author, updated: nowIso() };
      const next = before.slice();
      const index = next.findIndex((page) => page.key === key);
      if (index >= 0) {
        next[index] = entry;
      } else {
        next.push(entry);
      }
      return {
        list: next,
        message: `${index >= 0 ? "Replace" : "Upload"} page ${key}`,
        files: [{ path: pagePath(key), mode: "100644", type: "blob", sha: blob.sha }],
      };
    });
  }

  async function editPage({ key, title, description, book, author }) {
    setStatus("正在提交… / Committing…");
    return commitChange(async (before) => {
      const next = before.slice();
      const index = next.findIndex((page) => page.key === key);
      if (index < 0) throw new Error("这个页面已不存在 / This page no longer exists.");
      next[index] = { ...next[index], title, description, book, author, updated: nowIso() };
      return { list: next, message: `Edit page ${key}`, files: [] };
    });
  }

  async function deletePage(key) {
    setStatus("正在删除… / Deleting…");
    return commitChange(async (before, parentSha) => {
      const names = await uploadedFileNames(parentSha);
      const files = names.has(`${key}.html`)
        ? [{ path: pagePath(key), mode: "100644", type: "blob", sha: null }]
        : [];
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
    if (fields.book.value.trim().length > BOOK_MAX) {
      return fail(fields.book, `课本最多 ${BOOK_MAX} 个字 / Book: up to ${BOOK_MAX} characters.`);
    }
    if (fields.author.value.trim().length > AUTHOR_MAX) {
      return fail(fields.author, `作者最多 ${AUTHOR_MAX} 个字 / Author: up to ${AUTHOR_MAX} characters.`);
    }
    return true;
  }

  // Title, description, book and author as typed in a form.
  function pageFields(key, fields) {
    return {
      key,
      title: fields.title.value.trim(),
      description: fields.description.value.trim(),
      book: fields.book.value.trim(),
      author: fields.author.value.trim(),
    };
  }

  // Put an entry's title, description, book and author into a form.
  function fillFields(fields, page) {
    Object.keys(fields).forEach((name) => {
      fields[name].value = page[name];
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
    return checkPageFields(uploadFields);
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
      if (page.book) {
        const book = el("span", "page-row-book", `课本：${page.book}`);
        book.lang = "zh-Hans";
        info.append(book);
      }
      if (page.author) {
        const author = el("span", "page-row-author", `作者：${page.author}`);
        author.lang = "zh-Hans";
        info.append(author);
      }
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
    editForm.hidden = false;
    editTitle.focus();
  }

  function stopEdit() {
    editingKey = null;
    editForm.hidden = true;
  }

  // ---------- events ----------

  manageBtn.addEventListener("click", () => {
    if (!listFromApi) list = siteList();
    tokenRemember.checked = Boolean(loadSavedToken());
    renderTokenState();
    renderList();
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
  });

  uploadForm.addEventListener("reset", () => {
    uploadNote.hidden = true;
  });

  uploadForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || !needToken() || !checkUploadForm()) return;
    const file = uploadFile.files[0];
    const fields = pageFields(uploadKey.value.trim(), uploadFields);
    const { key } = fields;
    if (
      list.some((page) => page.key === key) &&
      !window.confirm(`“${key}” 已存在，要替换它吗？\nA page with the key "${key}" already exists. Replace it?`)
    ) {
      return;
    }
    runTask(async () => {
      const result = await uploadPage(file, fields);
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
    if (busy || !key || !needToken() || !checkPageFields(editFields)) return;
    const fields = pageFields(key, editFields);
    runTask(async () => {
      const result = await editPage(fields);
      stopEdit();
      afterCommit(result, key, false);
      setStatus("✓ 已保存，正在发布（约 1–2 分钟）/ Saved. Publishing takes about 1–2 minutes.", "ok");
    });
  });

  editCancel.addEventListener("click", stopEdit);
})();
