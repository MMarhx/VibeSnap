/* VibeSnap — app.js
   Local-first prototype runner with prompt builder + import helper.
   No analytics, no external calls. */

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const qs = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const safeText = (s) => (s == null ? '' : String(s));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // ---------- Tabs ----------
  const nav = {
    preview: $('navPreview'),
    prompt: $('navPrompt'),
    import: $('navImport'),
  };
  const panels = {
    preview: $('panelPreview'),
    prompt: $('panelPrompt'),
    import: $('panelImport'),
  };

  function setActiveTab(key) {
    const keys = ['preview','prompt','import'];
    keys.forEach(k => {
      const btn = nav[k];
      const panel = panels[k];
      if (btn) btn.classList.toggle('is-active', k === key);
      if (btn) btn.setAttribute('aria-selected', k === key ? 'true' : 'false');
      if (panel) panel.hidden = (k !== key);
    });
    // Update hash for shareable navigation only (not prototype content)
    try { history.replaceState(null, '', `#${key}`); } catch {}
  }

  function initTabs() {
    const clickMap = [
      ['preview', nav.preview],
      ['prompt', nav.prompt],
      ['import', nav.import],
    ];
    clickMap.forEach(([k, btn]) => {
      if (!btn) return;
      btn.addEventListener('click', () => setActiveTab(k));
    });

    // initial
    const hash = (location.hash || '').replace('#','').trim().toLowerCase();
    if (hash === 'prompt' || hash === 'import' || hash === 'preview') setActiveTab(hash);
    else setActiveTab('preview');
  }

  // ---------- Preview runner ----------
  const codeInput = $('codeInput');
  const previewFrame = $('previewFrame');
  const btnRun = $('btnRun');
  const btnSample = $('btnSample');
  const btnSave = $('btnSave');
  const saveStatus = $('saveStatus');
  const btnOpenFeedback = $('btnOpenFeedback');
  const btnCreateShare = $('btnCreateShare');
  const shareLink = $('shareLink');
  const btnCopyShare = $('btnCopyShare');
  const shareText = $('shareText');
  const btnCopyShareText = $('btnCopyShareText');

  const LS_KEY = 'vibesnap:last_code_v1';

  function setSaveStatus(msg) {
    if (!saveStatus) return;
    saveStatus.textContent = msg;
    saveStatus.classList.add('is-live');
    window.setTimeout(() => saveStatus.classList.remove('is-live'), 800);
  }

  function getCurrentCode() {
    return safeText(codeInput ? codeInput.value : '');
  }

  function setCurrentCode(html) {
    if (!codeInput) return;
    codeInput.value = safeText(html);
  }

  function runInFrame(html) {
    if (!previewFrame) return;
    // Use srcdoc for safety; frame should be sandboxed in HTML.
    previewFrame.srcdoc = safeText(html);
  }

  function sampleHTML() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>VibeSnap sample</title>
  <style>
    body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:24px;background:#0b0f14;color:#e8eef7}
    .card{max-width:720px;margin:0 auto;padding:18px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(255,255,255,.06)}
    button{padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#e8eef7;cursor:pointer}
    button:hover{background:rgba(255,255,255,.12)}
  </style>
</head>
<body>
  <div class="card">
    <h1 style="margin:0 0 8px 0;font-size:20px">Sample prototype</h1>
    <p style="margin:0 0 12px 0;opacity:.9">Edit this HTML, then hit <b>Run</b> in VibeSnap.</p>
    <button id="b">Click me</button>
    <p id="out" style="margin:12px 0 0 0;opacity:.9"></p>
  </div>
  <script>
    const b=document.getElementById('b');
    const out=document.getElementById('out');
    let n=0;
    b.addEventListener('click',()=>{ n++; out.textContent='Clicks: '+n; });
  </script>
</body>
</html>`;
  }

  // ---------- Share via URL fragment (client-only) ----------
  // Not meant for large prototypes. Keeps it lightweight + private.
  function encodeForHash(s) {
    // compress-ish using URI-safe base64
    const utf8 = new TextEncoder().encode(s);
    let bin = '';
    utf8.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decodeFromHash(s) {
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const b64 = (s + pad).replace(/-/g,'+').replace(/_/g,'/');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function buildShareUrl(html) {
    const max = 120000; // keep URLs sane
    if (html.length > max) return null;
    const payload = encodeForHash(html);
    const base = `${location.origin}${location.pathname}`;
    return `${base}#p=${payload}`;
  }

  function tryLoadSharedPrototype() {
    const h = location.hash || '';
    const m = h.match(/#p=([A-Za-z0-9\-_]+)/);
    if (!m) return false;
    try {
      const html = decodeFromHash(m[1]);
      if (html && html.includes('<')) {
        setCurrentCode(html);
        runInFrame(html);
        return true;
      }
    } catch {}
    return false;
  }

  // ---------- Feedback (local only) ----------
  const modal = $('modalFeedback');
  const feedbackText = $('feedbackText');
  const feedbackList = $('feedbackList');
  const feedbackSaveNote = $('feedbackSaveNote');
  const btnSubmitFeedback = $('btnSubmitFeedback');
  const btnClearFeedback = $('btnClearFeedback');
  const btnExportFeedback = $('btnExportFeedback');

  const FEED_KEY = 'vibesnap:feedback_v1';
  function readFeedback() {
    try { return JSON.parse(localStorage.getItem(FEED_KEY) || '[]'); } catch { return []; }
  }
  function writeFeedback(items) {
    try { localStorage.setItem(FEED_KEY, JSON.stringify(items)); } catch {}
  }
  function renderFeedback() {
    if (!feedbackList) return;
    const items = readFeedback();
    feedbackList.innerHTML = '';
    if (!items.length) {
      feedbackList.innerHTML = `<div class="empty">No feedback yet.</div>`;
      return;
    }
    items.slice().reverse().forEach(it => {
      const div = document.createElement('div');
      div.className = 'fb';
      div.innerHTML = `
        <div class="fb-meta">${new Date(it.ts).toLocaleString()}</div>
        <div class="fb-text"></div>
      `;
      div.querySelector('.fb-text').textContent = it.text;
      feedbackList.appendChild(div);
    });
  }
  function openModal() {
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden','false');
    renderFeedback();
    if (feedbackText) feedbackText.focus();
  }
  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden','true');
  }

  // ---------- Import helper ----------
  const importDrop = $('importDrop');
  const fileInline = $('fileInline');
  const fileHtml = $('fileHtml');
  const fileCss = $('fileCss');
  const fileJs = $('fileJs');
  const stateInline = $('stateInline');
  const stateHtml = $('stateHtml');
  const stateCss = $('stateCss');
  const stateJs = $('stateJs');
  const importNotice = $('importNotice');
  const assembledOut = $('assembledOut');
  const btnAssemble = $('btnAssemble');
  const btnRunImport = $('btnRunImport');
  const rowInline = $('rowInline');

  const fileState = {
    inline: null,
    html: null,
    css: null,
    js: null,
  };

  function setBadge(el, ok, labelOk, labelMissing) {
    if (!el) return;
    el.classList.toggle('ok', !!ok);
    el.classList.toggle('missing', !ok);
    el.textContent = ok ? labelOk : labelMissing;
  }

  function toast(msg) {
    if (!importNotice) return;
    importNotice.textContent = msg;
    importNotice.classList.add('show');
    window.setTimeout(() => importNotice.classList.remove('show'), 1600);
  }

  async function readFileText(file) {
    return await file.text();
  }

  function updateImportUI() {
    setBadge(stateInline, !!fileState.inline, 'Inline HTML ✓', 'Inline HTML');
    setBadge(stateHtml, !!fileState.html, 'HTML ✓', 'HTML');
    setBadge(stateCss, !!fileState.css, 'CSS ✓', 'CSS');
    setBadge(stateJs, !!fileState.js, 'JS ✓', 'JS');

    // If inline provided, treat split as optional.
    const canAssemble = !!fileState.inline || !!fileState.html;
    if (btnAssemble) btnAssemble.disabled = !canAssemble;
    if (btnRunImport) btnRunImport.disabled = !canAssemble;

    if (rowInline) rowInline.classList.toggle('has-file', !!fileState.inline);
  }

  async function handleFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;

    // If user drops one HTML file, prefer inline.
    for (const f of list) {
      const name = f.name.toLowerCase();
      if (name.endsWith('.html') || name.endsWith('.htm')) {
        // If there are multiple files, treat as split if we already have HTML and not inline
        // but simplest: if only one html and no css/js => inline
        if (list.length === 1 || (!list.some(x => x.name.toLowerCase().endsWith('.css') || x.name.toLowerCase().endsWith('.js')))) {
          fileState.inline = await readFileText(f);
          toast('HTML file uploaded');
          continue;
        } else {
          fileState.html = await readFileText(f);
          toast('HTML file uploaded');
          continue;
        }
      }
      if (name.endsWith('.css')) { fileState.css = await readFileText(f); toast('CSS file uploaded'); continue; }
      if (name.endsWith('.js')) { fileState.js = await readFileText(f); toast('JS file uploaded'); continue; }
      // ignore others
    }
    updateImportUI();
  }

  function assembleFromSplit(html, css, js) {
    let out = safeText(html);
    const hasHead = /<\/head\s*>/i.test(out);
    const hasBodyClose = /<\/body\s*>/i.test(out);

    const styleTag = css ? `\n<style>\n${css}\n</style>\n` : '';
    const scriptTag = js ? `\n<script>\n${js}\n<\/script>\n` : '';

    if (styleTag) {
      if (hasHead) out = out.replace(/<\/head\s*>/i, styleTag + '</head>');
      else out = out.replace(/<html[^>]*>/i, m => m + '\n<head>' + styleTag + '</head>\n');
    }
    if (scriptTag) {
      if (hasBodyClose) out = out.replace(/<\/body\s*>/i, scriptTag + '</body>');
      else out = out + scriptTag;
    }
    return out;
  }

  function assemble() {
    const inline = fileState.inline;
    const html = fileState.html;
    const css = fileState.css;
    const js = fileState.js;

    let result = '';
    if (inline) {
      result = inline;
    } else if (html) {
      result = assembleFromSplit(html, css, js);
    } else {
      result = '';
    }

    if (assembledOut) assembledOut.value = result;
    return result;
  }

  // ---------- Prompt builder ----------
  const pbIdea = $('pbIdea');
  const pbGoal = $('pbGoal');
  const pbScreens = $('pbScreens');
  const pbInteractions = $('pbInteractions');
  const pbStyle = $('pbStyle');
  const pbNotes = $('pbNotes');
  const promptOut = $('promptOut');
  const btnCopyPrompt = $('btnCopyPrompt');

  function buildPrompt() {
    const idea = safeText(pbIdea && pbIdea.value).trim();
    const goal = safeText(pbGoal && pbGoal.value).trim();
    const screens = safeText(pbScreens && pbScreens.value).trim();
    const interactions = safeText(pbInteractions && pbInteractions.value).trim();
    const style = safeText(pbStyle && pbStyle.value).trim();
    const notes = safeText(pbNotes && pbNotes.value).trim();

    const lines = [];
    lines.push("Make a single self-contained HTML file that includes:");
    lines.push("- Inline CSS in a <style> tag");
    lines.push("- Inline JavaScript in a <script> tag");
    lines.push("- No external libraries");
    lines.push("- No external assets");
    lines.push("- No build steps");
    lines.push("- Works by opening the HTML file directly");
    lines.push("");
    if (idea) lines.push(`App concept: ${idea}`);
    if (goal) lines.push(`Primary goal: ${goal}`);
    if (screens) lines.push(`Key screens: ${screens}`);
    if (interactions) lines.push(`Must-have interaction: ${interactions}`);
    if (style) lines.push(`Design / tone: ${style}`);
    if (notes) lines.push(`Notes / constraints: ${notes}`);
    lines.push("");
    lines.push("Output ONLY the full HTML code. Do not include explanations.");

    return lines.join('\n');
  }

  function updatePromptOut() {
    if (!promptOut) return;
    promptOut.value = buildPrompt();
  }

  async function copyToClipboard(text) {
    const t = safeText(text);
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch {
      // fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        return true;
      } catch {
        return false;
      }
    }
  }

  // ---------- Wire up ----------
  function initPreview() {
    if (btnSample) btnSample.addEventListener('click', () => {
      setCurrentCode(sampleHTML());
      setSaveStatus('Sample loaded');
      runInFrame(getCurrentCode());
    });

    if (btnRun) btnRun.addEventListener('click', () => runInFrame(getCurrentCode()));

    if (btnSave) btnSave.addEventListener('click', () => {
      try {
        localStorage.setItem(LS_KEY, getCurrentCode());
        setSaveStatus('Saved locally');
      } catch {
        setSaveStatus('Save failed');
      }
    });

    if (btnCreateShare) btnCreateShare.addEventListener('click', async () => {
      const html = getCurrentCode();
      const url = buildShareUrl(html);
      if (!url) {
        setSaveStatus('Prototype too large for URL share');
        return;
      }
      if (shareLink) shareLink.value = url;
      setSaveStatus('Share link created');
    });

    if (btnCopyShare) btnCopyShare.addEventListener('click', async () => {
      if (!shareLink) return;
      const ok = await copyToClipboard(shareLink.value);
      setSaveStatus(ok ? 'Link copied' : 'Copy failed');
    });

    if (btnCopyShareText) btnCopyShareText.addEventListener('click', async () => {
      if (!shareText) return;
      const ok = await copyToClipboard(shareText.value);
      setSaveStatus(ok ? 'Copy copied' : 'Copy failed');
    });

    if (btnOpenFeedback) btnOpenFeedback.addEventListener('click', openModal);

    // restore last saved unless a share loaded it
    const loadedShare = tryLoadSharedPrototype();
    if (!loadedShare) {
      try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved && saved.includes('<')) setCurrentCode(saved);
      } catch {}
    }
    if (codeInput && !codeInput.value.trim()) setCurrentCode(sampleHTML());
    runInFrame(getCurrentCode());
  }

  function initFeedback() {
    if (!modal) return;

    // close on overlay click / escape
    modal.addEventListener('click', (e) => {
      const target = e.target;
      if (target && target.getAttribute && target.getAttribute('data-close') === 'true') closeModal();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });

    if (btnSubmitFeedback) btnSubmitFeedback.addEventListener('click', () => {
      const text = safeText(feedbackText && feedbackText.value).trim();
      if (!text) return;
      const items = readFeedback();
      items.push({ ts: Date.now(), text });
      writeFeedback(items);
      if (feedbackText) feedbackText.value = '';
      renderFeedback();
      if (feedbackSaveNote) {
        feedbackSaveNote.textContent = 'Saved locally';
        window.setTimeout(() => feedbackSaveNote.textContent = '', 1200);
      }
    });

    if (btnClearFeedback) btnClearFeedback.addEventListener('click', () => {
      writeFeedback([]);
      renderFeedback();
    });

    if (btnExportFeedback) btnExportFeedback.addEventListener('click', async () => {
      const items = readFeedback();
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vibesnap-feedback.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  function initImport() {
    updateImportUI();

    // file pickers
    if (fileInline) fileInline.addEventListener('change', () => handleFiles(fileInline.files));
    if (fileHtml) fileHtml.addEventListener('change', () => handleFiles(fileHtml.files));
    if (fileCss) fileCss.addEventListener('change', () => handleFiles(fileCss.files));
    if (fileJs) fileJs.addEventListener('change', () => handleFiles(fileJs.files));

    // dropzone
    if (importDrop) {
      const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
      ['dragenter','dragover','dragleave','drop'].forEach(evt => importDrop.addEventListener(evt, prevent));
      importDrop.addEventListener('dragenter', () => importDrop.classList.add('is-drag'));
      importDrop.addEventListener('dragleave', () => importDrop.classList.remove('is-drag'));
      importDrop.addEventListener('drop', (e) => {
        importDrop.classList.remove('is-drag');
        handleFiles(e.dataTransfer && e.dataTransfer.files);
      });
    }

    if (btnAssemble) btnAssemble.addEventListener('click', () => {
      const html = assemble();
      if (html) toast('Assembled');
      else toast('Add an HTML file to assemble');
    });

    if (btnRunImport) btnRunImport.addEventListener('click', () => {
      const html = assemble();
      if (!html) { toast('Add an HTML file to run'); return; }
      // Push to preview tab for a smoother flow
      setCurrentCode(html);
      runInFrame(html);
      setActiveTab('preview');
      setSaveStatus('Imported into preview');
    });
  }

  function initPrompt() {
    // live update
    [pbIdea,pbGoal,pbScreens,pbInteractions,pbStyle,pbNotes].forEach(el => {
      if (!el) return;
      el.addEventListener('input', updatePromptOut);
    });
    updatePromptOut();

    if (btnCopyPrompt) btnCopyPrompt.addEventListener('click', async () => {
      const ok = await copyToClipboard(promptOut ? promptOut.value : '');
      if (btnCopyPrompt) btnCopyPrompt.textContent = ok ? 'Copied' : 'Copy failed';
      window.setTimeout(() => { if (btnCopyPrompt) btnCopyPrompt.textContent = 'Copy prompt'; }, 900);
    });
  }

  // ---------- Boot ----------
  function boot() {
    initTabs();
    initPreview();
    initPrompt();
    initImport();
    initFeedback();

    // defensively hide panels not wired (if any)
    Object.values(panels).forEach(p => { if (p) p.hidden = true; });
    // setActiveTab will unhide the right one
    const hash = (location.hash || '').replace('#','').trim().toLowerCase();
    if (hash === 'prompt' || hash === 'import' || hash === 'preview') setActiveTab(hash);
    else setActiveTab('preview');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
