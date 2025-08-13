// SailUp · app.js · v0.2.5 · 2025-08-13

// === App version (single source of truth) ===
const APP_VERSION = 'v0.2.5';
document.getElementById('page-title').textContent = `SailUp ${APP_VERSION}`;
document.getElementById('brand').textContent = `⛵ SailUp ${APP_VERSION}`;

/**
 * BACKEND INTEGRATION
 * -------------------
 * This version expects the backend to return an array of Mongo-shaped question docs,
 * like the example you provided (one object per question).
 *
 * Example endpoint:
 *    GET /api/questions
 * returns: [{ _id, category:{domain,subdomain,topic}, body, answers:[{body, validated, ...}], ... }, ...]
 */
const QUESTIONS_API = 'http://localhost:3000/api/v1/questions/';

// === UI refs ===
const container   = document.getElementById('question-container');
const qTpl        = document.getElementById('question-card');
const homeTpl     = document.getElementById('home-card');
const progressEl  = document.getElementById('progress');
const scoreEl     = document.getElementById('score');
const progressBar = document.getElementById('progress-bar');
const quizMetaEl  = document.getElementById('quiz-meta');
const btnHome     = document.getElementById('btn-home');

// === State ===
let mode = 'home';           // 'home' | 'quiz'
let topicsData = [];         // [{ id, title, description, items:[UIQuestion] }]
let activeTopic = null;      // selected topic object
let questions = [];          // UIQuestion[]
let currentIndex = 0;
let score = 0;
const answersLog = [];       // {qIndex, correct, selectedIndex, correctIndex}
let TOTAL = 0;

// === Boot ===
init();

async function init(){
  try {
    const mongoDocs = await fetchQuestions();
    topicsData = normalizeFromMongo(mongoDocs, { groupBy: 'domain' });
  } catch (err) {
    console.error('Failed to load questions from backend:', err);
    topicsData = [];
  }
  showHome();
}

