const QUESTIONS = window.QUESTION_BANK || [];
const STORAGE_KEY = "ai-intro-quiz-state-v1";

const modes = {
  random: {
    title: "随机模式",
    description: "从完整题库中乱序出题。",
  },
  sequence: {
    title: "顺序模式",
    description: "按照题库原始题号顺序出题。",
  },
  wrong: {
    title: "错题模式",
    description: "按错题加入错题集的先后顺序出题。",
  },
};

let state = loadState();
let session = null;
let selected = new Set();
let answered = false;

function defaultState() {
  return {
    sequenceCursor: 0,
    randomCursor: 0,
    randomOrder: shuffle(QUESTIONS.map((q) => q.id)),
    wrongIds: [],
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed) return defaultState();
    const validIds = new Set(QUESTIONS.map((q) => q.id));
    const randomOrder = Array.isArray(parsed.randomOrder)
      ? parsed.randomOrder.filter((id) => validIds.has(id))
      : [];
    const wrongIds = Array.isArray(parsed.wrongIds)
      ? parsed.wrongIds.filter((id, index, arr) => validIds.has(id) && arr.indexOf(id) === index)
      : [];
    return {
      sequenceCursor: clampNumber(parsed.sequenceCursor, 0, QUESTIONS.length),
      randomCursor: clampNumber(parsed.randomCursor, 0, QUESTIONS.length),
      randomOrder: randomOrder.length === QUESTIONS.length ? randomOrder : shuffle(QUESTIONS.map((q) => q.id)),
      wrongIds,
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clampNumber(value, min, max) {
  const number = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, number));
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function questionById(id) {
  return QUESTIONS.find((question) => question.id === id);
}

function renderHome() {
  session = null;
  answered = false;
  selected = new Set();
  const app = document.querySelector("#app");
  app.className = "app-shell";
  app.innerHTML = `
    <section class="topbar">
      <div class="title-group">
        <h1>人工智能导论题库练习</h1>
        <p>题库共 ${QUESTIONS.length} 道题，练习记录保存在当前浏览器。</p>
      </div>
      <button class="reset-btn" type="button" data-action="reset">重置进度</button>
    </section>
    <section class="mode-grid">
      ${modeCard("random", state.randomCursor, QUESTIONS.length)}
      ${modeCard("sequence", state.sequenceCursor, QUESTIONS.length)}
      ${modeCard("wrong", state.wrongIds.length, null)}
    </section>
  `;
}

function modeCard(mode, current, total) {
  const progress = total ? Math.round((current / total) * 100) : 0;
  const value = total ? `${current} / ${total}` : `${current} 道`;
  return `
    <button class="mode-card" type="button" data-mode="${mode}">
      <h2>${modes[mode].title}</h2>
      <p>${modes[mode].description}</p>
      <div class="stat-row">
        <span>${mode === "wrong" ? "当前错题" : "做题进度"}</span>
        <span class="stat-value">${value}</span>
      </div>
      ${total ? `<div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div>` : ""}
    </button>
  `;
}

function startMode(mode) {
  if (mode === "random" && state.randomCursor >= QUESTIONS.length) {
    state.randomCursor = 0;
    state.randomOrder = shuffle(QUESTIONS.map((q) => q.id));
    saveState();
  }

  if (mode === "sequence" && state.sequenceCursor >= QUESTIONS.length) {
    state.sequenceCursor = 0;
    saveState();
  }

  const ids = getModeIds(mode);
  if (!ids.length) {
    renderEmptyWrong();
    return;
  }

  session = { mode, ids, cursor: 0 };
  selected = new Set();
  answered = false;
  renderQuestion();
}

function getModeIds(mode) {
  if (mode === "random") return state.randomOrder.slice(state.randomCursor);
  if (mode === "sequence") return QUESTIONS.slice(state.sequenceCursor).map((q) => q.id);
  return [...state.wrongIds];
}

function renderEmptyWrong() {
  const app = document.querySelector("#app");
  app.className = "app-shell quiz-panel";
  app.innerHTML = `
    <section class="topbar">
      <button class="exit-btn" type="button" data-action="exit">退出</button>
    </section>
    <section class="empty-state">
      <h2>错题集为空</h2>
      <p>随机模式或顺序模式中做错的题会自动进入错题集。</p>
      <button class="next-btn" type="button" data-action="exit">返回目录</button>
    </section>
  `;
}

function renderQuestion() {
  const id = session.ids[session.cursor];
  const question = questionById(id);
  const total = session.mode === "wrong" ? session.ids.length : QUESTIONS.length;
  const progress = getDisplayProgress();
  const isMulti = question.answers.length > 1;
  const app = document.querySelector("#app");
  app.className = "app-shell quiz-panel";
  app.innerHTML = `
    <section class="topbar">
      <button class="exit-btn" type="button" data-action="exit">退出</button>
      <div class="title-group">
        <h1>${modes[session.mode].title}</h1>
        <p>${progress} / ${total}</p>
      </div>
    </section>
    <article class="question-card">
      <div class="question-meta">
        <span class="tag">题号 ${question.id}</span>
        ${isMulti ? `<span class="tag">多选题</span>` : `<span class="tag">单选题</span>`}
      </div>
      <p class="stem">${escapeHtml(question.stem)}</p>
      <div class="options">
        ${question.options.map((option) => optionMarkup(option, question)).join("")}
      </div>
      <div class="action-row">
        ${isMulti && !answered ? `<button class="submit-btn" type="button" data-action="submit" ${selected.size ? "" : "disabled"}>提交答案</button>` : ""}
        ${answered ? `<button class="next-btn" type="button" data-action="next">下一题</button>` : ""}
      </div>
    </article>
  `;
}

function getDisplayProgress() {
  if (session.mode === "random") return Math.min(QUESTIONS.length, state.randomCursor + 1);
  if (session.mode === "sequence") return Math.min(QUESTIONS.length, state.sequenceCursor + 1);
  return Math.min(session.ids.length, session.cursor + 1);
}

function optionMarkup(option, question) {
  const isCorrect = question.answers.includes(option.label);
  const isSelected = selected.has(option.label);
  const classes = ["option-btn"];
  if (!answered && isSelected) classes.push("selected");
  if (answered && isCorrect) classes.push("correct");
  if (answered && isSelected && !isCorrect) classes.push("wrong");
  return `
    <button class="${classes.join(" ")}" type="button" data-option="${option.label}" ${answered ? "disabled" : ""}>
      <span class="option-label">${option.label}</span>
      <span class="option-text">${escapeHtml(option.text)}</span>
    </button>
  `;
}

function chooseOption(label) {
  if (!session || answered) return;
  const question = questionById(session.ids[session.cursor]);

  if (question.answers.length === 1) {
    selected = new Set([label]);
    finishAnswer();
    return;
  }

  if (selected.has(label)) {
    selected.delete(label);
  } else {
    selected.add(label);
  }
  renderQuestion();
}

function finishAnswer() {
  if (!session || !selected.size) return;
  const question = questionById(session.ids[session.cursor]);
  answered = true;
  const correct = setsEqual(selected, new Set(question.answers));

  if (session.mode === "wrong") {
    if (correct) removeWrong(question.id);
  } else {
    if (!correct) addWrong(question.id);
  }

  saveState();
  renderQuestion();
}

function nextQuestion() {
  if (!session || !answered) return;
  const currentId = session.ids[session.cursor];

  if (session.mode === "random") state.randomCursor = Math.min(QUESTIONS.length, state.randomCursor + 1);
  if (session.mode === "sequence") state.sequenceCursor = Math.min(QUESTIONS.length, state.sequenceCursor + 1);
  saveState();

  if (session.mode === "wrong" && !state.wrongIds.includes(currentId)) {
    session.ids.splice(session.cursor, 1);
  } else {
    session.cursor += 1;
  }

  selected = new Set();
  answered = false;

  if (session.cursor >= session.ids.length) {
    renderHome();
    return;
  }

  renderQuestion();
}

function addWrong(id) {
  if (!state.wrongIds.includes(id)) state.wrongIds.push(id);
}

function removeWrong(id) {
  state.wrongIds = state.wrongIds.filter((wrongId) => wrongId !== id);
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  return [...a].every((item) => b.has(item));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("click", (event) => {
  const modeButton = event.target.closest("[data-mode]");
  if (modeButton) {
    startMode(modeButton.dataset.mode);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === "exit") renderHome();
    if (action === "submit") finishAnswer();
    if (action === "next") nextQuestion();
    if (action === "reset" && confirm("确定要清空做题进度和错题集吗？")) {
      state = defaultState();
      saveState();
      renderHome();
    }
    return;
  }

  const optionButton = event.target.closest("[data-option]");
  if (optionButton) chooseOption(optionButton.dataset.option);
});

renderHome();
