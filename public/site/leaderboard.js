const LB_REFRESH_MS = 60_000;

let activeCat = 'power';
let loadSeq = 0;

const tabs = document.getElementById('lbTabs');
const list = document.getElementById('lbList');
const meta = document.getElementById('lbMeta');
const loading = document.getElementById('lbLoading');
const errEl = document.getElementById('lbError');

function medal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

function formatMeta(data) {
  let base = `${data.scopeLabel} · Sezon ${data.seasonId}`;
  if (data.viewerRank > 0) {
    base += ` · Senin sıran: #${data.viewerRank}`;
  } else if (data.viewerId) {
    base += ' · Henüz sıralamada değilsin';
  }
  base += ' · Tam liste Discord\'da: /lb';
  if (!data.updatedAt) return base;
  const when = new Date(data.updatedAt).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${base} · Güncellendi ${when}`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderEntry(e) {
  const li = document.createElement('li');
  const classes = ['lb-item'];
  if (e.rank <= 3) classes.push('lb-item-top');
  if (e.isViewer) classes.push('lb-item-you');
  li.className = classes.join(' ');

  const profileUrl = `/player/${encodeURIComponent(e.playerId)}`;
  li.innerHTML = `
    <span class="lb-rank">${medal(e.rank)}</span>
    <a class="lb-name lb-name-link" href="${profileUrl}">${escapeHtml(e.displayName)}</a>
    <span class="lb-score">${Number(e.score).toLocaleString('tr-TR')}</span>
    <span class="lb-detail">${escapeHtml(e.detail)}</span>
  `;
  return li;
}

async function loadLb(category, { silent = false } = {}) {
  const seq = ++loadSeq;
  activeCat = category;

  if (!silent) {
    if (errEl) errEl.classList.add('hidden');
    if (list) list.classList.add('hidden');
    if (loading) loading.classList.remove('hidden');
    if (meta) meta.textContent = 'Yükleniyor…';
  }

  document.querySelectorAll('.lb-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.cat === category);
  });

  try {
    const url = `/api/public/leaderboard?category=${encodeURIComponent(category)}&_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store', credentials: 'include' });
    if (!res.ok) throw new Error('Sıralama yüklenemedi');
    const data = await res.json();
    if (seq !== loadSeq) return;

    if (meta) meta.textContent = formatMeta(data);

    if (list) {
      list.innerHTML = '';
      if (!data.entries?.length && !data.viewerEntry) {
        list.innerHTML =
          '<li class="lb-empty-item"><img src="/assets/owlhuntweb/04_sleeping.png" width="64" height="64" alt="" /><span>Bu sezonda henüz kimse yok. Discord\'da hunt at, listeye gir.</span></li>';
      } else {
        for (const e of data.entries ?? []) {
          list.appendChild(renderEntry(e));
        }
        if (data.viewerEntry) {
          const sep = document.createElement('li');
          sep.className = 'lb-item lb-item-sep';
          sep.innerHTML = '<span class="lb-sep-label">Senin sıran</span>';
          list.appendChild(sep);
          list.appendChild(renderEntry(data.viewerEntry));
        }
      }
      list.classList.remove('hidden');
    }
  } catch (err) {
    if (seq !== loadSeq) return;
    if (!silent && errEl) {
      errEl.textContent = err.message || String(err);
      errEl.classList.remove('hidden');
    }
  } finally {
    if (seq === loadSeq && !silent && loading) loading.classList.add('hidden');
  }
}

if (tabs) {
  tabs.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-cat]');
    if (!btn) return;
    loadLb(btn.dataset.cat);
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadLb(activeCat, { silent: true });
});

window.addEventListener('pageshow', () => {
  loadLb(activeCat, { silent: true });
});

window.setInterval(() => {
  if (document.visibilityState === 'visible') loadLb(activeCat, { silent: true });
}, LB_REFRESH_MS);

const initCat = new URLSearchParams(location.search).get('cat');
const validCats = ['power', 'hunt', 'arena', 'wealth'];
loadLb(validCats.includes(initCat) ? initCat : activeCat);
