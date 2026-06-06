/* ═══════════════════════════════════════
   Vaid — script.js
   ═══════════════════════════════════════ */
'use strict';

/* ── STATE ── */
const S = {
  recognition: null,
  listening:   false,
  voiceLang:   'hi-IN',
  history:     [],
};

try { S.history = JSON.parse(localStorage.getItem('vaid_hist') || '[]'); } catch(_){}

/* ── HELPERS ── */
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const delay = ms => new Promise(r => setTimeout(r, ms));

/* ── SESSION CLOCK ── */
function tickClock() {
  const el = $('#session-time');
  if (!el) return;
  const now = new Date();
  el.innerHTML =
    `${now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}<br/>` +
    `<span>${now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>`;
}

tickClock();
setInterval(tickClock, 30000);

/* ══════════════════════════════════════
   AUTH
   ══════════════════════════════════════ */

/* Tab switching on login */
$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.form-body').forEach(f => f.classList.add('hidden'));
    $(`#form-${btn.dataset.form}`).classList.remove('hidden');
  });
});

function doLogin() {
  const btn = document.activeElement.closest('button') || $('#login-screen .submit-btn');
  const origHTML = btn.innerHTML;
  btn.innerHTML = `<div class="spinner"></div><span>Entering…</span>`;
  btn.disabled = true;

  setTimeout(() => {
    btn.innerHTML = origHTML;
    btn.disabled = false;
    $('#login-screen').classList.remove('active');
    $('#app-screen').classList.add('active');
    tickClock();
  }, 800);
}

function doLogout() {
  resetAnalysis();
  $('#sym-input').value = '';
  updateCount();
  $('#app-screen').classList.remove('active');
  $('#login-screen').classList.add('active');
}

/* ══════════════════════════════════════
   NAV
   ══════════════════════════════════════ */
function switchSection(btn) {
  $$('.rail-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const target = btn.dataset.section;
  $$('.app-section').forEach(s => s.classList.remove('active'));
  $(`#section-${target}`).classList.add('active');

  if (target === 'history') renderHistory();
}

/* ══════════════════════════════════════
   INPUT
   ══════════════════════════════════════ */
const symInput = $('#sym-input');

symInput.addEventListener('input', updateCount);

function updateCount() {
  const n = symInput.value.length;
  $('#gutter-count').textContent = n;
}

function clearSym() {
  symInput.value = '';
  updateCount();
  symInput.focus();
}

function appendSym(s) {
  const cur = symInput.value.trim();
  symInput.value = cur ? `${cur}, ${s}` : s;
  symInput.focus();
  updateCount();
}

/* ══════════════════════════════════════
   VOICE
   ══════════════════════════════════════ */
function setLang(lang, btn) {
  S.voiceLang = lang;
  $$('.lang-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function toggleMic() {
  S.listening ? stopMic() : startMic();
}

function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    toast('Voice input not supported. Use Chrome or Edge.', 'warn');
    return;
  }

  const r = new SR();
  r.lang = S.voiceLang;
  r.continuous = false;
  r.interimResults = true;

  const oldText = symInput.value.trim();
  let finalText = '';

  r.onstart = () => {
    S.listening = true;
    $('#mic-btn').classList.add('listening');
    $('#listen-bar').classList.remove('hidden');
  };

  r.onresult = e => {
    let interimText = '';

    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript.trim();

      if (e.results[i].isFinal) {
        finalText += (finalText ? ' ' : '') + text;
      } else {
        interimText += text;
      }
    }

    const spoken = (finalText + ' ' + interimText).trim();

    symInput.value = oldText
      ? oldText + ', ' + spoken
      : spoken;

    updateCount();
  };

  r.onerror = e => {
    stopMic();
    if (e.error === 'not-allowed') toast('Microphone access denied.', 'err');
    else toast(`Voice error: ${e.error}`, 'warn');
  };

  r.onend = () => {
    stopMic();
  };

  S.recognition = r;
  r.start();
}

function stopMic() {
  S.listening = false;

  if (S.recognition) {
    S.recognition.onend = null;
    S.recognition.stop();
    S.recognition = null;
  }

  $('#mic-btn').classList.remove('listening');
  $('#listen-bar').classList.add('hidden');
}

/* ══════════════════════════════════════
   ANALYSIS
   ══════════════════════════════════════ */
async function runAnalysis() {
  const symptoms = symInput.value.trim();
  if (!symptoms) { toast('Please describe your symptoms first.', 'warn'); return; }
  if (symptoms.length < 4) { toast('Please add more detail.', 'warn'); return; }

  stopMic();
  setAnalyzeBtn(true);
  showLoading();

  await animateSteps();

  try {
    const res = await fetch('http://127.0.0.1:5000/predict', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ symptoms }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    saveHistory(symptoms, data);
    showResults(data);

  } catch (err) {
    console.warn('Backend error:', err);
    // Demo fallback
    const demo = makeDemoData(symptoms);
    saveHistory(symptoms, demo);
    showResults(demo, true);
  } finally {
    setAnalyzeBtn(false);
  }
}

