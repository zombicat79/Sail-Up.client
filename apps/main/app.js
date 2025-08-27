// SailUp · app.js · v0.6.6 (fix: artículo duplicado al pasar a siguiente)

const APP_VERSION = 'v0.6.6';

// === Imports ===
import { CONFIG } from './config.js';
import { getLocalData } from './content-local.js';
import { getQuestions as REMOTE_DATA } from './content-remote.js';

// === Data ===
let DATA;

async function init() {
  if (CONFIG.source === "remote") {
    const fetchResult = await REMOTE_DATA();
    DATA = fetchResult.domains.data;
  } else {
    const localResult = await getLocalData();
    DATA = localResult.topics.data;
  }
  showHome();
}

// === UI refs ===
const container   = document.getElementById('dynamic-container');
const qTpl        = document.getElementById('question-card');
const homeTpl     = document.getElementById('home-card');
const metaTpl     = document.getElementById('quiz-meta-tpl'); // si la usas

// Refs dinámicas (se reasignan al inyectar meta)
let progressEl  = null;
let scoreEl     = null;
let progressBar = null;
let quizMetaEl  = null;

// Puede existir también un subtítulo “arriba”
const domainSubtitleEl = document.getElementById('domain-subtitle');

// === State ===
let mode = 'home';
let learnMode = true;
let activeDomain = null;
let questions = [];
let currentIndex = 0;
let score = 0;
const answersLog = [];
let TOTAL = 0;

// === Hotkeys ===
document.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'h' || e.key === 'H')) {
    if (mode === 'quiz') goHome();
  }
  if ((e.key === 'n' || e.key === 'N') && mode === 'quiz') {
    const btnNext  = container.querySelector('.next');
    if (btnNext && !btnNext.disabled) btnNext.click();
  }
});

/* ==============================================
   Stage helper: garantiza un único `.messages`
   (SIEMPRE limpia el container para render fresco)
   ============================================== */
function getStage() {
  container.innerHTML = '';
  if (container.classList.contains('messages')) return container;
  const stage = document.createElement('div');
  stage.className = 'messages';
  container.appendChild(stage);
  return stage;
}

/* ==============================================
   Inyecta META (desde plantilla si existe) y
   actualiza referencias; devuelve el elemento meta
   ============================================== */
function injectQuizMeta(stage, titleText) {
  // Borra una meta previa si hubiera
  const prev = stage.querySelector('#quiz-meta');
  if (prev) prev.remove();

  let meta;
  if (metaTpl) {
    const frag = metaTpl.content.cloneNode(true);
    stage.appendChild(frag);
    meta = stage.querySelector('#quiz-meta');
  } else {
    // Fallback por si no hay plantilla en HTML
    meta = document.createElement('article');
    meta.className = 'msg assistant';
    meta.id = 'quiz-meta';
    meta.innerHTML = `
      <div class="msg-inner">
        <h3 class="domain-subtitle"></h3>
        <div class="progress-wrap" aria-hidden="true">
          <div class="progress-bar" id="progress-bar" style="width:0%"></div>
        </div>
        <div class="meta-line">
          <span id="progress">Pregunta 1 de 1</span>
          <span aria-live="polite" class="score" id="score">Puntuación: 0</span>
        </div>
      </div>
    `;
    stage.appendChild(meta);
  }

  // Refs dinámicas
  quizMetaEl  = meta;
  progressEl  = meta.querySelector('#progress');
  scoreEl     = meta.querySelector('#score');
  progressBar = meta.querySelector('#progress-bar');

  // Título dentro de la meta (si existe en plantilla)
  const inlineSubtitle = meta.querySelector('.domain-subtitle');
  if (inlineSubtitle) inlineSubtitle.textContent = titleText || '';

  // Mostrar (por si venía con hidden)
  meta.removeAttribute('hidden');
  return meta;
}

