const SUPPORT_URL = 'https://discord.gg/5yQxgQDRHu';

async function loadConfig() {
  const inviteLinks = ['heroInvite', 'navInvite', 'footerInvite'].map((id) =>
    document.getElementById(id),
  );
  const supportTargets = ['heroSupport', 'navSupport', 'footerSupport'];
  const statText = document.getElementById('statText');
  const statLoadingOwl = document.getElementById('statLoadingOwl');

  try {
    const res = await fetch('/api/public/config');
    if (!res.ok) throw new Error('config');
    const cfg = await res.json();

    if (cfg.inviteUrl) {
      for (const el of inviteLinks) {
        if (el) el.href = cfg.inviteUrl;
      }
      document.querySelectorAll('.mobile-invite-bar a').forEach((a) => {
        a.href = cfg.inviteUrl;
      });
    }

    const support = cfg.supportUrl || SUPPORT_URL;
    for (const id of supportTargets) {
      const el = document.getElementById(id);
      if (el) el.href = support;
    }

    if (statText) {
      const count = cfg.guildCount;
      const max = cfg.maxGuilds ?? 100;
      if (count != null && count >= 0) {
        if (count < 5) {
          statText.textContent = `${cfg.botName} yeni açıldı — ${max} sunucu kapasitesi · ilk sen ol`;
        } else {
          statText.textContent = `${count.toLocaleString('tr-TR')} sunucuda aktif · global ekonomi, tek profil`;
        }
      } else {
        statText.textContent = `${cfg.botName} — sunucuna ekle, ilk hunt'ını at`;
      }
    }
    if (statLoadingOwl) statLoadingOwl.hidden = true;

    document.title = `${cfg.botName} — Discord av botu`;
  } catch {
    if (statText) statText.textContent = 'Sunucuna ekle, avlan, hunt at.';
    if (statLoadingOwl) statLoadingOwl.hidden = true;
  }
}

loadConfig();

async function loadAuthNav() {
  const loginBtn = document.getElementById('navLogin');
  const profileLink = document.getElementById('navProfile');
  const profileGuest = document.getElementById('navProfileGuest');
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.loggedIn && data.user) {
      if (loginBtn) loginBtn.classList.add('hidden');
      if (profileGuest) profileGuest.classList.add('hidden');
      if (profileLink) {
        profileLink.classList.remove('hidden');
        profileLink.textContent = data.user.displayName;
      }
    }
  } catch {
    /* public page */
  }
}

loadAuthNav();

document.querySelectorAll('.cmd-card[data-copy]').forEach((card) => {
  card.addEventListener('click', async () => {
    const text = card.getAttribute('data-copy');
    const hint = document.getElementById('cmdCopyHint');
    try {
      await navigator.clipboard.writeText(text);
      if (hint) hint.textContent = `Kopyalandı: ${text}`;
      card.classList.add('cmd-copied');
      setTimeout(() => card.classList.remove('cmd-copied'), 1200);
    } catch {
      if (hint) hint.textContent = `Komut: ${text}`;
    }
  });
});