// ---- Data fetchers ----
async function fetchQuestions(){
  const res = await fetch(QUESTIONS_API, { headers: { 'Accept':'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/**
 * NORMALIZATION
 * -------------
 * Converts an array of Mongo-shaped question docs into the UI shape.
 * We GROUP questions into topics using `groupBy`:
 *   - 'domain' (default): each domain becomes one "topic" on the home screen.
 *   - 'topic': use category.topic as the group key instead.
 */
function normalizeFromMongo(docs, { groupBy = 'domain' } = {}){
  const byKey = new Map();
  console.log(docs)

  docs.data.forEach((doc, idx) => {
    const cat = doc.category || {};
    const domain    = (cat.domain ?? '').trim();
    const subdomain = (cat.subdomain ?? '').trim();
    const topic     = (cat.topic ?? '').trim();

    // Decide grouping key & home title
    const key   = (groupBy === 'topic' ? topic : domain) || 'General';
    const title = capitalizeFirst(key);
    const desc  = groupBy === 'topic'
      ? (domain && subdomain ? `${capitalizeFirst(domain)} · ${capitalizeFirst(subdomain)}` : (domain || ''))
      : (topic ? `Incluye: ${capitalizeFirst(topic)}` : '');

    if (!byKey.has(key)) {
      byKey.set(key, { id: slugify(title), title, description: desc, items: [] });
    }

    const uiQ = mongoDocToUIQuestion(doc, { fallbackTitle: `Pregunta ${idx + 1}` });
    byKey.get(key).items.push(uiQ);
  });

  // Filter out empty topics just in case
  const topics = [...byKey.values()].filter(t => (t.items && t.items.length));
  return topics;
}

/**
 * Transforms a single Mongo question doc to the UI question shape:
 * { Domain, Subdomain, Topic, Question, Options:[{text, correct}] }
 */
function mongoDocToUIQuestion(doc, { fallbackTitle = 'Pregunta' } = {}){
  const cat = doc.category || {};
  const Domain    = cat.domain    ? capitalizeFirst(cat.domain)    : '';
  const Subdomain = cat.subdomain ? capitalizeFirst(cat.subdomain) : '';
  const Topic     = cat.topic     ? capitalizeFirst(cat.topic)     : '';

  const Question  = doc.body || fallbackTitle;

  // answers[] -> Options[]
  // Correct answer = the one with validated === true
  const answersArr = Array.isArray(doc.answers) ? doc.answers : [];
  const options = answersArr.map(a => ({
    text: a.body ?? String(a?._id ?? ''),
    correct: !!a.validated
  }));

  // Safety: ensure at least one "correct" to avoid crashes
  if (options.length && !options.some(o => o.correct)) {
    // if none validated, mark last as correct as a fallback (or first)
    options[options.length - 1].correct = true;
  }

  return { Domain, Subdomain, Topic, Question, Options: options };
}

// ---- Helpers ----
function capitalizeFirst(str){
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function slugify(str){
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'topic';
}

/* =========================
   UI Flow
   ========================= */

function showHome(){
  mode = 'home';
  quizMetaEl.hidden = true;
  btnHome.hidden = true;

  container.innerHTML = '';
  const node = homeTpl.content.cloneNode(true);
  const grid = node.querySelector('#topics-grid');

  topicsData.forEach((t, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'topic-card';
    card.setAttribute('aria-label', `${t.title}`);
    card.innerHTML = `
      <div class="topic-head">
        <div class="topic-title">${t.title}</div>
      </div>
      <p class="topic-desc">${t.description || ''}</p>
      <div class="topic-actions">
        <span class="cta">Comenzar</span>
      </div>
    `;
    card.addEventListener('click', () => startQuiz(idx));
    grid.appendChild(card);
  });

  container.appendChild(node);
}

function goHome(){
  activeTopic = null;
  questions = [];
  currentIndex = 0;
  score = 0;
  answersLog.length = 0;
  progressBar.style.width = '0%';
  scoreEl.textContent = 'Puntuación: 0';

  cleanupQuizKeys();
  showHome();
}

/* =========================
   Quiz mode
   ========================= */

function startQuiz(topicIndex){
  mode = 'quiz';
  activeTopic = topicsData[topicIndex] ?? null;
  if (!activeTopic) {
    console.warn('Topic not found at index', topicIndex);
    showHome();
    return;
  }

  // Shuffle questions and options for the session
  questions = [...activeTopic.items];
  shuffleInPlace(questions);
  questions = questions.map(q => ({ ...q, Options: shuffleCopy(q.Options) }));
  TOTAL = questions.length;

  quizMetaEl.hidden = false;
  btnHome.hidden = false;

  currentIndex = 0;
  score = 0;
  answersLog.length = 0;

  renderQuestion(currentIndex);
  updateProgress();
  updateScore();

  document.addEventListener('keydown', onQuizKeys);
}

function onQuizKeys(e){
  if (mode !== 'quiz') return;
  const btnCheck = container.querySelector('.check');
  const btnNext  = container.querySelector('.next');

  if (e.key === 'Enter') {
    e.preventDefault();
    if (btnCheck && !btnCheck.disabled) btnCheck.click();
  }
  if ((e.key === 'n' || e.key === 'N') && btnNext && !btnNext.disabled) {
    btnNext.click();
  }
}

function cleanupQuizKeys(){
  document.removeEventListener('keydown', onQuizKeys);
}

function updateProgress() {
  progressEl.textContent = `Pregunta ${Math.min(currentIndex + 1, TOTAL)} de ${TOTAL}`;
  const pct = Math.round((currentIndex) / Math.max(1, TOTAL) * 100);
  progressBar.style.width = `${pct}%`;
}

function updateScore() {
  scoreEl.textContent = `Puntuación: ${score}`;
}

function renderQuestion(index) {
  container.innerHTML = ''; // clear previous question

  const node = qTpl.content.cloneNode(true);
  const card = node.querySelector('.msg');
  const q = questions[index];

  node.querySelector('.q-title').textContent = `${index + 1}. ${q.Question}`;
  node.querySelector('.q-taxonomy').textContent = `${q.Domain} · ${q.Subdomain} · ${q.Topic}`;

  // Options list
  const form = node.querySelector('.options');
  form.setAttribute('aria-labelledby', `qtitle-${index}`);

  q.Options.forEach((opt, i) => {
    const id = `q${index}-opt${i}`;
    const label = document.createElement('label');
    label.className = 'opt';
    label.setAttribute('for', id);
    label.innerHTML = `
      <input id="${id}" type="radio" name="q${index}" value="${i}">
      <span class="opt-text">${opt.text}</span>
    `;
    form.appendChild(label);
  });

  const result = node.querySelector('.result');
  const btnCheck = node.querySelector('.check');
  const btnNext  = node.querySelector('.next');

  // Lock "Más info" until the user answers
  const details = node.querySelector('details.more');
  const moreContent = node.querySelector('.more-content');
  lockMore(details, true);

  let corrected = false;

  btnCheck.addEventListener('click', () => {
    const sel = form.querySelector('input[type="radio"]:checked');
    if (!sel) {
      announce(result, 'Selecciona una opción antes de comprobar.', 'warn');
      return;
    }
    if (corrected) return; // avoid double correction

    const selectedIdx = Number(sel.value);
    const correctIdx = q.Options.findIndex(o => o.correct === true);
    const isCorrect = selectedIdx === correctIdx;

    // Visual paint
    paintOptions(form, selectedIdx, correctIdx);

    if (isCorrect) {
      announce(result, '✅ ¡Correcto!', 'ok');
      score++;
      updateScore();
    } else {
      announce(result, `❌ Incorrecto. Respuesta correcta: "${q.Options[correctIdx].text}"`, 'err');
    }

    // Log stats
    answersLog.push({ qIndex: index, correct: isCorrect, selectedIndex: selectedIdx, correctIndex: correctIdx });

    corrected = true;
    btnNext.disabled = false;

    // Unlock "Más info" after answering
    lockMore(details, false);

    // Lazy-load extra content area (plug your backend if needed)
    details.addEventListener('toggle', async () => {
      if (details.open && moreContent.hasAttribute('hidden')) {
        moreContent.removeAttribute('hidden');
        moreContent.innerHTML = `
          <div class="more-grid">
            <div>
              <h4>Definición</h4>
              <p>Ejemplo de texto… Conecta tu endpoint (p. ej. <code>/per-panel?q=${encodeURIComponent(q.Topic || q.Question)}</code>).</p>
            </div>
            <div class="img-grid">
              <div class="img-ph"></div>
              <div class="img-ph"></div>
              <div class="img-ph"></div>
            </div>
          </div>`;
      }
    }, { once: true });

    // Disable options
    disableOptions(form, true);
    btnCheck.disabled = true;
  });

  btnNext.addEventListener('click', () => {
    if (currentIndex < TOTAL - 1) {
      currentIndex++;
      renderQuestion(currentIndex);
      updateProgress();
    } else {
      showFinishScreen();
    }
  });

  container.appendChild(node);
  setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'end' }), 40);
}

function paintOptions(form, selectedIdx, correctIdx){
  const labels = [...form.querySelectorAll('.opt')];
  labels.forEach((label, i) => {
    label.classList.remove('is-selected','is-correct','is-wrong');
    if (i === selectedIdx) label.classList.add('is-selected');
    if (i === correctIdx) label.classList.add('is-correct');
    if (i === selectedIdx && selectedIdx !== correctIdx) label.classList.add('is-wrong');
  });
}

function disableOptions(form, disabled){
  [...form.querySelectorAll('input[type="radio"]')].forEach(inp => inp.disabled = disabled);
  if (disabled) form.classList.add('options-disabled');
  else form.classList.remove('options-disabled');
}

function lockMore(detailsEl, lock) {
  if (lock) {
    detailsEl.classList.add('locked');
    detailsEl.setAttribute('aria-disabled', 'true');
    detailsEl.addEventListener('click', preventOpenWhenLocked);
  } else {
    detailsEl.classList.remove('locked');
    detailsEl.removeAttribute('aria-disabled');
    detailsEl.removeEventListener('click', preventOpenWhenLocked);
  }
}

function preventOpenWhenLocked(e) {
  const details = e.currentTarget;
  if (details.classList.contains('locked')) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function announce(el, text, kind) {
  el.className = 'result';
  if (kind === 'ok') el.classList.add('ok');
  if (kind === 'err') el.classList.add('err');
  if (kind === 'warn') el.classList.add('warn');
  el.textContent = text;
}

function showFinishScreen() {
  progressBar.style.width = '100%';
  progressEl.textContent = 'Completado';

  const total = TOTAL;
  const correct = score;

  const listItems = answersLog.map((a, i) => {
    const q = questions[a.qIndex];
    const wasOk = a.correct;
    const icon = wasOk ? '✅' : '❌';
    const correctText = q.Options[a.correctIndex]?.text || '';
    return `
      <li class="sum-item ${wasOk ? 'ok' : 'err'}">
        <div class="sum-icon">${icon}</div>
        <div class="sum-body">
          <div class="sum-q">${i+1}. ${q.Question}</div>
          <div class="sum-a muted">Correcta: ${correctText}</div>
        </div>
      </li>`;
  }).join('');

  container.innerHTML = `
    <article class="msg system">
      <div class="msg-inner">
        <h2>🎉 Has finalizado el test</h2>
        <p class="muted">Puntuación: <strong>${correct}/${total}</strong></p>
        <ul class="summary-list">${listItems}</ul>
        <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" id="restart">Repetir tema</button>
          <button type="button" class="btn" id="back-home">Volver al inicio</button>
        </div>
      </div>
    </article>`;

  document.getElementById('restart').addEventListener('click', () => {
    currentIndex = 0;
    score = 0;
    answersLog.length = 0;

    shuffleInPlace(questions);
    questions = questions.map(q => ({ ...q, Options: shuffleCopy(q.Options) }));

    renderQuestion(currentIndex);
    updateProgress();
    updateScore();
  });

  document.getElementById('back-home').addEventListener('click', () => {
    cleanupQuizKeys();
    goHome();
  });
}

/* =========================
   Utils
   ========================= */

function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function shuffleCopy(arr){
  return shuffleInPlace([...arr]);
}
