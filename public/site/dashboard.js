async function saveDisplayName(name) {
  const res = await fetch('/api/dashboard/display-name', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ad kaydedilemedi.');
  return data.displayName;
}

async function loadDashboard() {
  const errEl = document.getElementById('dashError');
  const emptyEl = document.getElementById('dashEmpty');
  const statsEl = document.getElementById('dashStats');
  const owlEl = document.getElementById('dashOwl');
  const loadingEl = document.getElementById('dashLoading');
  const mascotEl = document.getElementById('dashMascot');
  const namePanel = document.getElementById('dashNamePanel');
  const nameInput = document.getElementById('dashNameInput');
  const nameForm = document.getElementById('dashNameForm');
  const nameMsg = document.getElementById('dashNameMsg');

  const finishLoading = () => {
    if (loadingEl) loadingEl.classList.add('hidden');
  };

  if (nameForm) {
    nameForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!nameInput || !nameMsg) return;
      nameMsg.classList.add('hidden');
      try {
        const saved = await saveDisplayName(nameInput.value);
        nameMsg.textContent = `Kaydedildi: ${saved}`;
        nameMsg.className = 'dash-name-msg dash-name-msg-ok';
        nameMsg.classList.remove('hidden');
      } catch (err) {
        nameMsg.textContent = err.message || String(err);
        nameMsg.className = 'dash-name-msg dash-name-msg-err';
        nameMsg.classList.remove('hidden');
      }
    });
  }

  try {
    const res = await fetch('/api/dashboard/profile');
    if (res.status === 401) {
      location.href = '/login?next=/dashboard';
      return;
    }
    if (!res.ok) throw new Error('Profil yüklenemedi — biraz sonra tekrar dene.');
    const data = await res.json();
    const user = data.user;
    const profile = data.profile;

    const shownName = profile.displayName || user.displayName;
    document.getElementById('userName').textContent = shownName;
    document.getElementById('userId').textContent = `Discord ID: ${user.userId}`;
    document.getElementById('userAvatar').src = user.avatarUrl;
    document.getElementById('navName').textContent = user.displayName;
    const navAv = document.getElementById('navAvatar');
    navAv.src = user.avatarUrl;
    navAv.classList.remove('hidden');

    finishLoading();

    if (!profile.registered || !profile.player) {
      if (mascotEl) mascotEl.src = '/assets/owlhuntweb/04_sleeping.png';
      emptyEl.classList.remove('hidden');
      return;
    }

    if (mascotEl) mascotEl.src = '/assets/owlhuntweb/02_happy.png';

    if (namePanel && nameInput) {
      nameInput.value = profile.leaderboardName || profile.displayName || '';
      namePanel.classList.remove('hidden');
    }

    const p = profile.player;
    statsEl.classList.remove('hidden');
    document.getElementById('statLevel').textContent = String(p.level);
    document.getElementById('statCoins').textContent = p.coins.toLocaleString('tr-TR');
    document.getElementById('statXp').textContent = p.xp.toLocaleString('tr-TR');
    document.getElementById('statPower').textContent = p.powerScore.toLocaleString('tr-TR');
    document.getElementById('statHunts').textContent = p.totalHunts.toLocaleString('tr-TR');
    document.getElementById('statRare').textContent = p.totalRareFinds.toLocaleString('tr-TR');
    document.getElementById('statPvp').textContent = p.totalPvpWins.toLocaleString('tr-TR');
    document.getElementById('statStreak').textContent = String(p.huntComboStreak);

    if (profile.mainOwl) {
      owlEl.classList.remove('hidden');
      const o = profile.mainOwl;
      document.getElementById('owlLine').textContent =
        `${o.species} · Tier ${o.tier} · ${o.quality}`;
    }
  } catch (err) {
    finishLoading();
    if (mascotEl) mascotEl.src = '/assets/owlhuntweb/03_angry.png';
    if (errEl) {
      errEl.textContent = err.message || String(err);
      errEl.classList.remove('hidden');
    }
  }
}

loadDashboard();