// === Home ===
function showHome(){
  mode = 'home';
  if (domainSubtitleEl) domainSubtitleEl.textContent = '';

  const stage = getStage();

  const node = homeTpl.content.cloneNode(true);

  // Toggle modo aprendizaje
  const saved = localStorage.getItem('learnMode');
  if (saved !== null) learnMode = saved === 'true';

  const toggle = node.querySelector('#toggle-learn');
  toggle.checked = learnMode;
  toggle.addEventListener('change', () => {
    learnMode = toggle.checked;
    localStorage.setItem('learnMode', String(learnMode));
  });

  // Renderiza tarjetas de dominios
  const grid = node.querySelector('#domains-grid');
  DATA.forEach((d, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'domain-card';
    card.setAttribute('aria-label', `${d.title}`);
    card.innerHTML = `
      <div class="domain-head">
        <div class="domain-title">${d.title}</div>
      </div>
      <p class="domain-desc">${d.description || ''}</p>
      <p><img class="domain-img" src="${d.image}" alt="${d.title}"></p>
    `;
    card.addEventListener('click', () => startQuiz(idx));
    grid.appendChild(card);
  });

  stage.appendChild(node);
}

function goHome(){
  activeDomain = null;
  questions = [];
  currentIndex = 0;
  score = 0;
  answersLog.length = 0;
  showHome();
}

/* =========================
   Quiz
   ========================= */
function startQuiz(domainIndex){
  mode = 'quiz';
  activeDomain = DATA[domainIndex];

  // Si mantienes un subtítulo “arriba”
  if (domainSubtitleEl) domainSubtitleEl.textContent = activeDomain.title || '';

  // Construye preguntas
  questions = activeDomain.items.map(item => {
    const combined = (item.Options || []).map((opt, i) => ({
      text: getOptionText(opt),
      correct: !!opt.correct,
      summary: getSummaryByIndex(item.Summary, i)
    }));
    return {
      Domain: item.Domain,
      Subdomain: item.Subdomain,
      Topic: item.Topic,
      Question: item.Question,
      Options: combined
    };
  });

  shuffleInPlace(questions);
  questions = questions.map(q => ({ ...q, Options: shuffleCopy(q.Options) }));
  TOTAL = questions.length;

  currentIndex = 0;
  score = 0;
  answersLog.length = 0;

  // Render de la primera pregunta (renderQuestion se encarga del stage y la meta)
  renderQuestion(currentIndex);
  updateProgress();
  updateScore();
}

function updateProgress() {
  if (!progressEl || !progressBar) return;
  progressEl.textContent = `Pregunta ${Math.min(currentIndex + 1, TOTAL)} de ${TOTAL}`;
  const pct = Math.round((currentIndex) / Math.max(1, TOTAL) * 100);
  progressBar.style.width = `${pct}%`;
}
function updateScore() { if (scoreEl) scoreEl.textContent = `Puntuación: ${score}`; }

function getOptionText(opt){
  const key = Object.keys(opt).find(k => k !== 'correct');
  return opt[key] ?? '';
}
function getSummaryByIndex(summaryObj, idx){
  if (!summaryObj) return '';
  const key = `Summary${idx + 1}`;
  return summaryObj[key] ?? '';
}

