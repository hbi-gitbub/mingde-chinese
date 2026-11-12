"use strict";

// Main page: shows one sub-page at a time in the iframe, driven by the URL hash.
(() => {
  const PAGES = {
    adventure: { src: "pages/adventure-world.html", title: "中文冒险世界" },
    bubbles: { src: "pages/pinyin-bubbles.html", title: "拼音泡泡大作战" },
  };
  const DEFAULT_PAGE = "adventure";
  const SITE_TITLE = "明德中文乐园";

  const navButtons = document.querySelectorAll(".nav-btn[data-page]");
  const statusEl = document.getElementById("status");
  let frame = document.getElementById("content");

  function pageFromHash() {
    const key = window.location.hash.slice(1);
    return Object.prototype.hasOwnProperty.call(PAGES, key) ? key : null;
  }

  function showPage(key) {
    const page = PAGES[key];

    // Swap in a fresh iframe instead of changing src, so sub-page loads don't add
    // their own history entries. The URL hash stays the only navigation history.
    const fresh = frame.cloneNode(false);
    fresh.src = page.src;
    fresh.title = page.title;
    frame.replaceWith(fresh);
    frame = fresh;

    navButtons.forEach((btn) => {
      if (btn.dataset.page === key) {
        btn.setAttribute("aria-current", "page");
      } else {
        btn.removeAttribute("aria-current");
      }
    });

    statusEl.textContent = "";
    document.title = `${page.title} · ${SITE_TITLE}`;
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

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = btn.dataset.page;
    });
  });

  window.addEventListener("hashchange", route);
  route();
})();
