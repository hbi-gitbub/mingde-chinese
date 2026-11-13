"use strict";

// Main page: shows one game at a time in the iframe, driven by the URL hash.
// Built-in games are listed below. Uploaded games come from js/uploaded-pages.js
// (window.MINGDE_UPLOADED_PAGES) and from "pages-changed" events sent by js/manage.js.
(() => {
  const BUILTIN_PAGES = {
    adventure: {
      src: "pages/adventure-world.html",
      title: "中文冒险世界",
      description: "六大魔法关卡，闯关学中文",
    },
    bubbles: {
      src: "pages/pinyin-bubbles.html",
      title: "拼音泡泡大作战",
      description: "打泡泡，练拼音；老师可管理词表",
    },
  };
  const DEFAULT_PAGE = "adventure";
  const SITE_TITLE = "明德中文乐园";
  const UPLOAD_DIR = "pages/uploads/";
  const LIST_SCRIPT = "js/uploaded-pages.js";
  const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const TITLE_MAX = 40;
  const DESC_MAX = 200;
  const PUBLISHING_LABEL = "（发布中…）";
  const PUBLISHING_STATUS = "发布中… / Publishing…";

  const nav = document.querySelector(".shell-nav");
  const uploadedNav = document.getElementById("nav-uploaded");
  const statusEl = document.getElementById("status");
  const descEl = document.getElementById("page-desc");
  let frame = document.getElementById("content");

  let pages = { ...BUILTIN_PAGES };
  let publishing = new Set();
  let currentKey = null;
  let gotManagerList = false;
  // A hash asked for at start-up that the (possibly cached) list didn't know yet.
  let pendingKey = null;

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  // Keep only well-formed entries; the list is written by the site but is still input.
  function cleanList(raw) {
    const result = [];
    if (!Array.isArray(raw)) return result;
    const seen = new Set();
    raw.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const { key, title } = entry;
      if (typeof key !== "string" || !KEY_PATTERN.test(key)) return;
      if (hasOwn(BUILTIN_PAGES, key) || seen.has(key)) return;
      if (typeof title !== "string" || !title.trim() || title.length > TITLE_MAX) return;
      const description =
        typeof entry.description === "string" ? entry.description.slice(0, DESC_MAX) : "";
      seen.add(key);
      result.push({ key, title: title.trim(), description });
    });
    return result;
  }

  function pageFromHash() {
    const key = window.location.hash.slice(1);
    return hasOwn(pages, key) ? key : null;
  }

  function markActive() {
    nav.querySelectorAll(".nav-btn[data-page]").forEach((btn) => {
      if (btn.dataset.page === currentKey) {
        btn.setAttribute("aria-current", "page");
      } else {
        btn.removeAttribute("aria-current");
      }
    });
  }

  // Title, description line and tab title for the open page (no iframe reload).
  function showMeta(key) {
    const page = pages[key];
    descEl.textContent = page.description || "";
    descEl.hidden = !page.description;
    frame.title = page.title;
    document.title = `${page.title} · ${SITE_TITLE}`;
  }

  function showPage(key) {
    const page = pages[key];

    // Swap in a fresh iframe instead of changing src, so sub-page loads don't add
    // their own history entries. The URL hash stays the only navigation history.
    const fresh = frame.cloneNode(false);
    fresh.src = page.src;
    frame.replaceWith(fresh);
    frame = fresh;

    currentKey = key;
    markActive();
    showMeta(key);
    if (publishing.size === 0) statusEl.textContent = "";
  }

  function route() {
    const key = pageFromHash();
    if (key) {
      showPage(key);
      return;
    }
    // Missing or unknown hash: fall back to the default without adding history.
    window.history.replaceState(null, "", `#${DEFAULT_PAGE}`);
    showPage(DEFAULT_PAGE);
  }

  function renderUploaded(list) {
    pages = { ...BUILTIN_PAGES };
    const buttons = list.map((entry) => {
      pages[entry.key] = {
        src: `${UPLOAD_DIR}${entry.key}.html`,
        title: entry.title,
        description: entry.description,
      };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-btn";
      btn.lang = "zh-Hans";
      btn.dataset.page = entry.key;
      btn.textContent = entry.title;
      if (publishing.has(entry.key)) {
        // Not on the site yet: opening it now would show GitHub's 404 page.
        btn.disabled = true;
        const note = document.createElement("span");
        note.className = "nav-pending";
        note.textContent = PUBLISHING_LABEL;
        btn.append(note);
      }
      return btn;
    });
    uploadedNav.replaceChildren(...buttons);
    uploadedNav.hidden = buttons.length === 0;
  }

  function applyList(list) {
    renderUploaded(list);

    if (pendingKey && hasOwn(pages, pendingKey)) {
      const key = pendingKey;
      pendingKey = null;
      window.history.replaceState(null, "", `#${key}`);
      showPage(key);
      return;
    }
    if (currentKey && !hasOwn(pages, currentKey)) {
      // The open page was deleted.
      route();
      return;
    }
    if (currentKey) {
      markActive();
      showMeta(currentKey);
    }
  }

  // GitHub Pages caches js/uploaded-pages.js for up to ~10 min. Over http(s), load it once
  // more with a unique query so newly published pages show up straight away.
  function reloadListFresh() {
    if (window.location.protocol === "file:") return;
    const script = document.createElement("script");
    script.src = `${LIST_SCRIPT}?t=${Date.now()}`;
    script.addEventListener("load", () => {
      script.remove();
      // The manager's list (read from the GitHub API) is newer than anything on the site.
      if (!gotManagerList) applyList(cleanList(window.MINGDE_UPLOADED_PAGES));
      pendingKey = null;
    });
    script.addEventListener("error", () => {
      script.remove();
      pendingKey = null;
    });
    document.head.append(script);
  }

  // Under file:// the sender's origin is opaque ("null"; some browsers report "file://").
  function isTrustedOrigin(origin) {
    if (window.location.protocol === "file:") {
      return origin === "null" || origin === "file://";
    }
    return origin === window.location.origin;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;
    if (!isTrustedOrigin(event.origin)) return;

    const data = event.data;
    if (!data || data.type !== "status" || typeof data.text !== "string") return;
    statusEl.textContent = data.text;
  });

  // Sent by js/manage.js after it changes the list:
  // detail = { pages: [...], publishing: ["key", ...], status: "text" }
  document.addEventListener("pages-changed", (event) => {
    const detail = event.detail || {};
    gotManagerList = true;
    publishing = new Set(Array.isArray(detail.publishing) ? detail.publishing : []);
    applyList(cleanList(detail.pages));
    if (typeof detail.status === "string") {
      statusEl.textContent = detail.status;
    } else if (publishing.size > 0) {
      statusEl.textContent = PUBLISHING_STATUS;
    }
  });

  nav.addEventListener("click", (event) => {
    const btn = event.target.closest(".nav-btn[data-page]");
    if (!btn || btn.disabled) return;
    window.location.hash = btn.dataset.page;
  });

  window.addEventListener("hashchange", route);

  renderUploaded(cleanList(window.MINGDE_UPLOADED_PAGES));
  const startKey = window.location.hash.slice(1);
  if (startKey && !hasOwn(pages, startKey) && KEY_PATTERN.test(startKey)) {
    pendingKey = startKey;
  }
  route();
  reloadListFresh();
})();
