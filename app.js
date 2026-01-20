/* =========================================================
   VibeSnap — app.js
   Static, privacy-first prototype runner + sharing + feedback + local analytics
   Works on a single static HTML file. No external libs.
   ========================================================= */

(() => {
  "use strict";

  // -----------------------------
  // LocalStorage keys
  // -----------------------------
  const LS = {
    DRAFT_HTML: "vibesnap:draft_html",
    METRICS: "vibesnap:metrics",
    FEEDBACK: "vibesnap:feedback",
    SHARE_TOKEN: "vibesnap:share_token",
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function safeJsonParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function downloadText(filename, text, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function randomDelay() {
    return 520 + Math.floor(Math.random() * 520); // ~0.5–1.0s
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Base64 UTF-8
  function b64EncodeUtf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }

  function b64DecodeUtf8(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        ta.remove();
        return true;
      } catch {
        ta.remove();
        return false;
      }
    }
  }

  // -----------------------------
  // Toast
  // -----------------------------
  const toastEl = $("#toast");
  let toastT = null;

  function toast(msg, ms = 2200) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("show"), ms);
  }

  // -----------------------------
  // Metrics (local-only)
  // -----------------------------
  function getMetrics() {
    return safeJsonParse(localStorage.getItem(LS.METRICS), {
      views: 0,
      launches: 0,
      feedback: 0,
      firstSeenAt: nowISO(),
      lastSeenAt: nowISO(),
    });
  }

  function setMetrics(m) {
    localStorage.setItem(LS.METRICS, JSON.stringify(m));
  }

  function bumpMetric(key) {
    const m = getMetrics();
    m[key] = (m[key] || 0) + 1;
    m.lastSeenAt = nowISO();
    setMetrics(m);
    renderMetrics();
    return m;
  }

  // -----------------------------
  // Feedback (local-only)
  // -----------------------------
  function getFeedback() {
    return safeJsonParse(localStorage.getItem(LS.FEEDBACK), []);
  }

  function setFeedback(list) {
    localStorage.setItem(LS.FEEDBACK, JSON.stringify(list));
  }

  // -----------------------------
  // DOM refs (APP)
  // -----------------------------
  const pageApp = $("#pageApp");
  const pagePricing = $("#pagePricing");

  const navTabs = $$(".tab");
  const navBtns = $$("[data-nav]");
  const brand = $(".brand");

  const codeInput = $("#codeInput");
  const previewFrame = $("#previewFrame");

  const btnPasteStarter = $("#btnPasteStarter");
  const btnDownloadHtml = $("#btnDownloadHtml");
  const btnClearCode = $("#btnClearCode");
  const btnLaunch = $("#btnLaunch");
  const btnReload = $("#btnReload");

  const saveStatus = $("#saveStatus");
  const btnClearSaved = $("#btnClearSaved");

  const btnCreateShare = $("#btnCreateShare");
  const btnOpenNewTab = $("#btnOpenNewTab");
  const shareLink = $("#shareLink");
  const btnCopyShareLink = $("#btnCopyShareLink");
  const btnCopyShareText = $("#btnCopyShareText");
  const btnResetLink = $("#btnResetLink");

  const chips = $$(".chip");
  const feedbackText = $("#feedbackText");
  const btnSubmitFeedback = $("#btnSubmitFeedback");
  const btnExportFeedback = $("#btnExportFeedback");
  const btnClearFeedback = $("#btnClearFeedback");
  const recentFeedback = $("#recentFeedback");
  const feedbackSaveStatus = $("#feedbackSaveStatus");

  const statViews = $("#statViews");
  const statLaunches = $("#statLaunches");
  const statFeedback = $("#statFeedback");
  const btnResetAnalytics = $("#btnResetAnalytics");

  // -----------------------------
  // Navigation (App <-> Pricing)
  // -----------------------------
  function setActivePage(which) {
    const onApp = which === "app";
    if (pageApp) pageApp.classList.toggle("page-active", onApp);
    if (pagePricing) pagePricing.classList.toggle("page-active", !onApp);

    // Highlight "Pricing" tab if on pricing
    navTabs.forEach((t) => {
      const isPricingBtn = t.matches('[data-nav="pricing"]');
      if (isPricingBtn) t.classList.toggle("is-active", !onApp);
    });

    // If switching to app, make preview tab active by default
    if (onApp) setActiveTab("preview");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setActiveTab(tabKey) {
    // Only preview exists as a real tab right now.
    // Prompt/import tabs are "Coming soon" placeholders to avoid broken UX.
    navTabs.forEach((t) => {
      const key = t.getAttribute("data-tab");
      const is = key === tabKey;
      if (key) t.classList.toggle("is-active", is);
    });
  }

  function bindNav() {
    // Brand click → app
    if (brand) {
      brand.addEventListener("click", () => setActivePage("app"));
      brand.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setActivePage("app");
        }
      });
    }

    // data-nav buttons
    navBtns.forEach((b) => {
      b.addEventListener("click", () => {
        const dest = b.getAttribute("data-nav");
        if (dest === "pricing") setActivePage("pricing");
        else setActivePage("app");
      });
    });

    // tab buttons
    navTabs.forEach((t) => {
      t.addEventListener("click", () => {
        const key = t.getAttribute("data-tab");
        const nav = t.getAttribute("data-nav");

        if (nav === "pricing") {
          setActivePage("pricing");
          return;
        }

        if (key === "preview") {
          setActivePage("app");
          setActiveTab("preview");
          return;
        }

        if (key === "prompt" || key === "import") {
          setActivePage("app");
          setActiveTab("preview");
          toast("Prompt builder + import helper are next. Preview works now.");
          return;
        }
      });
    });

    // CTA buttons
    $$("[data-scrolltop]").forEach((b) => {
      b.addEventListener("click", () => {
        setActivePage("app");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    // Pricing CTAs (not wired yet)
    $$("[data-cta]").forEach((b) => {
      b.addEventListener("click", () => {
        toast("Checkout isn’t wired yet. This is a prototype.");
      });
    });
  }

  // -----------------------------
  // Autosave (local)
  // -----------------------------
  function setSaveStatus(text) {
    if (saveStatus) saveStatus.textContent = text || "";
  }

  function saveDraft(html) {
    localStorage.setItem(LS.DRAFT_HTML, html);
    setSaveStatus("Saved locally");
  }

  function loadDraft() {
    return localStorage.getItem(LS.DRAFT_HTML) || "";
  }

  function clearDraft() {
    localStorage.removeItem(LS.DRAFT_HTML);
    setSaveStatus("Nothing saved");
  }

  function bindAutosave() {
    if (!codeInput) return;

    // Load draft unless share hash provides content
    const shared = readShareHash();
    if (shared && typeof shared.html === "string") {
      codeInput.value = shared.html;
      saveDraft(shared.html);
      setSaveStatus("Loaded from share link");
    } else {
      const draft = loadDraft();
      if (draft) {
        codeInput.value = draft;
        setSaveStatus("Saved locally");
      } else {
        setSaveStatus("Nothing saved");
      }
    }

    let t = null;
    codeInput.addEventListener("input", () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => saveDraft(codeInput.value), 220);
    });

    if (btnClearSaved) {
      btnClearSaved.addEventListener("click", () => {
        clearDraft();
        toast("Local save cleared.");
      });
    }
  }

  // -----------------------------
  // Sanitization (best-effort)
  // -----------------------------
  function sanitizePrototypeHtml(inputHtml) {
    let html = String(inputHtml || "").trim();
    if (!html) return "";

    // If user pasted partial HTML, wrap it
    if (!/<html[\s>]/i.test(html)) {
      html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
    }

    // Remove external script src for safety
    html = html.replace(
      /<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\/[^"']+["'][^>]*>\s*<\/script>/gi,
      ""
    );

    // Remove meta refresh
    html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']refresh["'][^>]*>/gi, "");

    return html;
  }

  // -----------------------------
  // Preview / Launch
  // -----------------------------
  function setButtonLoading(isLoading) {
    if (!btnLaunch) return;
    const label = btnLaunch.querySelector(".btn-label");
    if (isLoading) {
      btnLaunch.classList.add("is-loading");
      btnLaunch.disabled = true;
      if (label) label.textContent = "Launching…";
    } else {
      btnLaunch.classList.remove("is-loading");
      btnLaunch.disabled = false;
      if (label) label.textContent = "Launch preview";
    }
  }

  async function launchPreview() {
    if (!codeInput || !previewFrame) return;

    const raw = codeInput.value.trim();
    if (!raw) {
      toast("Paste HTML first.");
      return;
    }

    setButtonLoading(true);
    await sleep(randomDelay());

    const html = sanitizePrototypeHtml(raw);
    previewFrame.srcdoc = html;

    bumpMetric("launches");

    // Clear share input because content changed
    if (shareLink) shareLink.value = "";

    setButtonLoading(false);
    toast("Preview launched.");
  }

  function reloadPreview() {
    if (!previewFrame) return;
    const current = previewFrame.srcdoc;
    previewFrame.srcdoc = current;
    bumpMetric("launches");
    toast("Reloaded.");
  }

  function openPreviewInNewTab() {
    if (!codeInput) return;
    const html = sanitizePrototypeHtml(codeInput.value || "");
    if (!html.trim()) {
      toast("Paste HTML first.");
      return;
    }
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function bindPreview() {
    if (btnLaunch) btnLaunch.addEventListener("click", launchPreview);
    if (btnReload) btnReload.addEventListener("click", reloadPreview);

    if (btnOpenNewTab) btnOpenNewTab.addEventListener("click", openPreviewInNewTab);

    if (btnClearCode && codeInput) {
      btnClearCode.addEventListener("click", () => {
        codeInput.value = "";
        saveDraft("");
        if (previewFrame) previewFrame.srcdoc = "";
        if (shareLink) shareLink.value = "";
        toast("Cleared.");
      });
    }

    if (btnDownloadHtml && codeInput) {
      btnDownloadHtml.addEventListener("click", () => {
        const html = sanitizePrototypeHtml(codeInput.value || "");
        if (!html.trim()) {
          toast("Paste HTML first.");
          return;
        }
        downloadText("prototype.html", html, "text/html");
        toast("Downloaded prototype.html");
      });
    }

    if (btnPasteStarter && codeInput) {
      btnPasteStarter.addEventListener("click", () => {
        const starter = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Prototype</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#0b0c10; color:#f5f6fa; padding:24px; }
  .card { max-width:760px; margin:0 auto; background:#111217; border:1px solid #1f2230; border-radius:14px; padding:18px; }
  .muted { color:#a4a7b3; }
  input, button { font: inherit; }
  button { background:#ff7a45; border:none; color:#160a05; padding:10px 14px; border-radius:10px; font-weight:800; cursor:pointer; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .pill { padding:6px 10px; border-radius:999px; border:1px solid #1f2230; color:#a4a7b3; font-size:12px; }
</style>
</head>
<body>
  <div class="card">
    <div class="row" style="justify-content:space-between;">
      <div>
        <h1 style="margin:0 0 6px;">Quick prototype</h1>
        <div class="muted">One interaction. One flow. Test it.</div>
      </div>
      <div class="pill">prototype</div>
    </div>

    <div style="margin-top:16px;" class="row">
      <input id="name" placeholder="Type a name…" style="padding:10px 12px;border-radius:10px;border:1px solid #1f2230;background:#0b0c10;color:#f5f6fa;" />
      <button id="go">Generate</button>
    </div>

    <div id="out" class="muted" style="margin-top:14px;"></div>
  </div>

<script>
  const name = document.getElementById('name');
  const out = document.getElementById('out');
  document.getElementById('go').addEventListener('click', () => {
    const v = (name.value || '').trim() || 'friend';
    out.textContent = 'Hello ' + v + '. Now add one real feature.';
  });
</script>
</body>
</html>`;
        codeInput.value = starter;
        saveDraft(starter);
        toast("Starter inserted.");
      });
    }

    // Cmd/Ctrl + Enter to launch
    if (codeInput && btnLaunch) {
      codeInput.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !btnLaunch.disabled) {
          btnLaunch.click();
        }
      });
    }
  }

  // -----------------------------
  // Share Links (hash-based)
  // NOTE: This is limited by URL length.
  // -----------------------------
  function setShareHash(payload) {
    const json = JSON.stringify(payload);
    const b64 = encodeURIComponent(b64EncodeUtf8(json));

    // Conservative URL size limit
    if (b64.length > 1800) {
      return { ok: false, reason: "too_long", size: b64.length };
    }

    location.hash = `#share=${b64}`;
    localStorage.setItem(LS.SHARE_TOKEN, b64);
    return { ok: true, token: b64 };
  }

  function readShareHash() {
    const m = location.hash.match(/#share=([^&]+)/);
    if (!m) return null;
    try {
      const json = b64DecodeUtf8(decodeURIComponent(m[1]));
      const obj = safeJsonParse(json, null);
      return obj && typeof obj === "object" ? obj : null;
    } catch {
      return null;
    }
  }

  function buildShareText(url) {
    const link = url || location.href;
    return `VibeSnap prototype:\n${link}\n\nOne question:\nWould you use this? If not, what’s missing?`;
  }

  function createShareLink() {
    if (!codeInput || !shareLink) return;

    const raw = codeInput.value.trim();
    if (!raw) {
      toast("Paste HTML first.");
      return;
    }

    const html = sanitizePrototypeHtml(raw);
    const res = setShareHash({ v: 1, html, createdAt: nowISO() });

    if (!res.ok) {
      toast("Prototype too large for a link. Keep it smaller for sharing.");
      shareLink.value = "";
      return;
    }

    shareLink.value = location.href;
    toast("Share link created.");
  }

  function resetShareLink() {
    if (location.hash.startsWith("#share=")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    localStorage.removeItem(LS.SHARE_TOKEN);
    if (shareLink) shareLink.value = "";
    toast("Share link reset.");
  }

  function bindShare() {
    if (btnCreateShare) btnCreateShare.addEventListener("click", createShareLink);

    if (btnCopyShareLink && shareLink) {
      btnCopyShareLink.addEventListener("click", async () => {
        if (!shareLink.value) {
          toast("Create a share link first.");
          return;
        }
        const ok = await copyToClipboard(shareLink.value);
        toast(ok ? "Link copied." : "Copy failed.");
      });
    }

    if (btnCopyShareText) {
      btnCopyShareText.addEventListener("click", async () => {
        const text = buildShareText(shareLink?.value || "");
        const ok = await copyToClipboard(text);
        toast(ok ? "Share text copied." : "Copy failed.");
      });
    }

    if (btnResetLink) btnResetLink.addEventListener("click", resetShareLink);
  }

  // -----------------------------
  // Feedback UI
  // -----------------------------
  let sentiment = null;

  function selectSentiment(value) {
    sentiment = value;
    chips.forEach((c) => c.classList.toggle("is-selected", c.getAttribute("data-sentiment") === value));
  }

  function renderFeedback() {
    if (!recentFeedback) return;

    const list = getFeedback();
    if (!list.length) {
      recentFeedback.innerHTML = `<div class="tiny muted">No feedback yet.</div>`;
      return;
    }

    const last = list.slice(-6).reverse();
    recentFeedback.innerHTML = last
      .map((it) => {
        const label = it.sentiment === "useful" ? "👍 Useful" : "👎 Not useful";
        const when = new Date(it.at).toLocaleString();
        const text = it.text ? escapeHtml(it.text) : `<span class="tiny muted">(no note)</span>`;
        return `
          <div class="list-item">
            <div><strong>${label}</strong> <span class="tiny muted">• ${escapeHtml(when)}</span></div>
            <div class="muted" style="margin-top:6px;">${text}</div>
          </div>`;
      })
      .join("");
  }

  function bindFeedback() {
    chips.forEach((c) => {
      c.addEventListener("click", () => selectSentiment(c.getAttribute("data-sentiment")));
    });

    if (btnSubmitFeedback) {
      btnSubmitFeedback.addEventListener("click", () => {
        if (!sentiment) {
          toast("Pick Useful or Not useful.");
          return;
        }
        const text = (feedbackText?.value || "").trim();

        const list = getFeedback();
        list.push({
          id: (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
          sentiment,
          text,
          at: nowISO(),
        });
        setFeedback(list);

        bumpMetric("feedback");

        // Reset
        if (feedbackText) feedbackText.value = "";
        selectSentiment(null);

        renderFeedback();
        if (feedbackSaveStatus) feedbackSaveStatus.textContent = "Saved locally";
        toast("Feedback saved.");
      });
    }

    if (btnExportFeedback) {
      btnExportFeedback.addEventListener("click", () => {
        const list = getFeedback();
        downloadText("vibesnap-feedback.json", JSON.stringify(list, null, 2), "application/json");
        toast("Exported feedback.");
      });
    }

    if (btnClearFeedback) {
      btnClearFeedback.addEventListener("click", () => {
        if (!confirm("Clear all feedback stored on this device?")) return;
        setFeedback([]);
        renderFeedback();

        // Reset feedback metric only
        const m = getMetrics();
        m.feedback = 0;
        setMetrics(m);
        renderMetrics();

        toast("Feedback cleared.");
      });
    }
  }

  // -----------------------------
  // Metrics UI
  // -----------------------------
  function renderMetrics() {
    const m = getMetrics();
    if (statViews) statViews.textContent = String(m.views || 0);
    if (statLaunches) statLaunches.textContent = String(m.launches || 0);
    if (statFeedback) statFeedback.textContent = String(m.feedback || 0);
  }

  function bindMetrics() {
    if (btnResetAnalytics) {
      btnResetAnalytics.addEventListener("click", () => {
        if (!confirm("Reset local analytics on this device?")) return;
        localStorage.removeItem(LS.METRICS);
        renderMetrics();
        toast("Analytics reset.");
      });
    }
  }

  // -----------------------------
  // Boot: load from share hash if present
  // -----------------------------
  function bootShareIfPresent() {
    const shared = readShareHash();
    if (!shared || typeof shared.html !== "string") return;

    // Ensure we’re on the app page
    setActivePage("app");

    if (codeInput) {
      codeInput.value = shared.html;
      saveDraft(shared.html);
      setSaveStatus("Loaded from share link");
      // Auto-launch for instant value
      if (previewFrame) previewFrame.srcdoc = sanitizePrototypeHtml(shared.html);
      bumpMetric("launches");
      toast("Loaded shared prototype.");
    }
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function boot() {
    bindNav();
    bindAutosave();
    bindPreview();
    bindShare();
    bindFeedback();
    bindMetrics();

    // Count one view per page load (local-only)
    bumpMetric("views");
    renderFeedback();

    // Start on app by default unless user navigates
    setActivePage("app");
    setActiveTab("preview");

    // Load shared prototype if present
    bootShareIfPresent();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