function renderQuestion(index) {
  // 🔑 SIEMPRE: limpiar stage, inyectar meta y pintar UNA tarjeta
  const stage = getStage();
  injectQuizMeta(stage, activeDomain?.title || '');

  const node = qTpl.content.cloneNode(true);
  const card = node.querySelector('.msg');
  const q = questions[index];

  node.querySelector('.title').textContent = `${index + 1}. ${q.Question}`;
  const form = node.querySelector('.options');
  const result = node.querySelector('.result');
  const btnNext  = node.querySelector('.next');

  let firstChosenIndex = null;
  const correctIdx = q.Options.findIndex(o => o.correct === true);

  // Opciones
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

  // Selección de respuesta
  form.addEventListener('change', () => {
    const sel = form.querySelector('input[type="radio"] :checked') || form.querySelector('input[type="radio"]:checked');
    if (!sel) return;

    const selectedIdx = Number(sel.value);
    const isCorrect = !!q.Options[selectedIdx]?.correct;

    persistPaint(form, selectedIdx, isCorrect);

    if (!learnMode && firstChosenIndex === null) {
      if (!isCorrect) {
        const correctLabel = form.querySelectorAll('.opt')[correctIdx];
        if (correctLabel) correctLabel.classList.add('is-correct');
      }
      [...form.querySelectorAll('input[type="radio"]')].forEach(inp => inp.disabled = true);
      form.classList.add('options-disabled');
    }

    if (isCorrect) {
      result.innerHTML = `✅ <strong>Respuesta correcta!</strong>` + 
        (learnMode ? `<div class="explain">${q.Options[selectedIdx]?.summary || ''}</div>` : '');
      result.className = 'result ok';
    } else {
      result.innerHTML = `❌ <strong>Respuesta incorrecta</strong>` + 
        (learnMode ? `<div class="explain">${q.Options[selectedIdx]?.summary || ''}</div>` : '');
      result.className = 'result err';
    }

    if (firstChosenIndex === null) {
      firstChosenIndex = selectedIdx;
      if (isCorrect) { score++; updateScore(); }
      btnNext.disabled = false;

      answersLog.push({
        qIndex: index,
        correct: isCorrect,
        selectedIndex: selectedIdx,
        correctIndex: correctIdx
      });
    }
  });

  btnNext.addEventListener('click', () => {
    if (currentIndex < TOTAL - 1) {
      currentIndex++;
      // ✅ SOLO volvemos a pintar usando renderQuestion (sin añadir nada extra)
      renderQuestion(currentIndex);
      updateProgress();
    } else {
      showFinishScreen();
    }
  });

  stage.appendChild(node);
  setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'end' }), 40);
}

function persistPaint(form, selectedIdx, isCorrect){
  const labels = [...form.querySelectorAll('.opt')];
  labels.forEach((label, i) => {
    if (i === selectedIdx) {
      label.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
    }
  });
}

function showFinishScreen() {
  const stage = getStage();
  injectQuizMeta(stage, activeDomain?.title || '');

  // Completa la barra y texto
  if (progressBar) progressBar.style.width = '100%';
  if (progressEl) progressEl.textContent = 'Completado';

  const total = TOTAL;
  const correct = score;

  const listItems = answersLog.map((a, i) => {
    const q = questions[a.qIndex];
    const icon = a.correct ? '✅' : '❌';
    const correctText = q.Options[a.correctIndex]?.text || '';
    return `
      <li class="sum-item ${a.correct ? 'ok' : 'err'}">
        <div class="sum-icon">${icon}</div>
        <div class="sum-body">
          <div class="sum-q">${i+1}. ${q.Question}</div>
          <div class="sum-a muted">Respuesta correcta: ${correctText}</div>
        </div>
      </li>`;
  }).join('');

  const article = document.createElement('article');
  article.className = 'msg system';
  article.innerHTML = `
    <div class="msg-inner">
      <h2 class="q-title">🎉 Has finalizado el test</h2>
      <p class="muted">Respuestas correctas: <strong>${correct}/${total}</strong></p>
      <ul class="summary-list">${listItems}</ul>
      <div class="actions" style="margin-top:14px; gap:10px; flex-wrap:wrap;">
        <button type="button" class="btn btn-primary" id="restart">Repetir tema</button>
        <button type="button" class="btn" id="back-home">Volver al inicio</button>
      </div>
    </div>
  `;

  stage.appendChild(article);

  document.getElementById('restart').addEventListener('click', () => {
    currentIndex = 0; score = 0; answersLog.length = 0;
    shuffleInPlace(questions);
    questions = questions.map(q => ({ ...q, Options: shuffleCopy(q.Options) }));
    renderQuestion(currentIndex);
    updateProgress();
    updateScore();
  });

  document.getElementById('back-home').addEventListener('click', () => {
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
function shuffleCopy(arr){ return shuffleInPlace([...arr]); }

// === Boot ===
init();
