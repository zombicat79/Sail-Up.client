// SailUp · app.js · v0.4.1

// === Version stamping ===
const APP_VERSION = 'v0.4.1';
document.getElementById('page-title').textContent = `SailUp ${APP_VERSION}`;
document.getElementById('brand').textContent = `⛵ SailUp ${APP_VERSION}`;

// === Imports ===
import { SOURCE } from "./config.js";
import { LOCAL_DATA } from "./content-local.js"; // para local
import { getQuestions } from "./content-remote.js"; // para remoto en el futuro

let DATA;
if (SOURCE === "local") {
  DATA = LOCAL_DATA;
} else {
  const fetchResult = await getQuestions();
  DATA = fetchResult.topics.data;
}
console.log(DATA)

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
let mode = 'home';                 // 'home' | 'quiz'
let learnMode = true;              // toggle "Modo aprendizaje"
let activeTopic = null;
let questions = [];                // [{ Domain, Question, Options:[{text, correct, summary}] }]
let currentIndex = 0;
let score = 0;
const answersLog = [];             // { qIndex, correct (first choice), selectedIndex (first), correctIndex }
let TOTAL = 0;

// === Boot ===
showHome();

// Hotkeys: Alt+H → Home, N → Next
document.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'h' || e.key === 'H')) {
    if (mode === 'quiz') goHome();
  }
  if ((e.key === 'n' || e.key === 'N') && mode === 'quiz') {
    const btnNext  = container.querySelector('.next');
    if (btnNext && !btnNext.disabled) btnNext.click();
  }
});
btnHome.addEventListener('click', () => { if (mode === 'quiz') goHome(); });

// === Home ===
function showHome(){
  mode = 'home';
  quizMetaEl.hidden = true;
  btnHome.hidden = true;

  container.innerHTML = '';
  const node = homeTpl.content.cloneNode(true);

  // Sync toggle from localStorage
  const saved = localStorage.getItem('learnMode');
  if (saved !== null) learnMode = saved === 'true';

  const toggle = node.querySelector('#toggle-learn');
  toggle.checked = learnMode;
  toggle.addEventListener('change', () => {
    learnMode = toggle.checked;
    localStorage.setItem('learnMode', String(learnMode));
  });

  const grid = node.querySelector('#topics-grid');

  DATA.forEach((t, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'topic-card';
    card.setAttribute('aria-label', `${t.title}`);
    card.innerHTML = `
      <div class="topic-head">
        <div class="topic-title">${t.title}</div>
        </div>
        <p class="topic-desc">${t.description || ''}</p>
        <p><img class="topic-img" src="${t.image}" alt="${t.title}"></p>
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
  showHome();
}

/* =========================
   Quiz
   ========================= */

function startQuiz(topicIndex){
  mode = 'quiz';
  activeTopic = DATA[topicIndex];

  // Build per-question combined options [{text, correct, summary}]
  questions = activeTopic.items.map(item => {
    const combined = (item.Options || []).map((opt, i) => ({
      text: getOptionText(opt),
      correct: !!opt.correct,
      summary: getSummaryByIndex(item.Summary, i) // i: 0..3
    }));
    return {
      Domain: item.Domain,
      Subdomain: item.Subdomain,
      Topic: item.Topic,
      Question: item.Question,
      Options: combined
    };
  });

  // Shuffle questions and options
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
}

function updateProgress() {
  progressEl.textContent = `Pregunta ${Math.min(currentIndex + 1, TOTAL)} de ${TOTAL}`;
  const pct = Math.round((currentIndex) / Math.max(1, TOTAL) * 100);
  progressBar.style.width = `${pct}%`;
}
function updateScore() { scoreEl.textContent = `Puntuación: ${score}`; }

// Helpers to extract option text & matching summary
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
  container.innerHTML = '';

  const node = qTpl.content.cloneNode(true);
  const card = node.querySelector('.msg');
  const q = questions[index];

  // Domain arriba, luego título
  node.querySelector('.q-domain').textContent = q.Domain || '';
  node.querySelector('.q-title').textContent = `${index + 1}. ${q.Question}`;

  const form = node.querySelector('.options');
  const result = node.querySelector('.result');
  const btnNext  = node.querySelector('.next');

  form.setAttribute('aria-labelledby', `qtitle-${index}`);

  // Track first selection (for scoring & final summary)
  let firstChosenIndex = null;
  const correctIdx = q.Options.findIndex(o => o.correct === true);

  // Render options
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

  // Instant feedback
  form.addEventListener('change', () => {
    const sel = form.querySelector('input[type="radio"]:checked');
    if (!sel) return;

    const selectedIdx = Number(sel.value);
    const isCorrect = !!q.Options[selectedIdx]?.correct;

    // Persist paint for clicked option
    persistPaint(form, selectedIdx, isCorrect);

    // Normal mode: after first click disable inputs; if wrong, also reveal correct in green
    if (!learnMode && firstChosenIndex === null) {
      if (!isCorrect) {
        const correctLabel = form.querySelectorAll('.opt')[correctIdx];
        if (correctLabel) correctLabel.classList.add('is-correct');
      }
      // Disable inputs (visual: only text + radio communicate disabled, card keeps active look/hover)
      [...form.querySelectorAll('input[type="radio"]')].forEach(inp => inp.disabled = true);
      form.classList.add('options-disabled');
    }

    // Result text
    if (isCorrect) {
      result.innerHTML = `✅ <strong>Respuesta correcta</strong>` + (learnMode ? `<div class="explain">${q.Options[selectedIdx]?.summary || ''}</div>` : '');
      result.className = 'result ok';
    } else {
      result.innerHTML = `❌ <strong>Respuesta incorrecta</strong>` + (learnMode ? `<div class="explain">${q.Options[selectedIdx]?.summary || ''}</div>` : '');
      result.className = 'result err';
    }

    // First choice: scoring/log, enable Next
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
      renderQuestion(currentIndex);
      updateProgress();
    } else {
      showFinishScreen();
    }
  });

  container.appendChild(node);
  setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'end' }), 40);
}

/* ----- UI helpers ----- */
// Persist color for clicked options (keep previous marks until next question)
function persistPaint(form, selectedIdx, isCorrect){
  const labels = [...form.querySelectorAll('.opt')];
  labels.forEach((label, i) => {
    if (i === selectedIdx) {
      label.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
    }
  });
}

function showFinishScreen() {
  progressBar.style.width = '100%';
  progressEl.textContent = 'Completado';

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
