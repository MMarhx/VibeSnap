/* =========================================================
VIBESNAP — app.js
Static, privacy-first prototype runner (single-file HTML) + lightweight validation tools
No external libs. Works on static hosting (Cloudflare Pages, etc).
========================================================= */

(() => {
  "use strict";

  // -----------------------------
  // Storage keys
  // -----------------------------
  const LS = {
    DRAFT_HTML: "vibesnap:draft_html",
    FEEDBACK: "vibesnap:feedback",
    METRICS: "vibesnap:metrics",
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const nowISO = () => new Date().toISOString();

  const safeJsonParse = (s, fallback) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // -----------------------------
  // Elements (guarded)
  // -----------------------------
  const pageApp = $("#pageApp");
  const pagePricing = $("#pagePricing");

  const codeInput = $("#codeInput");
  const btnPasteStarter = $("#btnPasteStarter");
  const btnDownloadHtml = $("#btnDownloadHtml");
  const btnClearCode = $("#btnClearCode");

  const btnLaunch = $("#btnLaunch");
  const btnReload = $("#btnReload");
  const previewFrame = $("#previewFrame");

  const saveStatus = $("#saveStatus");
  const btnClearSaved = $("#btnClearSaved");

  const shareLink = $("#shareLink");
  const btnCreateShare = $("#btnCreateShare");
  const btnCopyShareLink = $("#btnCopyShareLink");
  const btnCopyShareText = $("#btnCopyShareText");
  const btnResetLink = $("#btnResetLink");
  const btnOpenNewTab = $("#btnOpenNewTab");

  const feedbackText = $("#feedbackText");
  const btnSubmitFeedback = $("#btnSubmitFeedback");
  const btnClearFeedback = $("#btnClearFeedback");
  const btnExportFeedback = $("#btnExportFeedback");
  const recentFeedback = $("#recentFeedback");
  const feedbackSaveStatus = $("#feedbackSaveStatus");

  const statViews = $("#statViews");
  const statLaunches = $("#statLaunches");
  const statFeedback = $("#statFeedback");
  const btnResetAnalytics = $("#btnResetAnalytics");

  // Tabs / navigation hooks (optional)
  const tabButtons = $$(".tab[data-tab]");
  const navButtons = $$("[data-nav]");

  // -----------------------------
  // Defaults
  // -----------------------------
  const STARTER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Prototype Starter</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:#0f1115; color:#e6e6e6; }
    .wrap { max-width: 820px; margin: 0 auto; padding: 28px 18px; }
    .card { border:1px solid #2a2f3a; border-radius:14px; padding:18px; background:#161a22; }
    h1 { margin:0 0 6px; font-size: 22px; }
    p { margin:0 0 14px; color:#9aa0aa; }
    button { background:#ff7a18; color:#000; border:0; padding:12px 14px; border-radius:10px; font-weight:700; cursor:pointer; }
    .row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .pill { border:1px solid #2a2f3a; color:#9aa0aa; padding:8px 10px; border-radius:999px; }
    .meter { height:10px; background:#0c0f14; border:1px solid #2a2f3a; border-radius:999px; overflow:hidden; flex: 1; min-width: 220px;}
    .meter > div { height:100%; width:35%; background:rgba(255,122,24,0.55); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Interactive prototype starter</h1>
      <p>Replace this content with your own. Keep it self contained for easy sharing and testing.</p>

      <div class="row">
        <button id="btn">Click me</button>
        <span class="pill" id="state">State: idle</span>
        <div class="meter" aria-label="Progress"><div id="bar"></div></div>
      </div>
    </div>
  </div>

  <script>
    const btn = document.getElementById("btn");
    const state = document.getElementById("state");
    const bar = document.getElementById("bar");
    let on = false;

    btn.addEventListener("click", () => {
      on = !on;
      state.textContent = "State: " + (on ? "active" : "idle");
      bar.style.width = on ? "85%" : "35%";
    });
  </script>
</body>
</html>`;

  // -----------------------------
  // Metrics
  // -----------------------------
  const metricsDefault = { views: 0, launches: 0, feedback: 0 };
  const getMetrics = () => safeJsonParse(localStorage.getItem(LS.METRICS), metricsDefault) || metricsDefault;
  const setMetrics = (m) => localStorage.setItem(LS.METRICS, JSON.stringify(m));

  function renderMetrics() {
    const m = getMetrics();
    if (statViews) statViews.textContent = String(m.views ?? 0);
    if (statLaunches) statLaunches.textContent = String(m.launches ?? 0);
    if (statFeedback) statFeedback.textContent = String(m.feedback ?? 0);
  }

  function bumpMetric(key, amount = 1) {
    const m = getMetrics();
    m[key] = (m[key] ?? 0) + amount;
    setMetrics(m);
    renderMetrics();
  }

  // Count a "view" once per tab session
  const SESSION_VIEW_KEY = "vibesnap:session_viewed";
  if (!sessionStorage.getItem(SESSION_VIEW_KEY)) {
    sessionStorage.setItem(SESSION_VIEW_KEY, "1");
    bumpMetric("views", 1);
  } else {
    renderMetrics();
  }

  if (btnResetAnalytics) {
    btnResetAnalytics.addEventListener("click", () => {
      localStorage.setItem(LS.METRICS, JSON.stringify(metricsDefault));
      renderMetrics();
      toast("Analytics reset");
    });
  }

  // -----------------------------
  // Autosave draft
  // -----------------------------
  function setSaveStatus(text) {
    if (saveStatus) saveStatus.textContent = text;
  }

  function loadDraft() {
    const draft = localStorage.getItem(LS.DRAFT_HTML) || "";
    if (codeInput && draft.trim()) {
      codeInput.value = draft;
      setSaveStatus("Draft restored");
    } else {
      setSaveStatus("Nothing saved");
    }
  }

  const saveDraftDebounced = debounce(() => {
    if (!codeInput) return;
    const val = (codeInput.value || "").trim();
    if (!val) {
      localStorage.removeItem(LS.DRAFT_HTML);
      setSaveStatus("Nothing saved");
      return;
    }
    localStorage.setItem(LS.DRAFT_HTML, val);
    setSaveStatus("Saved locally");
  }, 350);

  if (codeInput) {
    codeInput.addEventListener("input", () => {
      saveDraftDebounced();
    });
  }

  if (btnClearSaved) {
    btnClearSaved.addEventListener("click", () => {
      localStorage.removeItem(LS.DRAFT_HTML);
      if (codeInput) codeInput.value = "";
      setSaveStatus("Nothing saved");
      toast("Saved draft cleared");
    });
  }

  // -----------------------------
  // Launch sandboxed preview
  // -----------------------------
  function setLoading(isLoading) {
    if (!btnLaunch) return;
    const label = btnLaunch.querySelector(".btn-label");
    if (isLoading) {
      btnLaunch.classList.add("is-loading");
      btnLaunch.disabled = true;
      if (label) label.textContent = "Thinking…";
    } else {
      btnLaunch.classList.remove("is-loading");
      btnLaunch.disabled = false;
      if (label) label.textContent = "Launch preview";
    }
  }

  function normalizeHtmlInput(raw) {
    const s = (raw || "").trim();
    if (!s) return "";
    // If user pasted fragment, wrap it into a full HTML doc
    const looksLikeFull = /<html[\s>]/i.test(s) || /<!doctype/i.test(s);
    if (looksLikeFull) return s;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Prototype</title>
  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:18px}</style>
</head>
<body>
${s}
</body>
</html>`;
  }

  function setPreview(htmlText) {
    if (!previewFrame) return;
    previewFrame.srcdoc = htmlText;
  }

  function launch() {
    if (!codeInput) return;
    const raw = codeInput.value;
    const normalized = normalizeHtmlInput(raw);
    if (!normalized) {
      toast("Paste a complete HTML file first");
      return;
    }

    setLoading(true);

    // small delay for perceived responsiveness
    const delay = 350 + Math.floor(Math.random() * 350);
    setTimeout(() => {
      setPreview(normalized);
      bumpMetric("launches", 1);
      setLoading(false);
      toast("Preview launched");
    }, delay);
  }

  if (btnLaunch) btnLaunch.addEventListener("click", launch);

  if (btnReload) {
    btnReload.addEventListener("click", () => {
      if (!codeInput) return;
      const normalized = normalizeHtmlInput(codeInput.value);
      setPreview(normalized);
      toast("Reloaded");
    });
  }

  // Cmd/Ctrl+Enter launches
  if (codeInput) {
    codeInput.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        launch();
      }
    });
  }

  // -----------------------------
  // Editor actions
  // -----------------------------
  if (btnPasteStarter) {
    btnPasteStarter.addEventListener("click", () => {
      if (!codeInput) return;
      codeInput.value = STARTER_HTML;
      localStorage.setItem(LS.DRAFT_HTML, STARTER_HTML);
      setSaveStatus("Saved locally");
      toast("Starter pasted");
      codeInput.focus();
    });
  }

  if (btnClearCode) {
    btnClearCode.addEventListener("click", () => {
      if (!codeInput) return;
      codeInput.value = "";
      toast("Cleared");
      codeInput.focus();
      saveDraftDebounced();
    });
  }

  if (btnDownloadHtml) {
    btnDownloadHtml.addEventListener("click", () => {
      const raw = codeInput ? codeInput.value : "";
      const normalized = normalizeHtmlInput(raw);
      if (!normalized) {
        toast("Nothing to download yet");
        return;
      }
      downloadText("prototype.html", normalized);
      toast("Downloaded");
    });
  }

  // -----------------------------
  // Share link (static-mode)
  // -----------------------------
  function encodeToHash(text) {
    // Base64url encode for hash
    const utf8 = new TextEncoder().encode(text);
    let bin = "";
    utf8.forEach((b) => (bin += String.fromCharCode(b)));
    const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return b64;
  }

  function decodeFromHash(b64url) {
    const b64 = (b64url || "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(b64 + pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function buildShareUrlFromCode(code) {
    const normalized = normalizeHtmlInput(code);
    const hash = encodeToHash(normalized);
    const url = new URL(window.location.href);
    url.hash = `code=${hash}`;
    // strip query noise if any
    return url.toString();
  }

  function hydrateFromHash() {
    const h = window.location.hash || "";
    const m = h.match(/code=([A-Za-z0-9\-_]+)/);
    if (!m) return;
    try {
      const decoded = decodeFromHash(m[1]);
      if (codeInput) {
        codeInput.value = decoded;
        localStorage.setItem(LS.DRAFT_HTML, decoded);
        setSaveStatus("Loaded from link");
        toast("Loaded shared prototype");
        setTimeout(() => launch(), 200);
      }
    } catch (e) {
      // ignore
    }
  }

  if (btnCreateShare && shareLink) {
    btnCreateShare.addEventListener("click", () => {
      const raw = codeInput ? codeInput.value : "";
      const normalized = normalizeHtmlInput(raw);
      if (!normalized) {
        toast("Paste HTML first");
        return;
      }

      const url = buildShareUrlFromCode(normalized);

      // Gentle warning if too large (URL limits vary)
      if (url.length > 65000) {
        toast("Prototype too large for a link. Download instead.");
      }

      shareLink.value = url;
      toast("Share link created");
    });
  }

  if (btnCopyShareLink && shareLink) {
    btnCopyShareLink.addEventListener("click", async () => {
      const val = (shareLink.value || "").trim();
      if (!val) return toast("Create a share link first");
      try {
        await navigator.clipboard.writeText(val);
        toast("Link copied");
      } catch {
        toast("Copy failed (browser blocked)");
      }
    });
  }

  if (btnCopyShareText && shareLink) {
    btnCopyShareText.addEventListener("click", async () => {
      const val = (shareLink.value || "").trim();
      if (!val) return toast("Create a share link first");
      const msg = `Quick prototype feedback?\n\nOpen this and try it:\n${val}\n\nThen reply with:\n1) useful / not useful\n2) what confused you\n3) one thing to improve`;
      try {
        await navigator.clipboard.writeText(msg);
        toast("Share text copied");
      } catch {
        toast("Copy failed (browser blocked)");
      }
    });
  }

  if (btnResetLink && shareLink) {
    btnResetLink.addEventListener("click", () => {
      shareLink.value = "";
      // leave hash as-is (user may want to keep it)
      toast("Share field cleared");
    });
  }

  if (btnOpenNewTab && shareLink) {
    btnOpenNewTab.addEventListener("click", () => {
      const val = (shareLink.value || "").trim();
      if (!val) return toast("Create a share link first");
      window.open(val, "_blank", "noopener,noreferrer");
    });
  }

  // -----------------------------
  // Feedback (local-first)
  // -----------------------------
  const feedbackDefault = [];
  const getFeedback = () => safeJsonParse(localStorage.getItem(LS.FEEDBACK), feedbackDefault) || feedbackDefault;
  const setFeedback = (arr) => localStorage.setItem(LS.FEEDBACK, JSON.stringify(arr));

  function renderFeedback() {
    if (!recentFeedback) return;
    const arr = getFeedback();
    recentFeedback.innerHTML = "";

    if (!arr.length) {
      recentFeedback.innerHTML = `<div class="muted tiny">No feedback yet.</div>`;
      return;
    }

    const recent = arr.slice(-6).reverse();
    for (const item of recent) {
      const div = document.createElement("div");
      div.className = "fb-item";
      div.innerHTML = `
        <div class="fb-meta">
          <span class="mini-pill">${item.sentiment}</span>
          <span class="muted tiny">${new Date(item.ts).toLocaleString()}</span>
        </div>
        <div class="fb-text">${escapeHtml(item.text || "")}</div>
      `;
      recentFeedback.appendChild(div);
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setFeedbackStatus(msg) {
    if (!feedbackSaveStatus) return;
    feedbackSaveStatus.textContent = msg;
    feedbackSaveStatus.classList.add("show");
    clearTimeout(setFeedbackStatus._t);
    setFeedbackStatus._t = setTimeout(() => feedbackSaveStatus.classList.remove("show"), 1800);
  }

  const sentimentButtons = $$("[data-sentiment]");
  let currentSentiment = "useful";

  function setSentiment(val) {
    currentSentiment = val;
    sentimentButtons.forEach((b) => {
      const on = b.getAttribute("data-sentiment") === val;
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  if (sentimentButtons.length) {
    sentimentButtons.forEach((b) => {
      b.addEventListener("click", () => setSentiment(b.getAttribute("data-sentiment")));
    });
    // default
    setSentiment(sentimentButtons[0].getAttribute("data-sentiment"));
  }

  if (btnSubmitFeedback) {
    btnSubmitFeedback.addEventListener("click", () => {
      const text = (feedbackText ? feedbackText.value : "").trim();
      if (!text) {
        toast("Write feedback first");
        return;
      }

      const arr = getFeedback();
      arr.push({
        ts: nowISO(),
        sentiment: currentSentiment || "useful",
        text,
      });
      setFeedback(arr);

      if (feedbackText) feedbackText.value = "";
      bumpMetric("feedback", 1);
      renderFeedback();
      setFeedbackStatus("Saved locally");
      toast("Feedback saved");
    });
  }

  if (btnClearFeedback) {
    btnClearFeedback.addEventListener("click", () => {
      localStorage.removeItem(LS.FEEDBACK);
      renderFeedback();
      setFeedbackStatus("Cleared");
      toast("Feedback cleared");
    });
  }

  if (btnExportFeedback) {
    btnExportFeedback.addEventListener("click", () => {
      const arr = getFeedback();
      const payload = JSON.stringify(arr, null, 2);
      downloadText("vibesnap_feedback.json", payload);
      toast("Exported feedback");
    });
  }

  // -----------------------------
  // Tabs + pages
  // -----------------------------
  function showPage(which) {
    if (!pageApp || !pagePricing) return;

    if (which === "pricing") {
      pageApp.classList.remove("page-active");
      pagePricing.classList.add("page-active");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    pagePricing.classList.remove("page-active");
    pageApp.classList.add("page-active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-nav");
      if (!target) return;
      showPage(target);
    });
  });

  function setActiveTab(tabKey) {
    if (!tabButtons.length) return;
    tabButtons.forEach((b) => b.classList.toggle("is-active", b.getAttribute("data-tab") === tabKey));

    // In this build, preview is the main workspace.
    // Prompt builder / import helper UI are staged; for now we keep it honest.
    if (tabKey === "prompt") toast("Prompt builder UI is next. For now: paste your AI output into Prototype HTML.");
    if (tabKey === "import") toast("Import helper UI is next. For now: paste a single-file HTML prototype.");
  }

  tabButtons.forEach((b) => {
    b.addEventListener("click", () => setActiveTab(b.getAttribute("data-tab")));
  });

  // -----------------------------
  // Init
  // -----------------------------
  loadDraft();
  renderFeedback();
  hydrateFromHash();

})();
