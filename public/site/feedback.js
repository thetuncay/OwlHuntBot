const DRAFT_KEY = 'owlhunt_feedback_draft_v1';

let campaign = null;
let questions = [];
let step = 0;
let answers = {};
let attachments = {};

const el = {
  loading: document.getElementById('fbLoading'),
  form: document.getElementById('fbForm'),
  done: document.getElementById('fbDone'),
  readonly: document.getElementById('fbReadonly'),
  host: document.getElementById('fbQuestionHost'),
  sectionTitle: document.getElementById('fbSectionTitle'),
  progressFill: document.getElementById('fbProgressFill'),
  progressLabel: document.getElementById('fbProgressLabel'),
  error: document.getElementById('fbError'),
  prev: document.getElementById('fbPrev'),
  next: document.getElementById('fbNext'),
  submit: document.getElementById('fbSubmit'),
  title: document.getElementById('fbTitle'),
  desc: document.getElementById('fbDesc'),
};

function show(elm) {
  el.loading.classList.add('hidden');
  el.form.classList.add('hidden');
  el.done.classList.add('hidden');
  el.readonly.classList.add('hidden');
  elm.classList.remove('hidden');
}

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.answers) answers = data.answers;
    if (data.attachments) attachments = data.attachments;
    if (typeof data.step === 'number') step = data.step;
  } catch { /* ignore */ }
}

function saveDraft() {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, attachments, step }));
}

function currentQuestion() {
  return questions[step];
}

function setError(msg) {
  if (!msg) {
    el.error.classList.add('hidden');
    el.error.textContent = '';
    return;
  }
  el.error.textContent = msg;
  el.error.classList.remove('hidden');
}

function validateStep(q) {
  const val = answers[q.id];
  if (q.type === 'text_with_images') {
    const text = val?.text?.trim?.() ?? '';
    const ids = val?.attachmentIds ?? [];
    if (!q.required || text || ids.length) return null;
    return 'Metin veya en az bir ekran görüntüsü ekle (veya boş bırak).';
  }
  if (q.required && (val === undefined || val === null || val === '')) {
    return 'Bu soruyu cevaplaman gerekiyor.';
  }
  if (q.type === 'long_text' || q.type === 'short_text') {
    const t = String(val ?? '').trim();
    if (q.required && t.length < (q.minLength ?? 1)) {
      return `En az ${q.minLength ?? 1} karakter yaz.`;
    }
  }
  if (q.type === 'likert_with_text' && q.required && !val?.likert) {
    return '1–5 arası puan seç.';
  }
  if (q.type === 'choice_with_text') {
    if (q.required && !val?.choice) return 'Bir seçenek seç.';
    if (q.textRequiredWhen?.includes(val?.choice) && !String(val?.text ?? '').trim()) {
      return 'Kısa bir açıklama yaz.';
    }
  }
  return null;
}

function renderChoiceButtons(q, selected) {
  return q.options.map((opt) => {
    const active = selected === opt.value ? ' fb-choice-active' : '';
    return `<button type="button" class="fb-choice${active}" data-value="${opt.value}">${opt.label}</button>`;
  }).join('');
}

