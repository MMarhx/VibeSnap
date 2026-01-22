/* VibeSnap - app.js
   Local-first prototype preview + lightweight feedback helpers.
*/
(function () {
  const LS = {
    lastHtml: "vibesnap:last_html",
    sharesPrefix: "vibesnap:share:",
    analytics: "vibesnap:analytics",
    feedback: "vibesnap:feedback",
  };

  function $(id) { return document.getElementById(id); }
  function qsa(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }

  function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function getAnalytics() {
    const base = { views: 0, launches: 0, feedback: 0 };
    const v = safeJsonParse(localStorage.getItem(LS.analytics) || "", base);
    return { ...base, ...v };
  }
  function setAnalytics(next) {
    localStorage.setItem(LS.analytics, JSON.stringify(next));
  }
  function bump(key) {
    const a = getAnalytics();
    a[key] = (a[key] || 0) + 1;
    setAnalytics(a);
    return a;
  }

  // Toast
  let toastTimer = null;
  function showToast(title, msg) {
    const t = $("toast");
    if (!t) return;
    const tt = $("toastTitle");
    const tm = $("toastMsg");
    if (tt) tt.textContent = title || "Done";
    if (tm) tm.textContent = msg || "";
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied", "Copied to clipboard.");
      return true;
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) showToast("Copied", "Copied to clipboard.");
      return ok;
    }
  }

  function downloadText(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  // ---------- Workspace page ----------
  function initWorkspace() {
    const protoHtml = $("protoHtml");
    if (!protoHtml) return;

    const saveState = $("saveState");
    const btnPasteStarter = $("btnPasteStarter");
    const btnClearHtml = $("btnClearHtml");
    const btnDownloadHtml = $("btnDownloadHtml");
    const btnLaunchPreview = $("btnLaunchPreview");
    const btnOpenPreview = $("btnOpenPreview");

    const shareInput = $("shareInput");
    const btnCreateShare = $("btnCreateShare");
    const btnCopyShare = $("btnCopyShare");
    const btnCopyFeedbackPrompt = $("btnCopyFeedbackPrompt");
    const btnOpenShare = $("btnOpenShare");
    const btnClearShare = $("btnClearShare");

    const feedbackText = $("feedbackText");
    const feedbackStatus = $("feedbackStatus");
    const btnSaveFeedback = $("btnSaveFeedback");
    const btnClearFeedback = $("btnClearFeedback");
    const btnExportFeedback = $("btnExportFeedback");

    const kViews = $("kViews");
    const kLaunches = $("kLaunches");
    const kFeedback = $("kFeedback");
    const btnResetAnalytics = $("btnResetAnalytics");

    // Load saved HTML (if any)
    const last = localStorage.getItem(LS.lastHtml);
    if (last && !protoHtml.value) protoHtml.value = last;

    function updateSaveState() {
      if (!saveState) return;
      const has = !!protoHtml.value.trim();
      saveState.textContent = has ? "Ready" : "Nothing saved";
    }
    updateSaveState();

    protoHtml.addEventListener("input", () => {
      localStorage.setItem(LS.lastHtml, protoHtml.value);
      updateSaveState();
    });

    if (btnPasteStarter) {
      btnPasteStarter.addEventListener("click", () => {
        const starter = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Prototype</title>
  <style>
    body{font-family:system-ui;margin:24px}
    button{padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:#111;color:#fff}
  </style>
</head>
<body>
  <h1>Hello prototype</h1>
  <p>Edit this file and reload preview.</p>
  <button onclick="alert('Click')">Click me</button>
  <script>
    console.log('prototype loaded');
  </script>
</body>
</html>`;
        protoHtml.value = starter;
        localStorage.setItem(LS.lastHtml, starter);
        updateSaveState();
        showToast("Starter added", "Paste your prototype over the sample.");
      });
    }

    if (btnClearHtml) {
      btnClearHtml.addEventListener("click", () => {
        protoHtml.value = "";
        localStorage.removeItem(LS.lastHtml);
        updateSaveState();
        showToast("Cleared", "Prototype HTML cleared.");
      });
    }

    if (btnDownloadHtml) {
      btnDownloadHtml.addEventListener("click", () => {
        const val = protoHtml.value.trim();
        if (!val) return showToast("Nothing to download", "Paste some HTML first.");
        downloadText("prototype.html", val);
        showToast("Downloaded", "prototype.html saved.");
      });
    }

    function openPreviewWith(html, sourceLabel) {
      const trimmed = (html || "").trim();
      if (!trimmed) return showToast("Nothing to preview", "Paste some HTML first.");
      localStorage.setItem(LS.lastHtml, trimmed);
      bump("launches");
      syncAnalyticsUI();
      const w = window.open("preview.html", "_blank", "noopener,noreferrer");
      // The preview page reads from localStorage; small delay helps on some browsers.
      setTimeout(() => {
        try { w && w.focus && w.focus(); } catch {}
      }, 80);
      showToast("Preview opened", sourceLabel || "Opened in a new tab.");
    }

    if (btnLaunchPreview) btnLaunchPreview.addEventListener("click", () => openPreviewWith(protoHtml.value, "Launching preview…"));
    if (btnOpenPreview) btnOpenPreview.addEventListener("click", () => window.open("preview.html", "_blank", "noopener,noreferrer"));

    // Share link (local storage based)
    function createShare() {
      const htmlVal = protoHtml.value.trim();
      if (!htmlVal) return showToast("Nothing to share", "Paste some HTML first.");
      const id = (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);
      localStorage.setItem(LS.sharesPrefix + id, htmlVal);
      const url = `${location.origin}${location.pathname.replace(/\/[^\/]*$/, "/")}preview.html#${id}`;
      if (shareInput) shareInput.value = url;
      showToast("Share link created", "Works on this device until backend exists.");
      return { id, url };
    }

    if (btnCreateShare) btnCreateShare.addEventListener("click", createShare);
    if (btnCopyShare) btnCopyShare.addEventListener("click", () => copyText(shareInput?.value || ""));
    if (btnOpenShare) btnOpenShare.addEventListener("click", () => {
      const url = shareInput?.value || "";
      if (!url) return showToast("No link", "Create a share link first.");
      window.open(url, "_blank", "noopener,noreferrer");
    });
    if (btnClearShare) btnClearShare.addEventListener("click", () => { if (shareInput) shareInput.value = ""; });

    if (btnCopyFeedbackPrompt) {
      btnCopyFeedbackPrompt.addEventListener("click", () => {
        const prompt = `Quick feedback request:
1) Would you use this? Why / why not?
2) What’s missing for your workflow?
3) If you could change one thing, what would it be?`;
        copyText(prompt);
      });
    }

    // Feedback tagging
    let currentTag = "Useful";
    qsa(".tagBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        currentTag = btn.getAttribute("data-tag") || "Useful";
        qsa(".tagBtn").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
      });
    });

    // Feedback storage
    const feedbackData = safeJsonParse(localStorage.getItem(LS.feedback) || "[]", []);
    function syncFeedbackUI() {
      const a = getAnalytics();
      if (feedbackStatus) feedbackStatus.textContent = feedbackData.length ? `Saved locally (${feedbackData.length})` : "No feedback yet.";
      if (kViews) kViews.textContent = String(a.views || 0);
      if (kLaunches) kLaunches.textContent = String(a.launches || 0);
      if (kFeedback) kFeedback.textContent = String(a.feedback || 0);
    }
    function syncAnalyticsUI(){ syncFeedbackUI(); }
    syncFeedbackUI();

    if (btnSaveFeedback) {
      btnSaveFeedback.addEventListener("click", () => {
        const txt = (feedbackText?.value || "").trim();
        if (!txt) return showToast("Empty", "Write a sentence first.");
        const item = { tag: currentTag, text: txt, ts: new Date().toISOString() };
        feedbackData.push(item);
        localStorage.setItem(LS.feedback, JSON.stringify(feedbackData));
        const a = bump("feedback");
        if (kFeedback) kFeedback.textContent = String(a.feedback || 0);
        if (feedbackText) feedbackText.value = "";
        syncFeedbackUI();
        showToast("Saved", "Feedback saved locally.");
      });
    }

    if (btnClearFeedback) btnClearFeedback.addEventListener("click", () => { if (feedbackText) feedbackText.value = ""; });
    if (btnExportFeedback) {
      btnExportFeedback.addEventListener("click", () => {
        const data = safeJsonParse(localStorage.getItem(LS.feedback) || "[]", []);
        downloadText("vibesnap-feedback.json", JSON.stringify(data, null, 2));
        showToast("Exported", "vibesnap-feedback.json downloaded.");
      });
    }

    if (btnResetAnalytics) {
      btnResetAnalytics.addEventListener("click", () => {
        setAnalytics({ views: 0, launches: 0, feedback: 0 });
        syncAnalyticsUI();
        showToast("Reset", "Local counts cleared.");
      });
    }
  }

  // ---------- Prompt builder page ----------
  function initPromptBuilder() {
    const out = $("pbOutput");
    if (!out) return;

    const fields = {
      what: $("pbWhat"),
      forWhom: $("pbFor"),
      goal: $("pbGoal"),
      screens: $("pbScreens"),
      interactions: $("pbInteractions"),
      data: $("pbData"),
      style: $("pbStyle"),
      notes: $("pbNotes"),
    };

    function val(el, fallback="") { return (el && el.value ? el.value.trim() : fallback); }

    function buildPrompt() {
      const prompt = [
        "You are generating a rapid validation prototype.",
        "",
        "Make a single self-contained HTML file that includes:",
        "- Inline CSS in a <style> tag",
        "- Inline JavaScript in a <script> tag",
        "- No external libraries",
        "- No external assets",
        "- Works by opening the HTML file directly",
        "",
        `App concept: ${val(fields.what, "[describe the app]")}`,
        `Target user: ${val(fields.forWhom, "[who is this for]")}`,
        `Primary goal: ${val(fields.goal, "[primary goal]")}`,
        `Key screens: ${val(fields.screens, "[screens]")}`,
        `Must-have interactions: ${val(fields.interactions, "[interactions]")}`,
        `Data to store: ${val(fields.data, "[data fields]")}`,
        "",
        "Requirements:",
        `- Style: ${val(fields.style, "Clean, modern UI (dark mode friendly)")}`,
        "- Make it feel real: include realistic empty states and example data",
        "- Keep it simple but functional",
        "- Include a tiny 'prototype' label somewhere in the UI",
        val(fields.notes) ? "" : "",
        val(fields.notes) ? `Extra notes: ${val(fields.notes)}` : "",
        "",
        "Output ONLY the full HTML code. Do not include explanations.",
        "",
        "Important export instruction:",
        "After outputting the code, also provide it as a downloadable file named prototype.html (or clearly indicate the full code is the file contents)."
      ].filter(Boolean).join("\n");

      out.value = prompt;
    }

    Object.values(fields).forEach(el => el && el.addEventListener("input", buildPrompt));
    buildPrompt();

    const btnCopy = $("btnCopyPrompt");
    if (btnCopy) btnCopy.addEventListener("click", () => copyText(out.value));

    const btnReset = $("btnPromptReset");
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        Object.values(fields).forEach(el => { if (el) el.value = ""; });
        buildPrompt();
        showToast("Reset", "Fields cleared.");
      });
    }
  }

  // ---------- Preview page ----------
  function initPreview() {
    const frame = $("frame");
    if (!frame) return;

    // Count view
    bump("views");

    const meta = $("previewMeta");
    const btnReload = $("btnReload");

    function loadFromStorage() {
      let source = "local";
      let html = localStorage.getItem(LS.lastHtml) || "";
      const hash = (location.hash || "").replace("#", "").trim();
      if (hash) {
        const shared = localStorage.getItem(LS.sharesPrefix + hash) || "";
        if (shared) {
          html = shared;
          source = "share";
        } else {
          source = "missing";
        }
      }

      if (meta) {
        meta.textContent =
          source === "share" ? "Preview (local share link)" :
          source === "missing" ? "Preview (not found on this device)" :
          "Preview";
      }

      if (!html.trim()) {
        frame.srcdoc = `<html><body style="font-family:system-ui;margin:24px;background:#0b0d10;color:#fff">
          <h2 style="margin:0 0 8px">No prototype loaded</h2>
          <p style="opacity:.75;line-height:1.5">Go back to the workspace and click <b>Launch preview</b>.</p>
        </body></html>`;
        return;
      }

      frame.srcdoc = html;
      showToast("Loaded", "Preview ready.");
    }

    loadFromStorage();

    if (btnReload) btnReload.addEventListener("click", loadFromStorage);
    window.addEventListener("hashchange", loadFromStorage);
  }

  // Init by page content
  document.addEventListener("DOMContentLoaded", () => {
    initWorkspace();
    initPromptBuilder();
    initPreview();
  });
})();
