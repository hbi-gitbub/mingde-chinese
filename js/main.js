"use strict";

// Main page: shows one game at a time in the iframe, driven by the URL hash.
// The nav holds the built-in games and a "…" button that opens #contents: a grid of thumbnail
// cards for the uploaded games, under a bar with a filter drop-down and a text filter per field.
// Uploaded games come from
// js/uploaded-pages.js (window.MINGDE_UPLOADED_PAGES) and from "pages-changed" events sent
// by js/manage.js.
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
  const CONTENTS_KEY = "contents";
  const CONTENTS_META = { title: "目录", description: "" };
  const SITE_TITLE = "明德中文乐园";
  const UPLOAD_DIR = "pages/uploads/";
  const LIST_SCRIPT = "js/uploaded-pages.js";
  const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const TITLE_MAX = 40;
  const DESC_MAX = 200;
  const AUTHOR_MAX = 40;
  const TEXTBOOK_MAX = 40;
  const VOLUME_MAX = 20;
  const LESSON_MAX = 999;
  const CN_DIGITS = "零一二三四五六七八九";
  // Thumbnail pictures are pages/uploads/<key>.<thumb>. Without one, a card shows a colored
  // tile (one of TILE_COUNT colors in css/style.css, picked from the key).
  const THUMB_EXTS = ["png", "jpg", "webp"];
  const TILE_COUNT = 6;
  const PUBLISHING_LABEL = "（发布中…）";
  const PUBLISHING_STATUS = "发布中… / Publishing…";
  // Columns with a filter drop-down and a text box. Drop-down: "all" shows every row,
  // "=<value>" only matching rows. Text box: rows whose value contains the typed text
  // (case-insensitive). A row must pass both, in every column.
  const FILTER_COLUMNS = ["title", "textbook", "volume", "lesson", "author"];
  const FILTER_ALL = "all";
  const OPTION_TEXT_MAX = 30;

  const nav = document.querySelector(".shell-nav");
  const statusEl = document.getElementById("status");
  const descEl = document.getElementById("page-desc");
  const navCurrent = document.getElementById("nav-current");
  const contentsView = document.getElementById("contents-view");
  const contentsGrid = document.getElementById("contents-grid");
  const contentsCount = document.getElementById("contents-count");
  const contentsEmpty = document.getElementById("contents-empty");
  const filtersClear = document.getElementById("filters-clear");
  const filterSelects = {};
  const filterInputs = {};
  FILTER_COLUMNS.forEach((column) => {
    filterSelects[column] = contentsView.querySelector(`select[data-filter="${column}"]`);
    filterInputs[column] = contentsView.querySelector(`input[data-filter-text="${column}"]`);
  });
  let frame = document.getElementById("content");

  let pages = { ...BUILTIN_PAGES };
  let uploaded = [];
  let publishing = new Set();
  let currentKey = null;
  let gotManagerList = false;
  // A hash asked for at start-up that the (possibly cached) list didn't know yet.
  let pendingKey = null;

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
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

  // Keep only well-formed entries; the list is written by the site but is still input.
  function cleanList(raw) {
    const result = [];
    if (!Array.isArray(raw)) return result;
    const seen = new Set();
    raw.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const { key, title } = entry;
      if (typeof key !== "string" || !KEY_PATTERN.test(key)) return;
      if (hasOwn(BUILTIN_PAGES, key) || key === CONTENTS_KEY || seen.has(key)) return;
      if (typeof title !== "string" || !title.trim() || title.length > TITLE_MAX) return;
      seen.add(key);
      result.push({
        key,
        title: title.trim(),
        description: cleanText(entry.description, DESC_MAX),
        // Older entries have a single "book" text instead; show it as the textbook.
        textbook: cleanText(hasOwn(entry, "textbook") ? entry.textbook : entry.book, TEXTBOOK_MAX),
        volume: cleanText(entry.volume, VOLUME_MAX),
        lesson: cleanLesson(entry.lesson),
        author: cleanText(entry.author, AUTHOR_MAX),
        thumb: THUMB_EXTS.includes(entry.thumb) ? entry.thumb : "",
        updated: typeof entry.updated === "string" ? entry.updated : "",
      });
    });
    return result;
  }

  function pageFromHash() {
    const key = window.location.hash.slice(1);
    return key === CONTENTS_KEY || hasOwn(pages, key) ? key : null;
  }

  // Built-in games light up their own button; the contents page and uploaded games light up "…".
  // An uploaded game also shows its title right after "…".
  function markActive() {
    const active = hasOwn(BUILTIN_PAGES, currentKey) ? currentKey : CONTENTS_KEY;
    nav.querySelectorAll(".nav-btn[data-page]").forEach((btn) => {
      if (btn.dataset.page === active) {
        btn.setAttribute("aria-current", "page");
      } else {
        btn.removeAttribute("aria-current");
      }
    });
    const isUploaded =
      currentKey !== CONTENTS_KEY && !hasOwn(BUILTIN_PAGES, currentKey) && hasOwn(pages, currentKey);
    navCurrent.textContent = isUploaded ? pages[currentKey].title : "";
    navCurrent.title = navCurrent.textContent;
    navCurrent.hidden = !isUploaded;
  }

  // Description line ("description · 作者：author") and tab title for the open page.
  function showMeta(key) {
    const page = key === CONTENTS_KEY ? CONTENTS_META : pages[key];
    const parts = [page.description, page.author ? `作者：${page.author}` : ""].filter(Boolean);
    descEl.textContent = parts.join(" · ");
    descEl.hidden = parts.length === 0;
    frame.title = page.title;
    document.title = `${page.title} · ${SITE_TITLE}`;
  }

  function showPage(key) {
    const isContents = key === CONTENTS_KEY;

    // Swap in a fresh iframe instead of changing src, so sub-page loads don't add
    // their own history entries. The URL hash stays the only navigation history.
    // On the contents page the iframe is emptied, so a game's sound stops.
    const fresh = frame.cloneNode(false);
    if (isContents) {
      fresh.removeAttribute("src");
    } else {
      fresh.src = pages[key].src;
    }
    fresh.hidden = isContents;
    frame.replaceWith(fresh);
    frame = fresh;
    contentsView.hidden = !isContents;

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

  // ---------- contents page (filters + cards) ----------

  function normalize(text) {
    return text.trim().toLocaleLowerCase();
  }

  function shorten(text) {
    return text.length > OPTION_TEXT_MAX ? `${text.slice(0, OPTION_TEXT_MAX)}…` : text;
  }

  // The value a drop-down matches on: the text, or the lesson number as text ("" when empty).
  function columnValue(row, column) {
    if (column === "lesson") return row.lesson === null ? "" : String(row.lesson);
    return row[column];
  }

  // What the drop-down shows.
  function columnLabel(value, column) {
    return column === "lesson" && value ? lessonLabel(Number(value)) : value;
  }

  // What the text box searches: the lesson matches both "3" and "第三课".
  function columnSearchText(row, column) {
    if (column === "lesson") return row.lesson === null ? "" : `${row.lesson} ${lessonLabel(row.lesson)}`;
    return row[column];
  }

  // Empty first, then lessons by number and text in Chinese order.
  function compareValues(a, b, column) {
    if (column === "lesson") return (a ? Number(a) : 0) - (b ? Number(b) : 0);
    return a.localeCompare(b, "zh-Hans");
  }

  // Refill each drop-down with the values in its column; keep the choice if it still exists.
  // The typed text is left as it is.
  function renderFilterOptions(rows) {
    FILTER_COLUMNS.forEach((column) => {
      const select = filterSelects[column];
      const previous = select.value || FILTER_ALL;
      const values = [...new Set(rows.map((row) => columnValue(row, column)))].sort((a, b) =>
        compareValues(a, b, column),
      );
      const options = [new Option("全部 / All", FILTER_ALL)];
      values.forEach((value) => {
        const label = columnLabel(value, column);
        const option = new Option(label ? shorten(label) : "（空）/ (empty)", `=${value}`);
        if (label) option.title = label;
        options.push(option);
      });
      select.replaceChildren(...options);
      select.value = options.some((option) => option.value === previous) ? previous : FILTER_ALL;
    });
  }

  // The same key always gets the same tile color.
  function tileIndex(key) {
    let hash = 0;
    for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 9973;
    return hash % TILE_COUNT;
  }

  // Turn the thumbnail box into a colored tile with the title's first character.
  function showTile(box, row) {
    box.replaceChildren();
    box.classList.add("card-tile");
    box.dataset.tile = String(tileIndex(row.key));
    box.textContent = [...row.title][0] || "";
  }

  // The picture, or the tile when there is none (or it can't be loaded yet, e.g. while publishing).
  function thumbBox(row) {
    const box = document.createElement("span");
    box.className = "card-thumb";
    box.setAttribute("aria-hidden", "true");
    if (!row.thumb) {
      showTile(box, row);
      return box;
    }
    const img = document.createElement("img");
    // `updated` changes with every commit, so a replaced picture isn't served from the cache.
    const version = window.location.protocol === "file:" ? "" : `?v=${encodeURIComponent(row.updated)}`;
    img.src = `${UPLOAD_DIR}${row.key}.${row.thumb}${version}`;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => showTile(box, row), { once: true });
    box.append(img);
    return box;
  }

  // Hovering a card shows the description, textbook · volume · lesson, author and file name.
  function cardTooltip(row) {
    const fileName = (pages[row.key] ? pages[row.key].src : "").split("/").pop();
    const book = [row.textbook, row.volume, lessonLabel(row.lesson)].filter(Boolean).join(" · ");
    return [
      row.description,
      book,
      row.author ? `作者：${row.author}` : "",
      `打开 / Open: ${fileName}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  // A card: thumbnail + title, linking to its game. While publishing it isn't a link yet,
  // because opening it now would show GitHub's 404 page.
  function card(row) {
    const li = document.createElement("li");
    const pending = publishing.has(row.key);
    const box = document.createElement(pending ? "div" : "a");
    box.className = pending ? "card card-pending" : "card";
    if (!pending) box.href = `#${row.key}`;
    box.title = cardTooltip(row);
    const title = document.createElement("span");
    title.className = "card-title";
    title.lang = "zh-Hans";
    title.textContent = pending ? `${row.title}${PUBLISHING_LABEL}` : row.title;
    box.append(thumbBox(row), title);
    li.append(box);
    return li;
  }

  // Only uploaded games; the built-in ones have their own nav buttons.
  function renderRows() {
    const rows = uploaded;
    const chosen = {};
    const typed = {};
    FILTER_COLUMNS.forEach((column) => {
      chosen[column] = filterSelects[column].value || FILTER_ALL;
      typed[column] = normalize(filterInputs[column].value);
    });
    const shown = rows.filter((row) =>
      FILTER_COLUMNS.every(
        (column) =>
          (chosen[column] === FILTER_ALL || chosen[column] === `=${columnValue(row, column)}`) &&
          (!typed[column] || normalize(columnSearchText(row, column)).includes(typed[column])),
      ),
    );
    contentsGrid.replaceChildren(...shown.map(card));
    contentsCount.textContent = `显示 ${shown.length} / ${rows.length} 个 · Showing ${shown.length} of ${rows.length}`;
    contentsEmpty.textContent =
      rows.length === 0
        ? "还没有上传的游戏 / No uploaded games yet."
        : "没有符合筛选条件的游戏 / No games match the filters.";
    contentsEmpty.hidden = shown.length > 0;
    filtersClear.disabled = FILTER_COLUMNS.every(
      (column) => chosen[column] === FILTER_ALL && !typed[column],
    );
  }

  function renderContents() {
    renderFilterOptions(uploaded);
    renderRows();
  }

  // ---------- uploaded list ----------

  function setUploaded(list) {
    uploaded = list;
    pages = { ...BUILTIN_PAGES };
    list.forEach((entry) => {
      pages[entry.key] = {
        src: `${UPLOAD_DIR}${entry.key}.html`,
        title: entry.title,
        description: entry.description,
        author: entry.author,
      };
    });
    renderContents();
  }

  function applyList(list) {
    setUploaded(list);

    if (pendingKey && hasOwn(pages, pendingKey)) {
      const key = pendingKey;
      pendingKey = null;
      window.history.replaceState(null, "", `#${key}`);
      showPage(key);
      return;
    }
    if (currentKey && currentKey !== CONTENTS_KEY && !hasOwn(pages, currentKey)) {
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
    if (!btn) return;
    window.location.hash = btn.dataset.page;
  });

  contentsView.addEventListener("change", (event) => {
    if (event.target.matches("select[data-filter]")) renderRows();
  });

  // "input" fires on each keystroke and on the search box's ✕.
  contentsView.addEventListener("input", (event) => {
    if (event.target.matches("input[data-filter-text]")) renderRows();
  });

  filtersClear.addEventListener("click", () => {
    FILTER_COLUMNS.forEach((column) => {
      filterSelects[column].value = FILTER_ALL;
      filterInputs[column].value = "";
    });
    renderRows();
  });

  window.addEventListener("hashchange", route);

  setUploaded(cleanList(window.MINGDE_UPLOADED_PAGES));
  const startKey = window.location.hash.slice(1);
  if (startKey && !pageFromHash() && KEY_PATTERN.test(startKey)) {
    pendingKey = startKey;
  }
  route();
  reloadListFresh();
})();