function renderQuestion() {
  const q = currentQuestion();
  if (!q) return;
  el.sectionTitle.textContent = q.sectionTitle;
  el.progressFill.style.width = `${((step + 1) / questions.length) * 100}%`;
  el.progressLabel.textContent = `${step + 1} / ${questions.length}`;
  el.prev.disabled = step === 0;
  el.next.classList.toggle('hidden', step === questions.length - 1);
  el.submit.classList.toggle('hidden', step !== questions.length - 1);

  const val = answers[q.id];
  let html = `<label class="fb-q-label">${q.label}</label>`;
  if (q.hint) html += `<p class="fb-q-hint">${q.hint}</p>`;

  switch (q.type) {
    case 'single_choice':
      html += `<div class="fb-choices" data-qid="${q.id}">${renderChoiceButtons(q, val)}</div>`;
      break;
    case 'nps_slider':
      html += `<div class="fb-nps"><input type="range" min="0" max="10" step="1" value="${val ?? 5}" id="fbNps" /><span id="fbNpsVal">${val ?? 5}</span></div>`;
      break;
    case 'long_text':
    case 'short_text':
      html += `<textarea class="fb-textarea" data-qid="${q.id}" rows="${q.type === 'long_text' ? 6 : 3}" maxlength="${q.maxLength ?? 1500}">${val ?? ''}</textarea>`;
      break;
    case 'likert_with_text':
      html += `<div class="fb-likert" data-qid="${q.id}">${[1, 2, 3, 4, 5].map((n) => {
        const active = val?.likert === n ? ' fb-choice-active' : '';
        return `<button type="button" class="fb-choice fb-likert-btn${active}" data-likert="${n}">${n}</button>`;
      }).join('')}</div>`;
      html += `<textarea class="fb-textarea fb-optional" data-qid="${q.id}-text" rows="3" maxlength="${q.maxLength ?? 500}" placeholder="İstersen açıkla (opsiyonel)">${val?.text ?? ''}</textarea>`;
      break;
    case 'choice_with_text':
      html += `<div class="fb-choices" data-qid="${q.id}">${renderChoiceButtons(q, val?.choice)}</div>`;
      html += `<textarea class="fb-textarea fb-optional ${q.textRequiredWhen?.includes(val?.choice) ? '' : 'hidden'}" data-qid="${q.id}-text" rows="3" maxlength="${q.maxLength ?? 500}" placeholder="Açıklama">${val?.text ?? ''}</textarea>`;
      break;
    case 'text_with_images':
      html += `<textarea class="fb-textarea" data-qid="${q.id}-text" rows="5" maxlength="${q.maxLength ?? 1500}" placeholder="Hangi mesaj/komut? (opsiyonel)">${val?.text ?? ''}</textarea>`;
      html += `<div class="fb-upload"><input type="file" accept="image/jpeg,image/png,image/webp" id="fbFile" /><p class="fb-q-hint">En fazla 3 ekran görüntüsü (JPEG/PNG/WebP, max 5 MB)</p><div id="fbPreviews" class="fb-previews"></div></div>`;
      break;
    default:
      break;
  }

  el.host.innerHTML = html;
  bindQuestionEvents(q);
  renderPreviews(q);
}

function bindQuestionEvents(q) {
  el.host.querySelectorAll('.fb-choices .fb-choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-value');
      if (q.type === 'choice_with_text') {
        answers[q.id] = { ...(answers[q.id] || {}), choice: v };
        const textEl = el.host.querySelector('[data-qid="' + q.id + '-text"]');
        if (textEl) {
          const need = q.textRequiredWhen?.includes(v);
          textEl.classList.toggle('hidden', !need && v !== 'other');
          if (v === 'other' || need) textEl.classList.remove('hidden');
        }
      } else {
        answers[q.id] = v;
      }
      renderQuestion();
      saveDraft();
    });
  });

  const ta = el.host.querySelector(`textarea[data-qid="${q.id}"]`);
  if (ta) {
    ta.addEventListener('input', () => {
      answers[q.id] = ta.value;
      saveDraft();
    });
  }

  const taText = el.host.querySelector(`textarea[data-qid="${q.id}-text"]`);
  if (taText) {
    taText.addEventListener('input', () => {
      answers[q.id] = { ...(answers[q.id] || {}), text: taText.value };
      saveDraft();
    });
  }

  el.host.querySelectorAll('.fb-likert-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = Number(btn.getAttribute('data-likert'));
      answers[q.id] = { ...(answers[q.id] || {}), likert: n };
      renderQuestion();
      saveDraft();
    });
  });

  const likertText = el.host.querySelector(`textarea[data-qid="${q.id}-text"]`);
  if (q.type === 'likert_with_text' && likertText) {
    likertText.addEventListener('input', () => {
      answers[q.id] = { ...(answers[q.id] || {}), likert: answers[q.id]?.likert, text: likertText.value };
      saveDraft();
    });
  }

  const nps = document.getElementById('fbNps');
  const npsVal = document.getElementById('fbNpsVal');
  if (nps) {
    nps.addEventListener('input', () => {
      answers[q.id] = Number(nps.value);
      if (npsVal) npsVal.textContent = nps.value;
      saveDraft();
    });
  }

  const file = document.getElementById('fbFile');
  if (file) {
    file.addEventListener('change', () => uploadFiles(q, file.files));
  }
}

function renderPreviews(q) {
  if (q.type !== 'text_with_images') return;
  const box = document.getElementById('fbPreviews');
  if (!box) return;
  const ids = answers[q.id]?.attachmentIds ?? [];
  box.innerHTML = ids.map((id) => {
    const meta = attachments[id];
    return `<div class="fb-preview"><img src="/api/feedback/attachment/${id}" alt="" /><button type="button" data-rm="${id}">×</button>${meta?.name ? `<span>${meta.name}</span>` : ''}</div>`;
  }).join('');
  box.querySelectorAll('[data-rm]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-rm');
      const list = (answers[q.id]?.attachmentIds ?? []).filter((x) => x !== id);
      answers[q.id] = { ...(answers[q.id] || {}), attachmentIds: list };
      delete attachments[id];
      renderPreviews(q);
      saveDraft();
    });
  });
}

