const RANK_LABELS = {
  power: 'Güç',
  hunt: 'Av',
  arena: 'Arena',
  wealth: 'Servet',
};

function playerIdFromPath() {
  const parts = location.pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('player');
  return idx >= 0 ? decodeURIComponent(parts[idx + 1] ?? '') : '';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatRank(rank) {
  if (rank <= 0) return '—';
  if (rank === 1) return '🥇 #1';
  if (rank === 2) return '🥈 #2';
  if (rank === 3) return '🥉 #3';
  return `#${rank}`;
}

async function loadPlayer() {
  const playerId = playerIdFromPath();
  const loading = document.getElementById('playerLoading');
  const errEl = document.getElementById('playerError');
  const hero = document.getElementById('playerHero');
  const stats = document.getElementById('playerStats');
  const owl = document.getElementById('playerOwl');
  const ranks = document.getElementById('playerRanks');

  if (!playerId) {
    if (loading) loading.classList.add('hidden');
    if (errEl) {
      errEl.textContent = 'Geçersiz oyuncu bağlantısı.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  try {
    const res = await fetch(`/api/public/player/${encodeURIComponent(playerId)}`);
    if (res.status === 404) throw new Error('Bu oyuncu bulunamadı veya henüz kayıt olmamış.');
    if (!res.ok) throw new Error('Profil yüklenemedi.');
    const p = await res.json();

    document.title = `${p.displayName} — OwlHunt`;
    document.getElementById('playerName').textContent = p.displayName;
    document.getElementById('playerSub').textContent =
      `Lv.${p.level} · Güç ${p.powerScore.toLocaleString('tr-TR')}`;

    document.getElementById('pLevel').textContent = String(p.level);
    document.getElementById('pXp').textContent = p.xp.toLocaleString('tr-TR');
    document.getElementById('pPower').textContent = p.powerScore.toLocaleString('tr-TR');
    document.getElementById('pHunts').textContent = p.totalHunts.toLocaleString('tr-TR');
    document.getElementById('pRare').textContent = p.totalRareFinds.toLocaleString('tr-TR');
    document.getElementById('pPvp').textContent = p.totalPvpWins.toLocaleString('tr-TR');
    document.getElementById('pStreak').textContent = String(p.huntComboStreak);
    document.getElementById('pPrestige').textContent = '—';

    if (p.mainOwl) {
      document.getElementById('playerOwlLine').textContent =
        `${p.mainOwl.species} · Tier ${p.mainOwl.tier} · ${p.mainOwl.quality}`;
      owl.classList.remove('hidden');
    }

    const rankList = document.getElementById('playerRankList');
    rankList.innerHTML = '';
    for (const [cat, label] of Object.entries(RANK_LABELS)) {
      const li = document.createElement('li');
      const rank = p.ranks?.[cat] ?? -1;
      li.innerHTML = `
        <span class="player-rank-cat">${escapeHtml(label)}</span>
        <a class="player-rank-val" href="/leaderboard?cat=${encodeURIComponent(cat)}">${formatRank(rank)}</a>
      `;
      rankList.appendChild(li);
    }
    ranks.classList.remove('hidden');

    hero.classList.remove('hidden');
    stats.classList.remove('hidden');
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || String(err);
      errEl.classList.remove('hidden');
    }
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

loadPlayer();
