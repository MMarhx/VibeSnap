/* =========================================================
VIBESNAP — app.js
Static, privacy-first prototype runner + prompt builder + pricing page
Works offline / static hosting. No external libs.
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
    SHARE_TOKEN: "vibesnap:share_token",
    LAST_PANEL: "vibesnap:last_panel",
    PROMPT_BUILDER: "vibesnap:prompt_builder",
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

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

  function toTitleCase(str) {
    return (str || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
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

  // Base64 (utf-8 safe)
  function b64EncodeUtf8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }

  function b64DecodeUtf8(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // Share token in URL hash (small prototypes only)
  function setShareHash(payloadObj) {
    const json = JSON.stringify(payloadObj);
    const b64 = b64EncodeUtf8(json);
    const token = encodeURIComponent(b64);
    // Keep it reasonable. Many platforms choke on very long URLs.
    if (token.length > 1800) return { ok: false, reason: "too_long", size: token.length };
    location.hash = `#share=${token}`;
    localStorage.setItem(LS.SHARE_TOKEN, token);
    return { ok: true, token };
  }

  function readShareHash() {
    const m = location.hash.match(/#share=([^&]+)/);
    if (!m) return null;
    const token = m[1];
    try {
      const json = b64DecodeUtf8(decodeURIComponent(token));
      return safeJsonParse(json, null);
    } catch {
      return null;
    }
  }

  // -----------------------------
  // Basic HTML “safety” pass (best-effort)
  // NOTE: This is NOT a security product. Real hardening needs a backend + CSP.
  // We keep the iframe sandboxed and avoid allow-same-origin.
  // -----------------------------
  function sanitizePrototypeHtml(inputHtml) {
    let html = String(inputHtml || "").trim();

    if (!html) return { html: "", warnings: ["Paste an HTML prototype first."] };

    const warnings = [];

    // Encourage single-file HTML prototypes
    if (!/<html[\s>]/i.test(html)) {
      warnings.push("Tip: use a full single-file HTML document for best results.");
      // Wrap minimal
      html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${html}</head><body></body></html>`;
    }

    // External assets warning (we don't block all, but we warn + strip some obvious)
    const hasExternal =
      /(src|href)\s*=\s*["']https?:\/\//i.test(html) ||
      /(src|href)\s*=\s*["']\/\//i.test(html);

    if (hasExternal) {
      warnings.push(
        "This prototype references external assets. For reliable previews, keep it self-contained (inline CSS/JS)."
      );
    }

    // Strip obvious remote scripts (best effort)
    html = html.replace(
      /<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\/[^"']+["'][^>]*>\s*<\/script>/gi,
      (match) => {
        warnings.push("Removed external <script src=…> for safety.");
        return "";
      }
    );

    // Strip meta refresh
    html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']refresh["'][^>]*>/gi, () => {
      warnings.push("Removed meta refresh for safety.");
      return "";
    });

    return { html, warnings };
  }

  // -----------------------------
  // Metrics (local only)
  // -----------------------------
  function getMetrics() {
    return safeJsonParse(localStorage.getItem(LS.METRICS), {
      views: 0,
      launches: 0,
      feedbackCount: 0,
      firstSeenAt: nowISO(),
      lastSeenAt: nowISO(),
    });
  }

  function setMetrics(next) {
    localStorage.setItem(LS.METRICS, JSON.stringify(next));
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
  // Feedback (local only)
  // -----------------------------
  function getFeedback() {
    return safeJsonParse(localStorage.getItem(LS.FEEDBACK), []);
  }

  function setFeedback(list) {
    localStorage.setItem(LS.FEEDBACK, JSON.stringify(list));
  }

  // -----------------------------
  // UI refs (best-effort, tolerate missing)
  // -----------------------------
  const navPreview = $("#navPreview");
  const navPrompt = $("#navPrompt");
  const navImport = $("#navImport");
  const navPricing = $("#navPricing");
  const navBackToApp = $("#navBackToApp");

  const panelPreview = $("#panelPreview");
  const panelPrompt = $("#panelPrompt");
  const panelImport = $("#panelImport");
  const panelPricing = $("#panelPricing");

  // Preview panel elements
  const protoTextarea = $("#protoCode");
  const btnPasteStarter = $("#btnPasteStarter");
  const btnClearProto = $("#btnClearProto");
  const btnLaunch = $("#btnLaunch");
  const btnReload = $("#btnReload");
  const iframe = $("#previewFrame");
  const previewNote = $("#previewNote");
  const btnDownload = $("#btnDownloadHtml");

  const shareInput = $("#shareLink");
  const btnCreateShare = $("#btnCreateShare");
  const btnCopyShare = $("#btnCopyShare");
  const btnResetLink = $("#btnResetLink");
  const btnOpenNewTab = $("#btnOpenNewTab");
  const btnCopyShareText = $("#btnCopyShareText");

  const savedStatus = $("#savedStatus");
  const btnClearSaved = $("#btnClearSaved");

  // Feedback
  const fbUseful = $("#fbUseful");
  const fbNotUseful = $("#fbNotUseful");
  const fbText = $("#fbText");
  const btnSubmitFeedback = $("#btnSubmitFeedback");
  const btnClearFeedback = $("#btnClearFeedback");
  const btnExportFeedback = $("#btnExportFeedback");
  const recentFeedback = $("#recentFeedback");

  // Metrics
  const metricViews = $("#metricViews");
  const metricLaunches = $("#metricLaunches");
  const metricFeedback = $("#metricFeedback");
  const btnResetMetrics = $("#btnResetMetrics");

  // Prompt builder
  const pbIdea = $("#pbIdea");
  const pbAudience = $("#pbAudience");
  const pbPlatform = $("#pbPlatform");
  const pbGoal = $("#pbGoal");
  const pbScreens = $("#pbScreens");
  const pbMustHave = $("#pbMustHave");
  const pbData = $("#pbData");
  const pbTone = $("#pbTone");
  const pbOutput = $("#pbOutput");
  const btnPbGenerate = $("#btnPbGenerate");
  const btnPbCopy = $("#btnPbCopy");
  const btnPbClear = $("#btnPbClear");

  // Import helper
  const ihPrompt = $("#ihPrompt");
  const ihChecklist = $("#ihChecklist");
  const btnIhCopy = $("#btnIhCopy");
  const btnIhToPreview = $("#btnIhToPreview");

  // Pricing page
  const btnGoPricing = $("#btnGoPricing");
  const btnPricingBack = $("#btnPricingBack");
  const planCtas = $$("[data-plan-cta]");

  // -----------------------------
  // Navigation
  // -----------------------------
  const PANELS = [
    { id: "preview", el: panelPreview, nav: navPreview },
    { id: "prompt", el: panelPrompt, nav: navPrompt },
    { id: "import", el: panelImport, nav: navImport },
    { id: "pricing", el: panelPricing, nav: navPricing },
  ];

  function setActivePanel(id) {
    PANELS.forEach((p) => {
      if (!p.el) return;
      const is = p.id === id;
      p.el.classList.toggle("is-active", is);
      if (p.nav) p.nav.classList.toggle("is-active", is);
    });
    localStorage.setItem(LS.LAST_PANEL, id);
  }

  function inferDefaultPanel() {
    // If we opened via share link, jump to preview panel
    if (readShareHash()) return "preview";
    return localStorage.getItem(LS.LAST_PANEL) || "preview";
  }

  function bindNav() {
    if (navPreview) navPreview.addEventListener("click", () => setActivePanel("preview"));
    if (navPrompt) navPrompt.addEventListener("click", () => setActivePanel("prompt"));
    if (navImport) navImport.addEventListener("click", () => setActivePanel("import"));
    if (navPricing) navPricing.addEventListener("click", () => setActivePanel("pricing"));

    if (btnGoPricing) btnGoPricing.addEventListener("click", () => setActivePanel("pricing"));
    if (btnPricingBack) btnPricingBack.addEventListener("click", () => setActivePanel("preview"));
    if (navBackToApp) navBackToApp.addEventListener("click", () => setActivePanel("preview"));

    planCtas.forEach((btn) => {
      btn.addEventListener("click", () => {
        // For now: no backend checkout. Keep CTA honest.
        alert(
          "Checkout isn’t wired yet.\n\nFor launch: this button will take users to purchase, then unlock sharing + saves."
        );
      });
    });
  }

  // -----------------------------
  // Autosave (local)
  // -----------------------------
  function setSavedStatus(text) {
    if (savedStatus) savedStatus.textContent = text || "";
  }

  function saveDraftHtml(html) {
    localStorage.setItem(LS.DRAFT_HTML, html);
    setSavedStatus("Saved locally");
  }

  function loadDraftHtml() {
    return localStorage.getItem(LS.DRAFT_HTML) || "";
  }

  function clearDraftHtml() {
    localStorage.removeItem(LS.DRAFT_HTML);
    setSavedStatus("Nothing saved");
  }

  function bindAutosave() {
    if (!protoTextarea) return;

    // Load draft on boot (unless share hash overrides)
    const shared = readShareHash();
    if (shared && shared.html) {
      protoTextarea.value = shared.html;
      setSavedStatus("Loaded from share link");
    } else {
      const draft = loadDraftHtml();
      if (draft) {
        protoTextarea.value = draft;
        setSavedStatus("Saved locally");
      } else {
        setSavedStatus("Nothing saved");
      }
    }

    let t = null;
    protoTextarea.addEventListener("input", () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => saveDraftHtml(protoTextarea.value), 250);
    });

    if (btnClearSaved) {
      btnClearSaved.addEventListener("click", () => {
        clearDraftHtml();
      });
    }
  }

  // -----------------------------
  // Preview (sandboxed iframe)
  // -----------------------------
  function setPreviewNote(lines) {
    if (!previewNote) return;
    const list = (lines || []).filter(Boolean);
    previewNote.innerHTML = list.length
      ? list.map((l) => `<div>• ${escapeHtml(l)}</div>`).join("")
      : "";
  }

  function ensureIframeSandbox() {
    if (!iframe) return;
    // Keep it sandboxed; allow scripts so the prototype runs.
    // DO NOT add allow-same-origin unless you know what you’re doing.
    iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-modals");
  }

  function launchPreview() {
    if (!protoTextarea || !iframe) return;

    const raw = protoTextarea.value || "";
    const { html, warnings } = sanitizePrototypeHtml(raw);

    ensureIframeSandbox();
    iframe.srcdoc = html;

    // Local-only metrics
    bumpMetric("launches");

    setPreviewNote(warnings);

    // Update share state (invalidate existing hash if any)
    if (shareInput) shareInput.value = "";

    return { html, warnings };
  }

  function reloadPreview() {
    if (!iframe) return;
    // Re-assign srcdoc to force reload
    const current = iframe.srcdoc;
    iframe.srcdoc = current;
    bumpMetric("launches");
  }

  function openPreviewInNewTab() {
    if (!protoTextarea) return;
    const { html } = sanitizePrototypeHtml(protoTextarea.value || "");
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // Let the browser keep it alive; revoke later
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function bindPreview() {
    if (btnLaunch) btnLaunch.addEventListener("click", launchPreview);
    if (btnReload) btnReload.addEventListener("click", reloadPreview);

    if (btnOpenNewTab) btnOpenNewTab.addEventListener("click", openPreviewInNewTab);

    if (btnClearProto && protoTextarea) {
      btnClearProto.addEventListener("click", () => {
        protoTextarea.value = "";
        saveDraftHtml("");
        if (iframe) iframe.srcdoc = "";
        setPreviewNote([]);
      });
    }

    if (btnDownload && protoTextarea) {
      btnDownload.addEventListener("click", () => {
        const { html } = sanitizePrototypeHtml(protoTextarea.value || "");
        downloadText("prototype.html", html, "text/html");
      });
    }

    if (btnPasteStarter && protoTextarea) {
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
  .card { max-width:720px; margin:0 auto; background:#111217; border:1px solid #1f2230; border-radius:14px; padding:18px; }
  button { background:#ff7a45; border:none; color:#160a05; padding:10px 14px; border-radius:10px; font-weight:700; cursor:pointer; }
  .muted { color:#a4a7b3; }
</style>
</head>
<body>
  <div class="card">
    <h1>Quick prototype</h1>
    <p class="muted">Edit this file. Add one real interaction. Test it with people.</p>
    <button id="btn">Click me</button>
    <p id="out" class="muted"></p>
  </div>

<script>
  const btn = document.getElementById('btn');
  const out = document.getElementById('out');
  let clicks = 0;
  btn.addEventListener('click', () => {
    clicks++;
    out.textContent = 'Clicks: ' + clicks;
  });
</script>
</body>
</html>`;
        protoTextarea.value = starter;
        saveDraftHtml(starter);
      });
    }
  }

  // -----------------------------
  // Sharing (hash-based, static)
  // -----------------------------
  function createShareLink() {
    if (!protoTextarea || !shareInput) return;
    const { html, warnings } = sanitizePrototypeHtml(protoTextarea.value || "");

    const payload = {
      v: 1,
      html,
      createdAt: nowISO(),
    };

    const res = setShareHash(payload);
    if (!res.ok) {
      shareInput.value = "";
      alert(
        res.reason === "too_long"
          ? `This prototype is too large to fit in a share link.\n\nTip: keep it single-file + small for sharing, or wait for cloud sharing. (Size: ${res.size} chars)`
          : "Could not create a share link."
      );
      setPreviewNote([...(warnings || []), "Share link not created (too large)."]);
      return;
    }

    // Use current full URL as share link
    shareInput.value = location.href;
    setPreviewNote([...(warnings || []), "Share link created. Anyone with the link can load the prototype locally in their browser."]);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
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

  function buildShareText() {
    const url = shareInput?.value || location.href;
    return `VibeSnap prototype link:\n${url}\n\nOne question:\nWould you use this? If not, what’s missing?`;
  }

  function bindShare() {
    if (btnCreateShare) btnCreateShare.addEventListener("click", createShareLink);

    if (btnCopyShare && shareInput) {
      btnCopyShare.addEventListener("click", async () => {
        if (!shareInput.value) {
          alert("Create a share link first.");
          return;
        }
        const ok = await copyToClipboard(shareInput.value);
        if (!ok) alert("Copy failed. You can manually select and copy the link.");
      });
    }

    if (btnCopyShareText) {
      btnCopyShareText.addEventListener("click", async () => {
        const text = buildShareText();
        const ok = await copyToClipboard(text);
        if (!ok) alert("Copy failed. You can manually copy the share text.");
      });
    }

    if (btnResetLink) {
      btnResetLink.addEventListener("click", () => {
        // Clear hash + input
        if (location.hash.startsWith("#share=")) history.replaceState(null, "", location.pathname + location.search);
        localStorage.removeItem(LS.SHARE_TOKEN);
        if (shareInput) shareInput.value = "";
      });
    }
  }

  // -----------------------------
  // Feedback
  // -----------------------------
  function renderFeedbackList() {
    if (!recentFeedback) return;
    const items = getFeedback();
    if (!items.length) {
      recentFeedback.innerHTML = `<div class="muted tiny">No feedback yet.</div>`;
      return;
    }
    const last = items.slice(-5).reverse();
    recentFeedback.innerHTML = last
      .map((it) => {
        const label = it.rating === "useful" ? "👍 Useful" : "👎 Not useful";
        const comment = it.comment ? escapeHtml(it.comment) : "<span class='muted'>(no comment)</span>";
        const when = new Date(it.at).toLocaleString();
        return `<div class="feedItem"><div><strong>${label}</strong> <span class="muted tiny">• ${escapeHtml(
          when
        )}</span></div><div class="muted">${comment}</div></div>`;
      })
      .join("");
  }

  function bindFeedback() {
    if (btnSubmitFeedback) {
      btnSubmitFeedback.addEventListener("click", () => {
        const rating =
          fbUseful?.checked ? "useful" : fbNotUseful?.checked ? "not_useful" : null;
        if (!rating) {
          alert("Pick Useful or Not useful.");
          return;
        }
        const comment = (fbText?.value || "").trim();

        const list = getFeedback();
        list.push({
          id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
          rating,
          comment,
          at: nowISO(),
        });
        setFeedback(list);

        // local metrics
        bumpMetric("feedbackCount");

        // reset
        if (fbText) fbText.value = "";
        if (fbUseful) fbUseful.checked = false;
        if (fbNotUseful) fbNotUseful.checked = false;

        renderFeedbackList();
      });
    }

    if (btnClearFeedback) {
      btnClearFeedback.addEventListener("click", () => {
        if (!confirm("Clear all local feedback on this device?")) return;
        setFeedback([]);
        renderFeedbackList();
        const m = getMetrics();
        m.feedbackCount = 0;
        setMetrics(m);
        renderMetrics();
      });
    }

    if (btnExportFeedback) {
      btnExportFeedback.addEventListener("click", () => {
        const list = getFeedback();
        downloadText("vibesnap-feedback.json", JSON.stringify(list, null, 2), "application/json");
      });
    }
  }

  // -----------------------------
  // Metrics render/reset
  // -----------------------------
  function renderMetrics() {
    const m = getMetrics();
    if (metricViews) metricViews.textContent = String(m.views || 0);
    if (metricLaunches) metricLaunches.textContent = String(m.launches || 0);
    if (metricFeedback) metricFeedback.textContent = String(m.feedbackCount || 0);
  }

  function bindMetrics() {
    if (btnResetMetrics) {
      btnResetMetrics.addEventListener("click", () => {
        if (!confirm("Reset local analytics on this device?")) return;
        localStorage.removeItem(LS.METRICS);
        renderMetrics();
      });
    }
  }

  // -----------------------------
  // Prompt Builder
  // -----------------------------
  function loadPromptBuilderDraft() {
    const d = safeJsonParse(localStorage.getItem(LS.PROMPT_BUILDER), null);
    if (!d) return;

    if (pbIdea) pbIdea.value = d.idea || "";
    if (pbAudience) pbAudience.value = d.audience || "";
    if (pbPlatform) pbPlatform.value = d.platform || "";
    if (pbGoal) pbGoal.value = d.goal || "";
    if (pbScreens) pbScreens.value = d.screens || "";
    if (pbMustHave) pbMustHave.value = d.mustHave || "";
    if (pbData) pbData.value = d.data || "";
    if (pbTone) pbTone.value = d.tone || "";
    if (pbOutput) pbOutput.value = d.output || "";
  }

  function savePromptBuilderDraft() {
    const d = {
      idea: pbIdea?.value || "",
      audience: pbAudience?.value || "",
      platform: pbPlatform?.value || "",
      goal: pbGoal?.value || "",
      screens: pbScreens?.value || "",
      mustHave: pbMustHave?.value || "",
      data: pbData?.value || "",
      tone: pbTone?.value || "",
      output: pbOutput?.value || "",
      at: nowISO(),
    };
    localStorage.setItem(LS.PROMPT_BUILDER, JSON.stringify(d));
  }

  function generatePromptFromForm() {
    const idea = (pbIdea?.value || "").trim() || "My app idea";
    const audience = (pbAudience?.value || "").trim() || "General users";
    const platform = (pbPlatform?.value || "").trim() || "Responsive web app";
    const goal = (pbGoal?.value || "").trim() || "Validate the concept quickly";
    const screens = (pbScreens?.value || "").trim() || "One screen is fine";
    const mustHave = (pbMustHave?.value || "").trim() || "At least one meaningful interaction";
    const data = (pbData?.value || "").trim() || "Local-only sample data";
    const tone = (pbTone?.value || "").trim() || "Clean, modern, dark-mode friendly";

    const prompt = `You are generating a rapid validation prototype.

Make a single self-contained HTML file that includes:
- Inline CSS in a <style> tag
- Inline JavaScript in a <script> tag
- No external libraries
- No external assets
- No build steps
- Works by opening the HTML file directly

App concept:
Idea: ${idea}
Target user: ${audience}
Platform: ${platform}
Primary goal: ${goal}
Key screens: ${screens}
Must-have interaction: ${mustHave}
Data to store/use: ${data}

Requirements:
- ${tone}
- Make it feel real: realistic empty states, example data, and at least one meaningful interaction
- Keep it simple but functional
- Include a tiny 'prototype' label somewhere in the UI

Output ONLY the full HTML code. Do not include explanations.`;

    if (pbOutput) pbOutput.value = prompt;
    savePromptBuilderDraft();
  }

  function bindPromptBuilder() {
    loadPromptBuilderDraft();

    const autosaveEls = [pbIdea, pbAudience, pbPlatform, pbGoal, pbScreens, pbMustHave, pbData, pbTone, pbOutput].filter(Boolean);
    let t = null;
    autosaveEls.forEach((el) => {
      el.addEventListener("input", () => {
        if (t) clearTimeout(t);
        t = setTimeout(savePromptBuilderDraft, 250);
      });
    });

    if (btnPbGenerate) btnPbGenerate.addEventListener("click", generatePromptFromForm);

    if (btnPbCopy && pbOutput) {
      btnPbCopy.addEventListener("click", async () => {
        const text = pbOutput.value.trim();
        if (!text) {
          alert("Generate a prompt first.");
          return;
        }
        const ok = await copyToClipboard(text);
        if (!ok) alert("Copy failed. You can manually select and copy.");
      });
    }

    if (btnPbClear) {
      btnPbClear.addEventListener("click", () => {
        if (!confirm("Clear the prompt builder fields (local)?")) return;
        [pbIdea, pbAudience, pbPlatform, pbGoal, pbScreens, pbMustHave, pbData, pbTone, pbOutput].forEach((el) => {
          if (el) el.value = "";
        });
        savePromptBuilderDraft();
      });
    }
  }

  // -----------------------------
  // Import helper
  // -----------------------------
  function buildImportHelperPrompt() {
    return `Paste this into your AI tool:

"Create a single-file HTML prototype (inline CSS + JS, no external assets). Keep it self-contained so it runs in a sandbox iframe.
Return ONLY the full HTML code. Include:
- One primary flow users can complete
- Realistic empty states + sample data
- One meaningful interaction (create, select, toggle, purchase simulation, etc.)
- A tiny 'prototype' label
- Mobile-friendly layout"`;
  }

  function bindImportHelper() {
    if (ihPrompt) ihPrompt.value = buildImportHelperPrompt();

    if (ihChecklist) {
      ihChecklist.innerHTML = `
        <ul class="bullets">
          <li>Single HTML file (inline CSS + JS)</li>
          <li>No external libraries/assets</li>
          <li>At least one real interaction</li>
          <li>Self-contained so preview works</li>
        </ul>`;
    }

    if (btnIhCopy && ihPrompt) {
      btnIhCopy.addEventListener("click", async () => {
        const ok = await copyToClipboard(ihPrompt.value);
        if (!ok) alert("Copy failed. You can manually select and copy.");
      });
    }

    if (btnIhToPreview) {
      btnIhToPreview.addEventListener("click", () => {
        setActivePanel("preview");
        protoTextarea?.focus();
      });
    }
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function bootShareImportIfPresent() {
    const shared = readShareHash();
    if (!shared || !shared.html) return;

    // Ensure we’re on preview panel
    setActivePanel("preview");

    if (protoTextarea) {
      protoTextarea.value = shared.html;
      saveDraftHtml(shared.html);
      setSavedStatus("Loaded from share link");
      // Auto-launch for delight (but still safe in sandbox)
      launchPreview();
    }
  }

  function boot() {
    // views = local only. Count once per load.
    bumpMetric("views");

    bindNav();
    setActivePanel(inferDefaultPanel());

    bindAutosave();
    bindPreview();
    bindShare();

    bindFeedback();
    renderFeedbackList();

    renderMetrics();
    bindMetrics();

    bindPromptBuilder();
    bindImportHelper();

    // If we arrived via share, load it
    bootShareImportIfPresent();
  }

  // Run after DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