async function uploadFiles(q, fileList) {
  const ids = answers[q.id]?.attachmentIds ?? [];
  for (const file of fileList) {
    if (ids.length >= 3) {
      setError('En fazla 3 görsel yükleyebilirsin.');
      break;
    }
    const fd = new FormData();
    fd.append('file', file);
    setError('');
    const res = await fetch('/api/feedback/upload', { method: 'POST', body: fd, credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Yükleme başarısız.');
      continue;
    }
    ids.push(data.attachmentId);
    attachments[data.attachmentId] = { name: file.name };
  }
  answers[q.id] = { ...(answers[q.id] || {}), attachmentIds: ids };
  saveDraft();
  renderPreviews(q);
}

async function claimReward(btn) {
  btn.disabled = true;
  const res = await fetch('/api/feedback/claim-reward', { method: 'POST', credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  btn.disabled = false;
  if (data.granted) {
    alert('Ödül hesabına eklendi: 5.000 coin + 5 Eşya Kutusu!');
    location.reload();
  } else {
    alert(data.error || 'Ödül alınamadı. Discord\'da bot kaydın olduğundan emin ol.');
  }
}

function formatAnswer(q, val) {
  if (val === undefined || val === null) return '—';
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (q.type === 'likert_with_text') return `Puan: ${val.likert}${val.text ? ' — ' + val.text : ''}`;
  if (q.type === 'choice_with_text') return `${val.choice}${val.text ? ' — ' + val.text : ''}`;
  if (q.type === 'text_with_images') {
    const parts = [];
    if (val.text) parts.push(val.text);
    if (val.attachmentIds?.length) parts.push(`[${val.attachmentIds.length} görsel]`);
    return parts.join(' ') || '—';
  }
  return JSON.stringify(val);
}

function showReadonly(user) {
  show(el.readonly);
  const rewardEl = document.getElementById('fbReadonlyReward');
  if (user.rewardGranted) {
    rewardEl.textContent = 'Ödülün verildi: 5.000 coin + 5 Eşya Kutusu.';
  } else {
    rewardEl.textContent = 'Ödül bekliyor — Discord\'da bot kaydın yoksa önce kayıt ol.';
    document.getElementById('btnClaimRewardReadonly').classList.remove('hidden');
  }
  const list = document.getElementById('fbReadonlyAnswers');
  list.innerHTML = questions.map((q) => {
    return `<div class="fb-readonly-item"><strong>${q.label}</strong><p>${formatAnswer(q, user.answers?.[q.id])}</p></div>`;
  }).join('');
}

async function init() {
  const res = await fetch('/api/feedback/campaign', { credentials: 'include' });
  if (res.status === 401) {
    location.href = '/login?next=/feedback';
    return;
  }
  if (!res.ok) {
    show(el.loading);
    el.loading.innerHTML = '<p>Anket şu an kullanılamıyor.</p>';
    return;
  }
  const data = await res.json();
  campaign = data.campaign;
  questions = campaign.questions;
  el.title.textContent = campaign.title;
  el.desc.textContent = campaign.description || '';

  if (data.user.status !== 'open') {
    showReadonly(data.user);
    document.getElementById('btnClaimRewardReadonly')?.addEventListener('click', (ev) => {
      claimReward(ev.target);
    });
    return;
  }

  loadDraft();
  show(el.form);
  renderQuestion();

  el.prev.addEventListener('click', () => {
    setError('');
    if (step > 0) {
      step -= 1;
      saveDraft();
      renderQuestion();
    }
  });

  el.next.addEventListener('click', () => {
    const q = currentQuestion();
    const err = validateStep(q);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    if (step < questions.length - 1) {
      step += 1;
      saveDraft();
      renderQuestion();
    }
  });

  el.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = currentQuestion();
    const err = validateStep(q);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    el.submit.disabled = true;
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Gönderilemedi.');
      sessionStorage.removeItem(DRAFT_KEY);
      show(el.done);
      const msg = document.getElementById('fbDoneMsg');
      if (body.rewardGranted) {
        msg.textContent = 'Cevapların kaydedildi. Ödülün hesabına eklendi: 5.000 coin + 5 Eşya Kutusu!';
      } else if (body.rewardPending) {
        msg.textContent = 'Cevapların kaydedildi. Ödül için Discord\'da botu kullanıp kayıt ol, sonra buradan ödülü al.';
        document.getElementById('fbRewardActions').classList.remove('hidden');
        document.getElementById('btnClaimReward').addEventListener('click', (e) => claimReward(e.target));
      } else {
        msg.textContent = 'Cevapların kaydedildi. Teşekkürler!';
      }
    } catch (e) {
      setError(e.message || String(e));
      el.submit.disabled = false;
    }
  });
}

init();
