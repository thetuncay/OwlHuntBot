const $ = (id) => document.getElementById(id);

let catalog = [];
let overrides = {};
let filtered = [];
let currentIndex = 0;
let dirty = false;
let botMeta = { name: 'OwlHunt', avatarUrl: '/assets/owlhuntweb/07_developer.png' };

function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2600);
}

function entryPayload(entry) {
  if (entry.previewPayload) return entry.previewPayload;
  return DiscordPreview.legacySampleToPayload(entry.previewSample ?? entry.current);
}

function discordFrameHtml(payload, contentOverride) {
  const inner = DiscordPreview.renderPayload(payload, contentOverride);
  return `
    <div class="discord-msg">
      <img src="${botMeta.avatarUrl}" alt="" class="avatar" width="40" height="40" />
      <div class="discord-body">
        <div class="discord-head">
          <span class="bot-name">${botMeta.name}</span>
          <span class="bot-tag">UYG</span>
          <time>bugün 15:00</time>
        </div>
        <div class="discord-content">${inner}</div>
      </div>
    </div>`;
}

function formatRawOutput(entry) {
  const p = entryPayload(entry);
  const parts = [];
  if (p.content?.trim()) parts.push(p.content);
  for (const e of p.embeds ?? []) {
    const block = [];
    if (e.title) block.push(e.title);
    if (e.description) block.push(e.description);
    for (const f of e.fields ?? []) {
      block.push(`${f.name}\n${f.value}`);
    }
    if (e.footer?.text) block.push(`— ${e.footer.text}`);
    if (block.length) parts.push(block.join('\n'));
  }
  for (const a of p.attachments ?? []) {
    parts.push(`[ek: ${a.filename ?? a.url}]`);
  }
  if (parts.length) return parts.join('\n\n');
  return entry.current;
}

function renderPreviews(entry) {
  const payload = entryPayload(entry);
  $('previewCurrent').innerHTML = discordFrameHtml(payload);
  const rawEl = $('currentRaw');
  if (rawEl) rawEl.textContent = formatRawOutput(entry);

  const note = $('draftText').value.trim();
  const noteEl = $('notePreview');
  const noteRawEl = $('noteRaw');
  if (noteEl) {
    noteEl.innerHTML = note
      ? discordFrameHtml({ content: note })
      : '<p class="note-empty">Not yok — yazınca soldaki gibi Discord önizlemesi görünür.</p>';
  }
  if (noteRawEl) noteRawEl.textContent = note;
}

function applyFilters() {
  const q = ($('search').value || '').trim().toLowerCase();
  const cat = $('categoryFilter').value;
  const draftOnly = $('filterDraft').checked;

  filtered = catalog.filter((e) => {
    if (cat && e.category !== cat) return false;
    if (draftOnly && !overrides[e.id]?.trim()) return false;
    if (!q) return true;
    const hay = `${e.id} ${e.label} ${e.category}`.toLowerCase();
    return hay.includes(q);
  });

  if (currentIndex >= filtered.length) currentIndex = Math.max(0, filtered.length - 1);
  renderNav();
  renderEditor();
  updateStats();
}

function renderNav() {
  const nav = $('entryNav');
  nav.innerHTML = '';
  filtered.forEach((e, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-item' + (i === currentIndex ? ' active' : '') + (overrides[e.id] ? ' has-draft' : '');
    btn.innerHTML = `<span class="nav-cat">${e.category}</span>${e.label}`;
    btn.addEventListener('click', () => {
      saveCurrentDraft();
      currentIndex = i;
      applyFilters();
    });
    nav.appendChild(btn);
  });
  $('emptyState').classList.toggle('hidden', filtered.length > 0);
  $('editor').classList.toggle('hidden', filtered.length === 0);
}

function entryContext(entry) {
  if (entry.context) return entry.context;
  if (typeof resolveCopyContext === 'function') return resolveCopyContext(entry);
  return null;
}

