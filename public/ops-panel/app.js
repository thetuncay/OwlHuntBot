const $ = (id) => document.getElementById(id);

let guildData = [];
let healthData = null;
let refreshTimer = null;
let feedbackOpen = false;
let anticheatOpen = false;
let feedbackState = {
  submissions: [],
  questions: [],
  campaign: null,
  index: 0,
  tab: 'individual',
};

function statusClass(status) {
  if (status === 'healthy') return 'ok';
  if (status === 'warning') return 'warn';
  return 'crit';
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('tr-TR');
}

function copyText(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function renderStats(health, guilds) {
  $('statStatus').textContent = health?.status ?? '—';
  $('statStatus').className = 'value ' + statusClass(health?.status ?? '');

  const r = health?.readiness;
  $('statReadiness').textContent = r ? `${r.level} (${r.score})` : '—';
  $('statReadiness').className = 'value ' + (r?.level === 'SAFE' ? 'ok' : r?.level === 'CAUTION' ? 'warn' : 'crit');

  const g = health?.checks?.guilds;
  $('statGuilds').textContent = g ? `${g.total} / ${g.maxGuilds}` : `${guilds.total} / ${guilds.maxGuilds}`;

  const tr = health?.traffic ?? health?.snapshot?.traffic;
  $('statCommands').textContent = tr?.total24h != null ? String(tr.total24h) : '—';

  const lat = health?.latency ?? health?.snapshot?.latency;
  $('statLatency').textContent = lat?.p95Ms != null ? `${lat.p95Ms} ms` : '—';

  const redis = health?.checks?.redis;
  $('statRedis').textContent = redis?.memoryUsedMb != null ? `${redis.memoryUsedMb} MB` : '—';
}

function sortGuilds(list, key) {
  const copy = [...list];
  switch (key) {
    case 'commands24h':
      return copy.sort((a, b) => b.commands24h - a.commands24h);
    case 'commandsHour':
      return copy.sort((a, b) => b.commandsHour - a.commandsHour);
    case 'joined':
      return copy.sort((a, b) => b.joinedAt - a.joinedAt);
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    default:
      return copy.sort((a, b) => b.memberCount - a.memberCount);
  }
}

function filterGuilds(list, q) {
  if (!q.trim()) return list;
  const lower = q.trim().toLowerCase();
  return list.filter(
    (g) => g.name.toLowerCase().includes(lower) || g.id.includes(lower) || g.ownerId.includes(lower),
  );
}

function renderGuilds(guilds) {
  const grid = $('guildGrid');
  const empty = $('empty');
  const q = $('search').value;
  const sortKey = $('sortBy').value;
  const filtered = sortGuilds(filterGuilds(guilds, q), sortKey);

  grid.innerHTML = '';
  if (filtered.length === 0) {
    empty.classList.toggle('hidden', guilds.length > 0);
    return;
  }
  empty.classList.add('hidden');

  for (const g of filtered) {
    const card = document.createElement('article');
    card.className = 'guild-card';

    const iconHtml = g.iconUrl
      ? `<img class="guild-icon" src="${g.iconUrl}" alt="" loading="lazy" />`
      : `<div class="guild-icon placeholder">🏠</div>`;

    const boost =
      g.premiumTier > 0
        ? `<span class="badge boost">Boost ${g.premiumTier}</span>`
        : `<span class="badge">Boost yok</span>`;

    card.innerHTML = `
      <div class="guild-head">
        ${iconHtml}
        <div class="guild-title">
          <h3 title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</h3>
          <div class="guild-id" title="Kopyala">${g.id}</div>
        </div>
      </div>
      <dl class="guild-meta">
        <dt>Üyeler</dt><dd>${g.memberCount.toLocaleString('tr-TR')}</dd>
        <dt>Komut (24s)</dt><dd>${g.commands24h}</dd>
        <dt>Komut (saat)</dt><dd>${g.commandsHour}</dd>
        <dt>Shard</dt><dd>#${g.shardId}</dd>
        <dt>Sahip ID</dt><dd title="Kopyala" class="guild-id">${g.ownerId}</dd>
        <dt>Katılım</dt><dd>${formatDate(g.joinedAt)}</dd>
      </dl>
      <div>${boost}</div>
    `;

    card.querySelectorAll('.guild-id').forEach((el) => {
      el.addEventListener('click', () => copyText(el.textContent.trim()));
    });
    grid.appendChild(card);
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function load() {
  $('error').classList.add('hidden');
  try {
    const [healthRes, guildsRes] = await Promise.all([
      fetch('/api/health'),
      fetch('/api/guilds'),
    ]);
    if (!guildsRes.ok) throw new Error(`Guilds HTTP ${guildsRes.status}`);

    healthData = await healthRes.json().catch(() => null);
    if (!healthData) throw new Error(`Health HTTP ${healthRes.status} (yanit okunamadi)`);

    const guilds = await guildsRes.json();
    guildData = guilds.guilds ?? [];

    renderStats(healthData, guilds);
    renderGuilds(guildData);
    $('healthJson').textContent = JSON.stringify(healthData, null, 2);
    $('lastUpdate').textContent = `Son güncelleme: ${new Date().toLocaleString('tr-TR')}`;

    if (!healthRes.ok) {
      const reasons = (healthData.reasons ?? []).join('; ') || healthData.status;
      $('error').textContent = `Sistem uyari/kritik (HTTP ${healthRes.status}): ${reasons}`;
      $('error').classList.remove('hidden');
    } else {
      $('error').classList.add('hidden');
    }
  } catch (err) {
    $('error').textContent = err.message || String(err);
    $('error').classList.remove('hidden');
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  if ($('autoRefresh').checked) {
    refreshTimer = setInterval(load, 10_000);
  }
}

$('btnRefresh').addEventListener('click', load);
$('autoRefresh').addEventListener('change', scheduleRefresh);
$('search').addEventListener('input', () => renderGuilds(guildData));
$('sortBy').addEventListener('change', () => renderGuilds(guildData));

load();
scheduleRefresh();

function optionLabel(q, value) {
  const opt = q.options?.find((o) => o.value === value);
  return opt?.label ?? value;
}

function formatFeedbackAnswer(q, val) {
  if (val === undefined || val === null || val === '') {
    return { kind: 'empty', html: '<span class="fb-answer-empty">Yanıt yok</span>' };
  }
  switch (q.type) {
    case 'single_choice':
      return {
        kind: 'choice',
        html: `<div class="fb-choice-answer fb-choice-selected"><span class="fb-check">✓</span> ${escapeHtml(optionLabel(q, val))}</div>`,
      };
    case 'nps_slider':
      return {
        kind: 'nps',
        html: `<div class="fb-nps-answer"><strong>${escapeHtml(String(val))}</strong> <span class="fb-muted">/ 10</span></div>`,
      };
    case 'long_text':
    case 'short_text':
      return {
        kind: 'text',
        html: `<div class="fb-text-answer">${escapeHtml(String(val))}</div>`,
      };
    case 'likert_with_text': {
      const likert = val?.likert;
      const text = val?.text?.trim?.() ?? '';
      let html = `<div class="fb-likert-answer"><span class="fb-likert-score">${escapeHtml(String(likert ?? '—'))}</span><span class="fb-muted"> / 5</span></div>`;
      if (text) html += `<div class="fb-text-answer fb-text-sub">${escapeHtml(text)}</div>`;
      return { kind: 'likert', html };
    }
    case 'choice_with_text': {
      const choice = val?.choice;
      const text = val?.text?.trim?.() ?? '';
      let html = `<div class="fb-choice-answer fb-choice-selected"><span class="fb-check">✓</span> ${escapeHtml(optionLabel(q, choice))}</div>`;
      if (text) html += `<div class="fb-text-answer fb-text-sub">${escapeHtml(text)}</div>`;
      return { kind: 'choice', html };
    }
    case 'text_with_images': {
      const text = val?.text?.trim?.() ?? '';
      const ids = val?.attachmentIds ?? [];
      let html = '';
      if (text) html += `<div class="fb-text-answer">${escapeHtml(text)}</div>`;
      if (ids.length) {
        html += `<div class="fb-images">${ids.map((id) => `<a href="/api/admin/feedback/attachment/${encodeURIComponent(id)}" target="_blank" rel="noopener"><img src="/api/admin/feedback/attachment/${encodeURIComponent(id)}" alt="Ek" loading="lazy" /></a>`).join('')}</div>`;
      }
      if (!html) html = '<span class="fb-answer-empty">Yanıt yok</span>';
      return { kind: 'media', html };
    }
    default:
      return { kind: 'raw', html: `<div class="fb-text-answer">${escapeHtml(JSON.stringify(val))}</div>` };
  }
}

function renderFeedbackQuestionCards(submission) {
  const answers = submission?.answers ?? {};
  let lastSection = '';
  const cards = [];

  for (const q of feedbackState.questions) {
    if (q.sectionTitle && q.sectionTitle !== lastSection) {
      lastSection = q.sectionTitle;
      cards.push(`<div class="fb-section-label">${escapeHtml(q.sectionTitle)}</div>`);
    }
    const formatted = formatFeedbackAnswer(q, answers[q.id]);
    const req = q.required ? '<span class="fb-required">*</span>' : '';
    cards.push(`
      <article class="fb-card fb-question-card">
        <h3 class="fb-q-title">${escapeHtml(q.label)}${req}</h3>
        ${q.hint ? `<p class="fb-q-hint">${escapeHtml(q.hint)}</p>` : ''}
        <div class="fb-answer">${formatted.html}</div>
      </article>
    `);
  }
  return cards.join('');
}

function renderFeedbackIndividual() {
  const content = $('fbContent');
  const nav = $('fbIndividualNav');
  const subs = feedbackState.submissions;
  nav?.classList.toggle('hidden', subs.length === 0);

  if (!content) return;
  if (subs.length === 0) {
    content.innerHTML = '<div class="fb-empty-state"><p>Henüz anket cevabı yok.</p></div>';
    return;
  }

  const idx = Math.max(0, Math.min(feedbackState.index, subs.length - 1));
  feedbackState.index = idx;
  const sub = subs[idx];
  const submitted = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('tr-TR') : '—';
  const reward = sub.rewardGranted
    ? '<span class="fb-badge fb-badge-ok">Ödül verildi</span>'
    : '<span class="fb-badge fb-badge-pending">Ödül bekliyor</span>';

  content.innerHTML = `
    <article class="fb-card fb-header-card">
      <div class="fb-header-accent"></div>
      <p class="fb-header-meta">Yanıtlar salt okunur · ${escapeHtml(submitted)}</p>
      <h2 class="fb-form-title">${escapeHtml(feedbackState.campaign?.title ?? 'Feedback anketi')}</h2>
      ${feedbackState.campaign?.description ? `<p class="fb-form-desc">${escapeHtml(feedbackState.campaign.description)}</p>` : ''}
      <dl class="fb-respondent">
        <div><dt>Discord ID</dt><dd><code>${escapeHtml(sub.userId)}</code></dd></div>
        <div><dt>Durum</dt><dd>${reward}</dd></div>
      </dl>
    </article>
    ${renderFeedbackQuestionCards(sub)}
  `;

  const pagerInput = $('fbPagerInput');
  const pagerTotal = $('fbPagerTotal');
  if (pagerInput) {
    pagerInput.value = String(idx + 1);
    pagerInput.max = String(subs.length);
  }
  if (pagerTotal) pagerTotal.textContent = `/ ${subs.length}`;
  $('fbPrev') && ($('fbPrev').disabled = idx <= 0);
  $('fbNext') && ($('fbNext').disabled = idx >= subs.length - 1);
}

function renderFeedbackSummary() {
  const content = $('fbContent');
  if (!content) return;
  const subs = feedbackState.submissions;
  if (subs.length === 0) {
    content.innerHTML = '<div class="fb-empty-state"><p>Henüz anket cevabı yok.</p></div>';
    return;
  }

  const choiceCounts = (qId) => {
    const q = feedbackState.questions.find((x) => x.id === qId);
    const counts = new Map();
    for (const s of subs) {
      const v = s.answers?.[qId];
      const key = typeof v === 'string' ? v : JSON.stringify(v);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return { q, counts };
  };

  const npsVals = subs.map((s) => Number(s.answers?.nps)).filter((n) => Number.isFinite(n));
  const npsAvg = npsVals.length ? (npsVals.reduce((a, b) => a + b, 0) / npsVals.length).toFixed(1) : '—';

  let html = `
    <article class="fb-card fb-header-card">
      <div class="fb-header-accent"></div>
      <h2 class="fb-form-title">${escapeHtml(feedbackState.campaign?.title ?? 'Feedback anketi')}</h2>
      <p class="fb-form-desc">${subs.length} yanıt · ortalama NPS: <strong>${escapeHtml(String(npsAvg))}</strong></p>
    </article>
  `;

  for (const q of feedbackState.questions) {
    if (q.type !== 'single_choice' && q.type !== 'choice_with_text') continue;
    const { counts } = choiceCounts(q.id);
    const total = subs.length;
    const bars = (q.options ?? []).map((opt) => {
      let count = 0;
      for (const s of subs) {
        const v = s.answers?.[q.id];
        const picked = typeof v === 'object' && v?.choice ? v.choice : v;
        if (picked === opt.value) count++;
      }
      const pct = total ? Math.round((count / total) * 100) : 0;
      return `
        <div class="fb-summary-row">
          <span class="fb-summary-label">${escapeHtml(opt.label)}</span>
          <div class="fb-summary-bar"><span style="width:${pct}%"></span></div>
          <span class="fb-summary-count">${count}</span>
        </div>
      `;
    }).join('');

    html += `
      <article class="fb-card fb-question-card">
        <h3 class="fb-q-title">${escapeHtml(q.label)}</h3>
        <div class="fb-summary-chart">${bars}</div>
      </article>
    `;
  }

  content.innerHTML = html;
}

function renderFeedbackView() {
  $('fbResponseCount').textContent = `${feedbackState.submissions.length} yanıt`;
  $('fbIndividualNav')?.classList.toggle('hidden', feedbackState.tab !== 'individual');
  if (feedbackState.tab === 'summary') renderFeedbackSummary();
  else renderFeedbackIndividual();
}

function setFeedbackTab(tab) {
  feedbackState.tab = tab;
  document.querySelectorAll('.fb-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.fbTab === tab);
  });
  renderFeedbackView();
}

function showFeedbackShell(show) {
  feedbackOpen = show;
  $('feedbackView')?.classList.toggle('hidden', !show);
  document.querySelector('.main')?.classList.toggle('hidden', show);
  document.querySelector('.sidebar')?.classList.toggle('hidden', show);
  $('statsRow')?.classList.toggle('hidden', show);
  $('btnFeedback')?.classList.toggle('active', show);
}

async function loadFeedback() {
  showFeedbackShell(true);
  const content = $('fbContent');
  if (content) content.innerHTML = '<div class="fb-empty-state"><p>Yükleniyor…</p></div>';

  try {
    const res = await fetch('/api/admin/feedback/submissions', { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    feedbackState = {
      submissions: data.submissions ?? [],
      questions: data.campaign?.questions ?? [],
      campaign: data.campaign ?? null,
      index: 0,
      tab: feedbackState.tab || 'individual',
    };
    renderFeedbackView();
  } catch (err) {
    if (content) {
      content.innerHTML = `<div class="fb-empty-state fb-error"><p>${escapeHtml(err.message || String(err))}</p></div>`;
    }
  }
}

function closeFeedback() {
  showFeedbackShell(false);
}

function showAnticheatShell(show) {
  anticheatOpen = show;
  $('anticheatView')?.classList.toggle('hidden', !show);
  document.querySelector('.main')?.classList.toggle('hidden', show);
  document.querySelector('.sidebar')?.classList.toggle('hidden', show);
  $('statsRow')?.classList.toggle('hidden', show);
  $('btnAnticheat')?.classList.toggle('active', show);
}

async function loadAnticheat() {
  showAnticheatShell(true);
  await Promise.all([loadAnticheatTrust(), loadAnticheatPunishments(), loadAnticheatMarket()]);
}

function closeAnticheat() {
  showAnticheatShell(false);
}

function renderAnticheatTrustRows(rows) {
  const body = $('acTrustBody');
  if (!body) return;
  body.innerHTML = '';
  if (!rows || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="5">Kayıt yok.</td></tr>';
    return;
  }
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${escapeHtml(r.userId ?? '')}</code></td>
      <td>${escapeHtml(String(r.trustScore ?? '—'))}</td>
      <td>${escapeHtml(String(r.violationCount ?? '—'))}</td>
      <td>${r.isRewardThrottled ? 'Evet' : 'Hayır'}</td>
      <td>${formatDate(r.lastViolationAt)}</td>
    `;
    body.appendChild(tr);
  }
}

function renderAnticheatPunishmentRows(rows) {
  const body = $('acPunishBody');
  if (!body) return;
  body.innerHTML = '';
  if (!rows || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="5">Kayıt yok.</td></tr>';
    return;
  }
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${escapeHtml(r.userId ?? '')}</code></td>
      <td>${escapeHtml(String(r.tier ?? '—'))}</td>
      <td>${escapeHtml(r.reason ?? '—')}</td>
      <td>${formatDate(r.issuedAt)}</td>
      <td>${formatDate(r.expiresAt)}</td>
    `;
    body.appendChild(tr);
  }
}

function renderAnticheatMarketRows(rows) {
  const body = $('acMarketBody');
  if (!body) return;
  body.innerHTML = '';
  if (!rows || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="5">Kayıt yok.</td></tr>';
    return;
  }
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${escapeHtml(r.sellerId ?? '—')}</code></td>
      <td><code>${escapeHtml(r.buyerId ?? '—')}</code></td>
      <td>${escapeHtml(r.reason ?? '—')}</td>
      <td>${escapeHtml(String(r.riskScore ?? '—'))}</td>
      <td>${formatDate(r.createdAt)}</td>
    `;
    body.appendChild(tr);
  }
}

async function loadAnticheatTrust() {
  const sort = $('acTrustSort')?.value || 'trustScoreAsc';
  const res = await fetch(`/api/admin/anticheat/trust?page=1&limit=20&sort=${encodeURIComponent(sort)}`);
  const data = await res.json().catch(() => ({}));
  renderAnticheatTrustRows(data.rows ?? []);
}

async function loadAnticheatPunishments() {
  const userId = $('acPunishUserFilter')?.value?.trim() || '';
  const qs = userId ? `?page=1&limit=20&userId=${encodeURIComponent(userId)}` : '?page=1&limit=20';
  const res = await fetch(`/api/admin/anticheat/punishments${qs}`);
  const data = await res.json().catch(() => ({}));
  renderAnticheatPunishmentRows(data.rows ?? []);
}

async function loadAnticheatMarket() {
  const res = await fetch('/api/admin/anticheat/market-anomalies?page=1&limit=20');
  const data = await res.json().catch(() => ({}));
  renderAnticheatMarketRows(data.rows ?? []);
}

async function submitAnticheatOverride(ev) {
  ev.preventDefault();
  const out = $('acActionResult');
  if (out) {
    out.classList.add('hidden');
    out.textContent = '';
  }
  const userId = $('acUserId')?.value?.trim();
  if (!userId) return;

  const trustRaw = $('acTrustScore')?.value;
  const violationRaw = $('acViolationCount')?.value;
  const payload = {
    ...(trustRaw !== '' ? { trustScore: Number.parseInt(trustRaw, 10) } : {}),
    ...(violationRaw !== '' ? { violationCount: Number.parseInt(violationRaw, 10) } : {}),
    clearThrottle: $('acClearThrottle')?.checked === true,
  };

  const res = await fetch(`/api/admin/anticheat/trust/${encodeURIComponent(userId)}/override`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (out) {
      out.textContent = data.error || `HTTP ${res.status}`;
      out.classList.remove('hidden');
    }
    return;
  }
  if (out) {
    out.textContent = 'Override başarıyla uygulandı.';
    out.classList.remove('hidden');
  }
  await loadAnticheatTrust();
}

$('btnFeedback')?.addEventListener('click', () => {
  if (feedbackOpen) closeFeedback();
  else loadFeedback();
});
$('btnCopyEditor')?.addEventListener('click', () => {
  window.location.href = '/admin/copy';
});
$('btnAnticheat')?.addEventListener('click', () => {
  if (anticheatOpen) closeAnticheat();
  else loadAnticheat();
});

$('btnCloseFeedback')?.addEventListener('click', closeFeedback);
$('btnCloseAnticheat')?.addEventListener('click', closeAnticheat);
$('acRefreshTrust')?.addEventListener('click', loadAnticheatTrust);
$('acRefreshPunish')?.addEventListener('click', loadAnticheatPunishments);
$('acTrustSort')?.addEventListener('change', loadAnticheatTrust);
$('acOverrideForm')?.addEventListener('submit', submitAnticheatOverride);

document.querySelectorAll('.fb-tab').forEach((btn) => {
  btn.addEventListener('click', () => setFeedbackTab(btn.dataset.fbTab || 'individual'));
});

$('fbPrev')?.addEventListener('click', () => {
  if (feedbackState.index > 0) {
    feedbackState.index -= 1;
    renderFeedbackIndividual();
  }
});

$('fbNext')?.addEventListener('click', () => {
  if (feedbackState.index < feedbackState.submissions.length - 1) {
    feedbackState.index += 1;
    renderFeedbackIndividual();
  }
});

$('fbPagerInput')?.addEventListener('change', (ev) => {
  const n = parseInt(ev.target.value, 10);
  const max = feedbackState.submissions.length;
  if (!Number.isFinite(n) || max === 0) return;
  feedbackState.index = Math.max(0, Math.min(n - 1, max - 1));
  renderFeedbackIndividual();
});