function setAnalyzeBtn(loading) {
  const btn = $('#analyze-btn');
  const lbl = $('#analyze-label');
  btn.disabled = loading;
  if (loading) {
    lbl.textContent = 'Analyzing…';
    btn.querySelector('.analyze-pip').style.background = 'rgba(15,13,11,0.3)';
  } else {
    lbl.textContent = 'Analyze';
    btn.querySelector('.analyze-pip').style.background = '';
  }
}

/* ── LOADING STEPS ── */
function showLoading() {
  $('#idle-state').classList.add('hidden');
  $('#result-content').classList.add('hidden');
  $('#loading-state').classList.remove('hidden');
  $$('.load-step').forEach(s => { s.classList.remove('active','done'); });
}

async function animateSteps() {
  const ids = ['lstep-1','lstep-2','lstep-3'];
  for (let i = 0; i < ids.length; i++) {
    await delay(420 + i * 380);
    if (i > 0) { $(`#${ids[i-1]}`).classList.remove('active'); $(`#${ids[i-1]}`).classList.add('done'); }
    $(`#${ids[i]}`).classList.add('active');
  }
  await delay(320);
}

/* ── RENDER RESULTS ── */
function showResults(data, isDemo = false) {
  $('#loading-state').classList.add('hidden');
  $('#idle-state').classList.add('hidden');
  $('#result-content').classList.remove('hidden');

  const list = $('#predictions-list');
  list.innerHTML = '';

  const preds = normalisePredictions(data);

  if (!preds.length) {
    list.innerHTML = `<p style="color:var(--faint);font-size:.85rem;padding:.5rem 0">No predictions returned.</p>`;
    return;
  }

  preds.forEach((p, i) => {
    const card = buildCard(p, i);
    list.appendChild(card);
    requestAnimationFrame(() => {
      const fill = card.querySelector('.conf-fill');
      if (fill) fill.style.width = `${Math.min(100, parseFloat(p.confidence) || 0)}%`;
    });
  });

  if (isDemo) {
    const note = document.createElement('p');
    note.style.cssText = 'font-family:JetBrains Mono,monospace;font-size:.68rem;color:var(--faint);margin-top:.25rem;';
    note.textContent = '⚠ Demo mode — Flask backend not detected on port 5000';
    list.appendChild(note);
  }
}

function normalisePredictions(data) {
  if (Array.isArray(data)) return data;
  if (data.predictions && Array.isArray(data.predictions)) return data.predictions;
  if (data.disease || data.Disease) return [data];
  return [data];
}

function buildCard(p, idx) {
  const disease     = esc(p.disease || p.Disease || p.name || 'Unknown Condition');
  const confidence  = parseFloat(p.confidence || p.probability || p.Confidence || 80).toFixed(1);
  const severity    = p.severity || p.Severity || 'Medium';
  const symptoms    = toArr(p.symptoms || p.matched_symptoms || p.Symptoms || []);
  const precautions = toArr(p.precautions || p.Precautions || []);

  const sevClass = { 'High':'sev-high', 'Medium':'sev-medium', 'Low':'sev-low' }[severity] || 'sev-medium';

  const symHTML  = symptoms.length
    ? symptoms.map(s => `<span class="sym-tag">${esc(s)}</span>`).join('')
    : '';

  const precHTML = precautions.length
    ? precautions.map(t => `<div class="prec-item">${esc(t)}</div>`).join('')
    : '<div class="prec-item">Follow standard medical guidance and rest adequately.</div>';

  const card = document.createElement('div');
  card.className = 'pred-card';
  card.style.animationDelay = `${idx * 0.09}s`;

  card.innerHTML = `
    <div class="pred-header">
      <div class="pred-disease">${disease}</div>
      <div class="pred-meta">
        <span class="pred-conf mono">${confidence}%</span>
        <span class="pred-sev ${sevClass} mono">${esc(severity)}</span>
      </div>
    </div>
    <div class="pred-body">
      <div class="conf-row">
        <span class="conf-label-sm mono">confidence</span>
        <div class="conf-track"><div class="conf-fill" style="width:0%"></div></div>
        <span style="font-family:'JetBrains Mono',monospace;font-size:.68rem;color:var(--faint);flex-shrink:0">${confidence}%</span>
      </div>
      ${symHTML ? `<div>
        <div class="pred-sym-label">Matched symptoms</div>
        <div class="sym-tags">${symHTML}</div>
      </div>` : ''}
      <div>
        <div class="pred-prec-label">Precautions</div>
        <div class="prec-list">${precHTML}</div>
      </div>
    </div>
  `;

  return card;
}

function resetAnalysis() {
  $('#result-content').classList.add('hidden');
  $('#loading-state').classList.add('hidden');
  $('#idle-state').classList.remove('hidden');
  $('#predictions-list').innerHTML = '';
}

/* ══════════════════════════════════════
   HISTORY
   ══════════════════════════════════════ */
function saveHistory(symptoms, data) {
  const entry = {
    id:   Date.now(),
    sym:  symptoms.slice(0, 90),
    date: new Date().toLocaleString('en-IN',{
      day:'2-digit', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit',
    }),
    data,
  };
  S.history.unshift(entry);
  if (S.history.length > 30) S.history.pop();
  try { localStorage.setItem('vaid_hist', JSON.stringify(S.history)); } catch(_){}
}