function renderContext(entry) {
  const ctx = entryContext(entry);
  const statusEl = $('ctxStatus');
  const box = $('contextBox');
  if (!ctx || !box) {
    if (box) box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');

  box.classList.remove('ctx-live', 'ctx-config', 'ctx-disabled');
  if (ctx.status === 'config') {
    box.classList.add('ctx-config');
    statusEl.textContent = ctx.statusLabel || '⚠️ Config’te var — bot şu an bu metni göndermiyor';
  } else if (ctx.status === 'disabled') {
    box.classList.add('ctx-disabled');
    statusEl.textContent = ctx.statusLabel || '⏸ Kapalı — bot bu mesajı göndermiyor';
  } else {
    box.classList.add('ctx-live');
    statusEl.textContent = ctx.statusLabel || '✓ Bot canlıda bu çıktıyı gönderir';
  }

  $('ctxCommand').textContent = ctx.command || '—';
  $('ctxWhen').textContent = ctx.when || entry.trigger || '—';
  $('ctxPlace').textContent = ctx.where || '—';
  $('ctxHow').textContent = ctx.how || '—';
}

function renderEditor() {
  const entry = filtered[currentIndex];
  if (!entry) return;

  $('entryCategory').textContent = entry.category;
  $('entryLabel').textContent = entry.label;
  $('entryId').textContent = entry.id;
  $('entrySource').textContent = entry.sourceFile;

  renderContext(entry);

  $('draftText').value = overrides[entry.id] ?? '';
  renderPreviews(entry);
}

function saveCurrentDraft() {
  const entry = filtered[currentIndex];
  if (!entry) return;
  const val = $('draftText').value.trim();
  if (val) overrides[entry.id] = val;
  else delete overrides[entry.id];
}

function updateStats() {
  $('statTotal').textContent = `${catalog.length} çıktı`;
  const draftCount = Object.keys(overrides).length;
  $('statDraft').textContent = `${draftCount} not`;
}

async function loadCatalog() {
  const res = await fetch('/api/admin/copy/catalog');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  catalog = data.entries.map((e) => ({
    ...e,
    context: e.context ?? (typeof resolveCopyContext === 'function' ? resolveCopyContext(e) : undefined),
  }));
  overrides = { ...data.overrides };
  if (data.bot) botMeta = data.bot;

  const cats = [...new Set(catalog.map((e) => e.category))].sort();
  const sel = $('categoryFilter');
  for (const c of cats) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }

  applyFilters();
}

async function saveAll() {
  saveCurrentDraft();
  const res = await fetch('/api/admin/copy/overrides', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides }),
  });
  if (!res.ok) throw new Error(`Kayıt hatası ${res.status}`);
  const data = await res.json();
  overrides = { ...data.overrides };
  dirty = false;
  showToast(`Kaydedildi — ${data.count} not`);
  applyFilters();
}

$('btnSave')?.addEventListener('click', () => {
  saveAll().catch((e) => showToast(e.message));
});

$('btnExport')?.addEventListener('click', () => {
  window.location.href = '/api/admin/copy/export';
});

$('btnPrev')?.addEventListener('click', () => {
  if (currentIndex <= 0) return;
  saveCurrentDraft();
  currentIndex -= 1;
  applyFilters();
});

$('btnNext')?.addEventListener('click', () => {
  if (currentIndex >= filtered.length - 1) return;
  saveCurrentDraft();
  currentIndex += 1;
  applyFilters();
});

$('btnClearDraft')?.addEventListener('click', () => {
  const entry = filtered[currentIndex];
  if (!entry) return;
  delete overrides[entry.id];
  $('draftText').value = '';
  renderPreviews(entry);
  updateStats();
  document.querySelectorAll('.nav-item').forEach((el, i) => {
    if (i === currentIndex) el.classList.remove('has-draft');
  });
});

$('btnCopyId')?.addEventListener('click', () => {
  const entry = filtered[currentIndex];
  if (entry) navigator.clipboard?.writeText(entry.id);
});

$('search')?.addEventListener('input', applyFilters);
$('categoryFilter')?.addEventListener('change', applyFilters);
$('filterDraft')?.addEventListener('change', applyFilters);

$('draftText')?.addEventListener('input', () => {
  dirty = true;
  const entry = filtered[currentIndex];
  if (!entry) return;
  const val = $('draftText').value.trim();
  if (val) overrides[entry.id] = val;
  else delete overrides[entry.id];
  updateStats();
  renderPreviews(entry);
  document.querySelectorAll('.nav-item').forEach((el, i) => {
    if (i === currentIndex) el.classList.toggle('has-draft', !!overrides[entry.id]);
  });
});

window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

loadCatalog().catch((err) => {
  $('emptyState').classList.remove('hidden');
  $('emptyState').innerHTML = `<p>Yüklenemedi: ${err.message}</p><p>Admin girişi gerekli (/admin).</p>`;
});
