(function () {
  const statusEl = document.getElementById('appealStatus');
  const panelEl = document.getElementById('appealPanel');
  const summaryEl = document.getElementById('appealSummary');
  const formEl = document.getElementById('appealForm');
  const reasonEl = document.getElementById('appealReason');

  const params = new URLSearchParams(window.location.search);
  const token = params.get('at') || '';

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = isError ? '#fca5a5' : '';
  }

  async function loadContext() {
    if (!token) {
      setStatus('Bu sayfaya erişim için geçerli bağlantı gerekiyor.', true);
      return;
    }
    const res = await fetch(`/api/appeal/context?at=${encodeURIComponent(token)}`, {
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || `HTTP ${res.status}`, true);
      return;
    }
    const p = data.punishment;
    const pieces = [];
    if (data.banReason) pieces.push(`Sebep: ${data.banReason}`);
    if (p) pieces.push(`Tier ${p.tier} ceza (${p.reason})`);
    if (summaryEl) summaryEl.textContent = pieces.join(' | ') || 'Ban kaydı bulundu.';
    if (panelEl) panelEl.classList.remove('hidden');
    setStatus('Bu bölüm yalnızca banlı kullanıcılar için görünür.', false);
  }

  async function submitAppeal(ev) {
    ev.preventDefault();
    if (!token) return;
    const reason = (reasonEl && reasonEl.value ? reasonEl.value : '').trim();
    const res = await fetch(`/api/appeal/submit?at=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || `HTTP ${res.status}`, true);
      return;
    }
    setStatus(data.message || 'İtiraz gönderildi.', false);
    if (formEl) formEl.classList.add('hidden');
  }

  if (formEl) formEl.addEventListener('submit', submitAppeal);
  void loadContext();
})();
