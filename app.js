// === Configuración general ===
const APP_VERSION = 'v0.2.1';
document.getElementById('page-title').textContent = `SailUp ${APP_VERSION}`;
document.getElementById('brand').textContent = `⛵ SailUp ${APP_VERSION}`;

// === Datos (multi-tema) ===
const DATA = {
  topics: [
    {
      id: 'nomenclatura',
      title: '1. Nomenclatura Náutica',
      description: 'Partes del barco, casco, jarcia y términos básicos.',
      items: [
        {
          "Domain": "1. Nomenclatura Náutica",
          "Subdomain": "Casco",
          "Topic": "Obra viva",
          "Question": "¿Qué se denomina 'obra viva' del casco?",
          "Options": [
            { "text": "La parte del casco situada por debajo de la línea de flotación en carga.", "correct": true },
            { "text": "La parte del casco situada por encima de la línea de flotación en todas las condiciones.", "correct": false },
            { "text": "El conjunto de palos y jarcia fija de la embarcación.", "correct": false },
            { "text": "La zona de popa donde se aloja el timón y el codaste.", "correct": false }
          ]
        },
        {
          "Domain": "1. Nomenclatura Náutica",
          "Subdomain": "Casco",
          "Topic": "Borda",
          "Question": "¿Qué es la 'borda' de una embarcación?",
          "Options": [
            { "text": "El canto superior del costado del casco.", "correct": true },
            { "text": "La parte sumergida de la proa.", "correct": false },
            { "text": "El mamparo estanco de popa.", "correct": false },
            { "text": "El refuerzo longitudinal del fondo.", "correct": false }
          ]
        }
      ]
    }
    // Más temas en el futuro
  ]
};

// === Referencias UI ===
const container   = document.getElementById('question-container');
const qTpl        = document.getElementById('question-card');
const homeTpl     = document.getElementById('home-card');
const progressEl  = document.getElementById('progress');
const scoreEl     = document.getElementById('score');
const progressBar = document.getElementById('progress-bar');
const metaEl      = document.getElementById('meta');
const btnHome     = document.getElementById('btn-home');

// === Estado ===
let mode = 'home';                 // 'home' | 'quiz'
let activeTopic = null;            // objeto tema seleccionado
let questions = [];                // preguntas del tema activo
let currentIndex = 0;
let score = 0;
const answersLog = [];             // {qIndex, correct, selectedIndex, correctIndex}
let TOTAL = 0;

// Inicio
showHome();

// Atajo global: volver al inicio con Alt+H
document.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'h' || e.key === 'H')) {
    if (mode === 'quiz') goHome();
  }
});

btnHome.addEventListener('click', () => {
  if (mode === 'quiz') goHome();
});

// === HOME ===
function showHome(){
  mode = 'home';
  metaEl.hidden = true;
  btnHome.hidden = true;

  container.innerHTML = '';
  const node = homeTpl.content.cloneNode(true);
  const grid = node.querySelector('#topics-grid');

  DATA.topics.forEach((t, idx) => {
    const totalQs = t.items.length;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'topic-card';
    card.setAttribute('aria-label', `${t.title}. ${totalQs} preguntas.`);
    card.innerHTML = `
      <div class="topic-head">
        <div class="topic-title">${t.title}</div>
        <div class="topic-count">${totalQs} ${totalQs === 1 ? 'pregunta' : 'preguntas'}</div>
      </div>
      <p class="topic-desc">${t.description || ''}</p>
      <div class="topic-actions">
        <span class="chip">Modo práctica</span>
        <span class="cta">Comenzar</span>
      </div>
    `;
    card.addEventListener('click', () => startQuiz(idx));
    grid.appendChild(card);
  });

  container.appendChild(node);
}

function goHome(){
  // Limpia estado del quiz
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

// === QUIZ ===
function startQuiz(topicIndex){
  mode = 'quiz';
  activeTopic = DATA.topics[topicIndex];

  // Prepara preguntas
  questions = [...activeTopic.items];
  shuffleInPlace(questions);
  questions = questions.map(q => ({ ...q, Options: shuffleCopy(q.Options) }));
  TOTAL = questions.length;

  // UI meta visible y Home visible
  metaEl.hidden = false;
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
  container.innerHTML = ''; // limpia la pregunta anterior

  const node = qTpl.content.cloneNode(true);
  const card = node.querySelector('.msg');
  const q = questions[index];

  node.querySelector('.q-title').textContent = `${index + 1}. ${q.Question}`;
  node.querySelector('.q-taxonomy').textContent = `${q.Domain} · ${q.Subdomain} · ${q.Topic}`;

  // Opciones
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

  // Bloquear "Más info" hasta responder
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
    if (corrected) return; // evita doble corrección

    const selectedIdx = Number(sel.value);
    const correctIdx = q.Options.findIndex(o => o.correct === true);
    const isCorrect = selectedIdx === correctIdx;

    // Pinta visual
    paintOptions(form, selectedIdx, correctIdx);

    if (isCorrect) {
      announce(result, '✅ ¡Correcto!', 'ok');
      score++;
      updateScore();
    } else {
      announce(result, `❌ Incorrecto. Respuesta correcta: "${q.Options[correctIdx].text}"`, 'err');
    }

    // Registra
    answersLog.push({ qIndex: index, correct: isCorrect, selectedIndex: selectedIdx, correctIndex: correctIdx });

    corrected = true;
    btnNext.disabled = false;

    // Desbloquear "Más info" tras responder
    lockMore(details, false);

    // Carga diferida de contenido (conecta tu backend aquí)
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

    // Deshabilita opciones para que no cambien la respuesta
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
  // 100% en la barra
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
    // Reinicio del tema actual
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

// Utils
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
