(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // -----------------------------
  // Local storage keys
  // -----------------------------
  const LS = {
    DRAFT_HTML: "vibesnap:draft_html",
    FEEDBACK: "vibesnap:feedback",
    METRICS: "vibesnap:metrics",
    SHARE: "vibesnap:share_map",
  };

  // -----------------------------
  // Elements
  // -----------------------------
  const navBtns = $$("[data-nav]");
  const toastEl = $("#toast");

  // App core
  const codeInput = $("#codeInput");
  const btnStarter = $("#btnStarter");
  const btnClearInput = $("#btnClearInput");
  const btnDownload = $("#btnDownload");
  const btnLaunch = $("#btnLaunch");
  const btnReload = $("#btnReload");
  const previewFrame = $("#previewFrame");
  const saveStatus = $("#saveStatus");
  const btnClearSaved = $("#btnClearSaved");

  // Share
  const shareInput = $("#shareInput");
  const btnCreateShare = $("#btnCreateShare");
  const btnCopyLink = $("#btnCopyLink");
  const btnCopyPrompt = $("#btnCopyPrompt");
  const btnOpenShare = $("#btnOpenShare");
  const btnClearShare = $("#btnClearShare");

  // Feedback
  const segBtns = $$("[data-sentiment]");
  const feedbackText = $("#feedbackText");
  const btnSaveFeedback = $("#btnSaveFeedback");
  const btnClearFeedback = $("#btnClearFeedback");
  const btnExportFeedback = $("#btnExportFeedback");
  const feedbackEmpty = $("#feedbackEmpty");

  // Metrics
  const statViews = $("#statViews");
  const statLaunches = $("#statLaunches");
  const statFeedback = $("#statFeedback");
  const btnResetAnalytics = $("#btnResetAnalytics");

  // Prompt builder
  const pb = {
    idea: $("#pbIdea"),
    audience: $("#pbAudience"),
    goal: $("#pbGoal"),
    screens: $("#pbScreens"),
    must: $("#pbMust"),
    data: $("#pbData"),
    style: $("#pbStyle"),
    notes: $("#pbNotes"),
    out: $("#pbOut"),
    copy: $("#btnPromptCopy"),
    reset: $("#btnPromptReset"),
  };

  // Import helper
  const dzSingle = $("#dzSingle");
  const fileSingle = $("#fileSingle");
  const dzSplit = $("#dzSplit");
  const fileSplit = $("#fileSplit");
  const stSingle = $("#stSingle");
  const stHtml = $("#stHtml");
  const stCss = $("#stCss");
  const stJs = $("#stJs");
  const assembledOut = $("#assembledOut");
  const btnImportClear = $("#btnImportClear");
  const btnImportUse = $("#btnImportUse");
  const btnAssembleCopy = $("#btnAssembleCopy");
  const btnAssembleDownload = $("#btnAssembleDownload");
  const btnAssembleLaunch = $("#btnAssembleLaunch");

  // -----------------------------
  // Utils
  // -----------------------------
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    window.clearTimeout(toastEl._t);
    toastEl._t = window.setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function debounce(fn, wait = 200) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast("Copied");
    }
  }

  function downloadFile(filename, content, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // -----------------------------
  // Navigation
  // -----------------------------
  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-nav");
      if (!id) return;
      scrollToSection(id);
    });
  });

  // active state on scroll (simple)
  const sections = ["app", "prompt", "import", "pricing"].map((id) => document.getElementById(id)).filter(Boolean);
  const setActiveNav = debounce(() => {
    const y = window.scrollY + 120;
    let current = "app";
    for (const s of sections) {
      if (s.offsetTop <= y) current = s.id;
    }
    navBtns.forEach((b) => b.classList.toggle("is-active", b.getAttribute("data-nav") === current));
  }, 60);

  window.addEventListener("scroll", setActiveNav, { passive: true });
  setActiveNav();

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
  // Draft autosave
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
  }, 320);

  if (codeInput) codeInput.addEventListener("input", saveDraftDebounced);

  if (btnClearSaved) {
    btnClearSaved.addEventListener("click", () => {
      localStorage.removeItem(LS.DRAFT_HTML);
      if (codeInput) codeInput.value = "";
      setSaveStatus("Nothing saved");
      toast("Saved draft cleared");
    });
  }

  // -----------------------------
  // Prototype launch
  // -----------------------------
  function setLoading(isLoading) {
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

  function normalizeHtmlInput(raw) {
    const s = (raw || "").trim();
    if (!s) return "";
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

  async function launchFromText(raw) {
    const normalized = normalizeHtmlInput(raw);
    if (!normalized) {
      toast("Paste HTML first");
      return;
    }
    setLoading(true);
    // tiny delay so the button gives feedback
    await new Promise((r) => setTimeout(r, 120));
    setPreview(normalized);
    setLoading(false);
    bumpMetric("launches", 1);
  }

  function launch() {
    if (!codeInput) return;
    launchFromText(codeInput.value);
  }

  if (btnLaunch) btnLaunch.addEventListener("click", launch);
  if (btnReload) btnReload.addEventListener("click", () => {
    if (previewFrame) previewFrame.srcdoc = previewFrame.srcdoc || "";
    toast("Reloaded");
  });

  if (btnStarter) {
    btnStarter.addEventListener("click", () => {
      const starter = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Prototype</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
    button{padding:10px 14px}
  </style>
</head>
<body>
  <h1>Hello prototype</h1>
  <p>Edit this file and reload preview.</p>
  <button id="btn">Click me</button>
  <script>
    document.getElementById('btn').addEventListener('click', () => alert('clicked'));
  </script>
</body>
</html>`;
      if (codeInput) codeInput.value = starter;
      localStorage.setItem(LS.DRAFT_HTML, starter);
      setSaveStatus("Saved locally");
      toast("Starter pasted");
    });
  }

  if (btnClearInput) {
    btnClearInput.addEventListener("click", () => {
      if (codeInput) codeInput.value = "";
      toast("Cleared");
    });
  }

  if (btnDownload) {
    btnDownload.addEventListener("click", () => {
      const raw = (codeInput?.value || "").trim();
      if (!raw) return toast("Nothing to download");
      const normalized = normalizeHtmlInput(raw);
      downloadFile("prototype.html", normalized, "text/html");
      toast("Downloaded");
    });
  }

  loadDraft();

  // -----------------------------
  // Share links (local-only)
  // -----------------------------
  function getShareMap() {
    return safeJsonParse(localStorage.getItem(LS.SHARE), {}) || {};
  }
  function setShareMap(map) {
    localStorage.setItem(LS.SHARE, JSON.stringify(map));
  }

  function makeId() {
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }

  function feedbackPrompt() {
    return [
      "Quick feedback request:",
      "1) Would you use this? Why/why not?",
      "2) What confused you or slowed you down?",
      "3) What would you change first?"
    ].join("\n");
  }

  function setShareUi(url) {
    if (shareInput) shareInput.value = url || "";
  }

  function createShare() {
    const raw = (codeInput?.value || "").trim();
    if (!raw) return toast("Paste HTML first");
    const id = makeId();
    const map = getShareMap();
    map[id] = { html: normalizeHtmlInput(raw), createdAt: Date.now() };
    setShareMap(map);

    const url = `${location.origin}${location.pathname}#share=${encodeURIComponent(id)}`;
    setShareUi(url);
    toast("Share link created");
  }

  if (btnCreateShare) btnCreateShare.addEventListener("click", createShare);

  if (btnCopyLink) btnCopyLink.addEventListener("click", () => {
    const url = (shareInput?.value || "").trim();
    if (!url) return toast("Create a link first");
    copyText(url);
  });

  if (btnCopyPrompt) btnCopyPrompt.addEventListener("click", () => {
    copyText(feedbackPrompt());
  });

  if (btnOpenShare) btnOpenShare.addEventListener("click", () => {
    const url = (shareInput?.value || "").trim();
    if (!url) return toast("Create a link first");
    window.open(url, "_blank", "noopener,noreferrer");
  });

  if (btnClearShare) btnClearShare.addEventListener("click", () => {
    setShareUi("");
    toast("Cleared");
  });

  function tryHydrateFromShareHash() {
    const m = location.hash.match(/share=([^&]+)/);
    if (!m) return;
    const id = decodeURIComponent(m[1] || "");
    const map = getShareMap();
    const record = map[id];
    if (!record?.html) return;
    // load into preview + editor
    if (codeInput) codeInput.value = record.html;
    localStorage.setItem(LS.DRAFT_HTML, record.html);
    setSaveStatus("Draft restored");
    setShareUi(`${location.origin}${location.pathname}#share=${encodeURIComponent(id)}`);
    launchFromText(record.html);
    toast("Loaded shared prototype");
  }

  tryHydrateFromShareHash();

  // -----------------------------
  // Feedback storage
  // -----------------------------
  function getFeedbackList() {
    return safeJsonParse(localStorage.getItem(LS.FEEDBACK), []) || [];
  }

  function setFeedbackList(list) {
    localStorage.setItem(LS.FEEDBACK, JSON.stringify(list));
  }

  function renderFeedbackEmpty() {
    const list = getFeedbackList();
    if (feedbackEmpty) {
      feedbackEmpty.textContent = list.length ? `Saved: ${list.length}` : "No feedback yet.";
    }
  }

  let currentSentiment = "useful";
  segBtns.forEach((b) => {
    b.addEventListener("click", () => {
      segBtns.forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      currentSentiment = b.getAttribute("data-sentiment") || "useful";
    });
  });

  if (btnSaveFeedback) {
    btnSaveFeedback.addEventListener("click", () => {
      const text = (feedbackText?.value || "").trim();
      if (!text) return toast("Type feedback first");
      const list = getFeedbackList();
      list.unshift({ sentiment: currentSentiment, text, at: Date.now() });
      setFeedbackList(list);
      if (feedbackText) feedbackText.value = "";
      bumpMetric("feedback", 1);
      renderFeedbackEmpty();
      toast("Saved");
    });
  }

  if (btnClearFeedback) {
    btnClearFeedback.addEventListener("click", () => {
      if (feedbackText) feedbackText.value = "";
      toast("Cleared");
    });
  }

  if (btnExportFeedback) {
    btnExportFeedback.addEventListener("click", () => {
      const list = getFeedbackList();
      if (!list.length) return toast("No feedback to export");
      const out = JSON.stringify(list, null, 2);
      downloadFile("vibesnap-feedback.json", out, "application/json");
      toast("Exported");
    });
  }

  renderFeedbackEmpty();

  // -----------------------------
  // Prompt builder
  // -----------------------------
  function buildPrompt() {
    const idea = (pb.idea?.value || "").trim() || "[describe the app]";
    const audience = (pb.audience?.value || "").trim() || "[target user]";
    const goal = (pb.goal?.value || "").trim() || "[primary goal]";
    const screens = (pb.screens?.value || "").trim() || "[key screens]";
    const must = (pb.must?.value || "").trim() || "[must-have interaction]";
    const data = (pb.data?.value || "").trim() || "[data to store]";
    const style = (pb.style?.value || "").trim() || "Clean, modern, dark-mode friendly";
    const notes = (pb.notes?.value || "").trim();

    const lines = [
      "You are generating a rapid validation prototype.",
      "",
      "Output a single self-contained HTML file that includes:",
      "- Inline CSS in a <style> tag",
      "- Inline JavaScript in a <script> tag",
      "- No external libraries",
      "- No external assets",
      "- Works by opening the HTML file directly",
      "",
      `App concept: ${idea}`,
      `Target user: ${audience}`,
      `Primary goal: ${goal}`,
      `Key screens: ${screens}`,
      `Must-have interaction: ${must}`,
      `Data to store: ${data}`,
      "",
      `Requirements:`,
      `- Style: ${style}`,
      "- Make it feel real: include realistic empty states, example data, and at least one meaningful interaction",
      "- Keep it simple but functional",
      "- Include a tiny 'prototype' label somewhere in the UI",
      "",
      "IMPORTANT:",
      "Output ONLY the full HTML code (single file). Do not include explanations.",
    ];

    if (notes) {
      lines.splice(lines.length - 3, 0, "", `Extra notes: ${notes}`);
    }

    return lines.join("\n");
  }

  function renderPrompt() {
    if (!pb.out) return;
    pb.out.value = buildPrompt();
  }

  const promptInputs = [pb.idea, pb.audience, pb.goal, pb.screens, pb.must, pb.data, pb.style, pb.notes].filter(Boolean);
  promptInputs.forEach((el) => el.addEventListener("input", debounce(renderPrompt, 80)));
  renderPrompt();

  if (pb.copy) pb.copy.addEventListener("click", () => copyText(pb.out?.value || ""));
  if (pb.reset) pb.reset.addEventListener("click", () => {
    promptInputs.forEach((el) => (el.value = ""));
    renderPrompt();
    toast("Reset");
  });

  // -----------------------------
  // Import helper: drag/drop + assemble
  // -----------------------------
  let importState = {
    singleHtml: "",
    html: "",
    css: "",
    js: "",
    lastAssembled: "",
  };

  function setCheck(el, ok) {
    if (!el) return;
    el.classList.toggle("is-ok", !!ok);
  }

  function assemble(htmlText, cssText, jsText) {
    const base = (htmlText || "").trim();
    if (!base) return "";
    const hasHtml = /<html[\s>]/i.test(base) || /<!doctype/i.test(base);
    let doc = hasHtml ? base : normalizeHtmlInput(base);

    // inject css
    if (cssText && cssText.trim()) {
      const cssTag = `\n<style>\n${cssText.trim()}\n</style>\n`;
      if (/<\/head>/i.test(doc)) {
        doc = doc.replace(/<\/head>/i, cssTag + "</head>");
      } else {
        doc = doc.replace(/<body[^>]*>/i, (m) => m + cssTag);
      }
    }

    // inject js
    if (jsText && jsText.trim()) {
      const jsTag = `\n<script>\n${jsText.trim()}\n</script>\n`;
      if (/<\/body>/i.test(doc)) {
        doc = doc.replace(/<\/body>/i, jsTag + "</body>");
      } else {
        doc += jsTag;
      }
    }

    return doc;
  }

  function renderImport() {
    // status
    setCheck(stSingle, !!importState.singleHtml);
    setCheck(stHtml, !!importState.html);
    setCheck(stCss, !!importState.css);
    setCheck(stJs, !!importState.js);

    // assembled output prefers split, else single
    const assembled = importState.html
      ? assemble(importState.html, importState.css, importState.js)
      : importState.singleHtml
        ? normalizeHtmlInput(importState.singleHtml)
        : "";

    importState.lastAssembled = assembled;
    if (assembledOut) assembledOut.value = assembled;
  }

  async function readFileAsText(file) {
    return await file.text();
  }

  function handleSingleFile(file) {
    if (!file) return;
    const name = (file.name || "").toLowerCase();
    if (!name.endsWith(".html")) {
      toast("Please upload an .html file");
      return;
    }
    readFileAsText(file).then((text) => {
      importState.singleHtml = text;
      toast("HTML file uploaded");
      renderImport();
    });
  }

  function handleSplitFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;

    const reads = list.map(async (f) => {
      const n = (f.name || "").toLowerCase();
      const t = await readFileAsText(f);
      if (n.endsWith(".html")) importState.html = t;
      else if (n.endsWith(".css")) importState.css = t;
      else if (n.endsWith(".js")) importState.js = t;
    });

    Promise.all(reads).then(() => {
      toast("Files uploaded");
      renderImport();
    });
  }

  // Dropzone helpers
  function wireDropzone(zone, onFiles) {
    if (!zone) return;

    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    ["dragenter", "dragover"].forEach((evt) => {
      zone.addEventListener(evt, (e) => {
        prevent(e);
        zone.classList.add("is-over");
      });
    });

    ["dragleave", "drop"].forEach((evt) => {
      zone.addEventListener(evt, (e) => {
        prevent(e);
        zone.classList.remove("is-over");
      });
    });

    zone.addEventListener("drop", (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length) onFiles(files);
    });

    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        // let the hidden file inputs handle browse in UI
      }
    });
  }

  wireDropzone(dzSingle, (files) => handleSingleFile(files[0]));
  wireDropzone(dzSplit, (files) => handleSplitFiles(files));

  if (fileSingle) {
    fileSingle.addEventListener("change", (e) => handleSingleFile(e.target.files?.[0]));
  }
  if (fileSplit) {
    fileSplit.addEventListener("change", (e) => handleSplitFiles(e.target.files));
  }

  if (btnImportClear) {
    btnImportClear.addEventListener("click", () => {
      importState = { singleHtml: "", html: "", css: "", js: "", lastAssembled: "" };
      if (assembledOut) assembledOut.value = "";
      renderImport();
      toast("Cleared imports");
    });
  }

  if (btnImportUse) {
    btnImportUse.addEventListener("click", () => {
      const assembled = importState.lastAssembled || "";
      if (!assembled.trim()) return toast("Nothing to load");
      if (codeInput) codeInput.value = assembled;
      localStorage.setItem(LS.DRAFT_HTML, assembled);
      setSaveStatus("Saved locally");
      toast("Loaded into App");
      scrollToSection("app");
    });
  }

  if (btnAssembleCopy) btnAssembleCopy.addEventListener("click", () => {
    const assembled = importState.lastAssembled || "";
    if (!assembled.trim()) return toast("Nothing to copy");
    copyText(assembled);
  });

  if (btnAssembleDownload) btnAssembleDownload.addEventListener("click", () => {
    const assembled = importState.lastAssembled || "";
    if (!assembled.trim()) return toast("Nothing to download");
    downloadFile("assembled.html", assembled, "text/html");
    toast("Downloaded");
  });

  if (btnAssembleLaunch) btnAssembleLaunch.addEventListener("click", () => {
    const assembled = importState.lastAssembled || "";
    if (!assembled.trim()) return toast("Nothing to launch");
    launchFromText(assembled);
    scrollToSection("app");
  });

  renderImport();
})();