function renderHistory() {
  const el = $('#history-body');

  if (!S.history.length) {
    el.innerHTML = `<div class="hist-empty">no history yet — run your first analysis</div>`;
    return;
  }

  el.innerHTML = S.history.map(e => {
    let topDisease = '—';
    try {
      const preds = normalisePredictions(e.data);
      if (preds[0]) topDisease = preds[0].disease || preds[0].Disease || preds[0].name || '—';
    } catch(_){}

    return `
      <div class="hist-card" onclick="loadHistEntry(${e.id})">
        <div class="hist-left">
          <div class="hist-sym">${esc(e.sym)}${e.sym.length >= 90 ? '…' : ''}</div>
          <div class="hist-date mono">${e.date}</div>
        </div>
        <div class="hist-right">
          ${esc(topDisease)}
          <svg viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M5 3l6 5-6 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>
    `;
  }).join('');
}

function loadHistEntry(id) {
  const e = S.history.find(h => h.id === id);
  if (!e) return;
  symInput.value = e.sym;
  updateCount();
  // go to analysis tab
  const analysisBtn = $('[data-section="analysis"]');
  switchSection(analysisBtn);
  showResults(e.data);
}

/* ══════════════════════════════════════
   DEMO DATA (when backend unreachable)
   ══════════════════════════════════════ */
function makeDemoData(text) {
  const t = text.toLowerCase();

  const rules = [
    {
      match: ['fever','cold','cough','flu','बुखार','खांसी','ठंड'],
      disease:'Common Cold / Influenza', confidence:88.4, severity:'Low',
      symptoms:['Fever','Runny nose','Cough','Fatigue'],
      precautions:['Rest and avoid strenuous activity','Drink warm fluids and stay hydrated','Use saline spray or steam inhalation for congestion','Avoid close contact with others until symptoms subside'],
    },
    {
      match: ['headache','migraine','सिरदर्द','nausea','light'],
      disease:'Migraine', confidence:83.7, severity:'Medium',
      symptoms:['Severe headache','Nausea','Light sensitivity','Pulsating pain'],
      precautions:['Rest in a dark and quiet room','Apply cold compress to the forehead','Stay well hydrated and avoid known triggers','Consult a neurologist if episodes are recurring'],
    },
    {
      match: ['stomach','vomit','diarrhea','loose','पेट','उल्टी'],
      disease:'Gastroenteritis', confidence:79.1, severity:'Medium',
      symptoms:['Abdominal cramps','Nausea','Vomiting','Diarrhea'],
      precautions:['Maintain fluid intake to prevent dehydration','Follow a bland diet (rice, toast, bananas)','Avoid spicy and fatty foods temporarily','Seek care if symptoms persist beyond 48 hours'],
    },
    {
      match: ['chest','breathe','breathing','shortness','सांस'],
      disease:'Possible Respiratory Issue', confidence:72.3, severity:'High',
      symptoms:['Chest tightness','Shortness of breath','Wheezing'],
      precautions:['Seek medical attention promptly','Avoid physical exertion','Sit upright and in a well-ventilated area','Call emergency services if breathing becomes severely difficult'],
    },
  ];

  const matched = rules.find(r => r.match.some(k => t.includes(k))) || {
    disease:'Generalised Viral Illness', confidence:70.5, severity:'Low',
    symptoms:['Fatigue','Weakness','Mild fever','Body aches'],
    precautions:['Get adequate rest and sleep','Stay hydrated with water and electrolytes','Monitor temperature and symptoms','Consult a physician if no improvement in 3 days'],
  };

  return {
    predictions: [
      matched,
      {
        disease:'Stress-induced Exhaustion', confidence:38.2, severity:'Low',
        symptoms:['Fatigue','Weakness'],
        precautions:['Ensure 7–8 hours of sleep nightly','Practise deep breathing or meditation','Reduce screen time before bed'],
      },
    ],
  };
}

/* ══════════════════════════════════════
   TOAST
   ══════════════════════════════════════ */
function toast(msg, type = 'warn') {
  const el = $('#toast');
  el.className = `toast ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 4000);
}

/* ══════════════════════════════════════
   UTILS
   ══════════════════════════════════════ */
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function toArr(v) {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/[,;|]/).map(x => x.trim()).filter(Boolean);
  return [];
}

/* ══════════════════════════════════════
   KEYBOARD
   ══════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if ($('#section-analysis').classList.contains('active')) runAnalysis();
  }
  if (e.key === 'Escape') stopMic();
});

/* ══════════════════════════════════════
   VOICE SUPPORT CHECK
   ══════════════════════════════════════ */
if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
  const micBtn = $('#mic-btn');
  if (micBtn) {
    micBtn.style.opacity = '0.35';
    micBtn.style.cursor  = 'not-allowed';
    micBtn.onclick = () => toast('Voice input requires Chrome or Edge browser.', 'warn');
  }
}
