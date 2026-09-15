import { ALPHABET, VOCAB_CATEGORIES, SENTENCES, LESSONS } from "./data.js";
import { isConfigured } from "./supabaseClient.js";
import { getCurrentUser, signUp, signIn, signOut, onAuthChange } from "./auth.js";
import { getProfile, addXp, markItem, getAllProgress, getLeaderboard, logScore } from "./progress.js";
import { speakFarsi } from "./tts.js";

const view = document.getElementById("view");
const tabbar = document.getElementById("tabbar");
const topbarStats = document.getElementById("topbarStats");
const statXp = document.getElementById("statXp");
const statUsername = document.getElementById("statUsername");
const toastEl = document.getElementById("toast");

let user = null;
let profile = { username: "ضيف", xp: 0 };
let progressMap = {};

// ------------------------------------------------------------------
// أدوات مساعدة عامة
// ------------------------------------------------------------------
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sample(arr, n) { return shuffle(arr).slice(0, n); }

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function navigate(hash) {
  location.hash = hash;
}

function speakBtn(text) {
  return `<button class="icon-btn speak-btn" data-say="${encodeURIComponent(text)}" aria-label="استمع للنطق" title="استمع">🔊</button>`;
}

function bindSpeakButtons(root = document) {
  root.querySelectorAll(".speak-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      speakFarsi(decodeURIComponent(btn.dataset.say));
    });
  });
}

// خريطة موحّدة لكل عناصر المفردات (لإسناد معرّف فريد يُستخدم في التقدّم والاختبارات)
function flatVocab() {
  const out = [];
  for (const cat of VOCAB_CATEGORIES) {
    cat.words.forEach((w, i) => out.push({ ...w, catId: cat.id, catTitle: cat.title, id: `${cat.id}_${i}` }));
  }
  return out;
}

async function awardXp(amount) {
  if (!user) return;
  const newXp = await addXp(user, amount);
  profile.xp = newXp;
  statXp.textContent = newXp;
}

// ------------------------------------------------------------------
// المصادقة
// ------------------------------------------------------------------
async function init() {
  user = await getCurrentUser();
  if (isConfigured) {
    onAuthChange(async (session) => {
      if (session?.user) {
        user = session.user;
        await loadProfileAndProgress();
        updateTopbar();
        if (location.hash === "#auth" || location.hash === "") navigate("#dashboard");
      }
    });
  }

  document.getElementById("brandHome").addEventListener("click", () => navigate(user ? "#dashboard" : "#auth"));
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await signOut();
    user = isConfigured ? null : user;
    location.reload();
  });
  tabbar.addEventListener("click", (e) => {
    const btn = e.target.closest(".tabbar__btn");
    if (btn) navigate(`#${btn.dataset.route}`);
  });

  window.addEventListener("hashchange", route);

  if (user) {
    await loadProfileAndProgress();
    updateTopbar();
  }

  if (!location.hash) {
    navigate(isConfigured && !user ? "#auth" : "#dashboard");
  } else {
    route();
  }
}

async function loadProfileAndProgress() {
  try {
    profile = await getProfile(user);
    progressMap = await getAllProgress(user);
  } catch (err) {
    console.error(err);
  }
}

function updateTopbar() {
  const loggedIn = !!user;
  topbarStats.hidden = !loggedIn;
  tabbar.hidden = !loggedIn;
  if (loggedIn) {
    statXp.textContent = profile.xp || 0;
    statUsername.textContent = profile.username || "ضيف";
  }
}

// ------------------------------------------------------------------
// التوجيه (Router)
// ------------------------------------------------------------------
function route() {
  const [path, ...rest] = location.hash.replace("#", "").split("/");
  window.scrollTo(0, 0);
  highlightTab(path);

  if (!user && path !== "auth") { navigate("#auth"); return; }

  switch (path) {
    case "auth": return renderAuth();
    case "dashboard": return renderDashboard();
    case "alphabet": return renderAlphabet();
    case "vocab": return rest[0] ? renderVocabList(rest[0]) : renderVocabCategories();
    case "sentences": return renderSentences();
    case "flashcards": return renderFlashcards(rest[0], rest[1]);
    case "quiz-setup": return renderQuizSetup();
    case "quiz": return renderQuiz(rest[0], rest[1]);
    case "lessons": return renderLessons();
    case "lesson": return renderLesson(rest[0]);
    case "leaderboard": return renderLeaderboard();
    case "profile": return renderProfile();
    default: return renderDashboard();
  }
}

function highlightTab(path) {
  tabbar.querySelectorAll(".tabbar__btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.route === path);
  });
}

// ------------------------------------------------------------------
// شاشة الدخول / إنشاء حساب
// ------------------------------------------------------------------
function renderAuth() {
  topbarStats.hidden = true;
  tabbar.hidden = true;

  const configNote = !isConfigured
    ? `<div class="config-banner">⚠️ لم يتم ضبط بيانات Supabase بعد في <code>js/config.js</code>، لذلك ستعمل اللعبة في وضع "ضيف" محليًا في هذا المتصفح فقط (بدون حفظ سحابي أو لوحة صدارة). راجع ملف README لإعداد Supabase.</div>`
    : "";

  view.innerHTML = `
    <div class="hero">
      <div class="hero__farsi">بوستان</div>
      <h1>ابدأ رحلتك في تعلّم الفارسية</h1>
      <p>الأبجدية، المفردات، الجمل، بطاقات تعليمية، اختبارات، ولوحة صدارة — كل ذلك بأسلوب تفاعلي وممتع.</p>
    </div>
    ${configNote}
    <div class="tile form">
      <div class="tabs">
        <button data-tab="login" class="active">تسجيل الدخول</button>
        <button data-tab="signup">حساب جديد</button>
      </div>
      <form id="authForm">
        <div class="field" id="usernameField" hidden>
          <label>اسم المستخدم</label>
          <input type="text" id="username" autocomplete="nickname" />
        </div>
        <div class="field">
          <label>البريد الإلكتروني</label>
          <input type="email" id="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label>كلمة المرور</label>
          <input type="password" id="password" autocomplete="current-password" required minlength="6" />
        </div>
        <div class="form-error" id="authError"></div>
        <button type="submit" class="btn btn--primary btn--block" id="authSubmit">تسجيل الدخول</button>
      </form>
      <div class="form-note">
        ${isConfigured ? `أو <button class="linklike" id="guestBtn">تابع كضيف بدون حساب</button>` : `<button class="linklike" id="guestBtn">تابع كضيف الآن</button>`}
      </div>
    </div>
  `;

  let mode = "login";
  const tabs = view.querySelectorAll(".tabs button");
  const usernameField = document.getElementById("usernameField");
  const submitBtn = document.getElementById("authSubmit");
  tabs.forEach((t) => t.addEventListener("click", () => {
    mode = t.dataset.tab;
    tabs.forEach((x) => x.classList.toggle("active", x === t));
    usernameField.hidden = mode !== "signup";
    submitBtn.textContent = mode === "signup" ? "إنشاء الحساب" : "تسجيل الدخول";
  }));

  document.getElementById("guestBtn").addEventListener("click", async () => {
    user = await getCurrentUser(); // guest fallback profile
    user.isGuest = true;
    await loadProfileAndProgress();
    updateTopbar();
    navigate("#dashboard");
  });

  document.getElementById("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const username = document.getElementById("username").value.trim();
    const errorEl = document.getElementById("authError");
    errorEl.textContent = "";
    submitBtn.disabled = true;
    try {
      if (!isConfigured) throw new Error("NOT_CONFIGURED");
      if (mode === "signup") {
        if (!username) throw new Error("يرجى إدخال اسم المستخدم");
        await signUp(email, password, username);
        toast("تم إنشاء الحساب! تحقق من بريدك إذا طُلب تأكيد.");
      }
      const data = await signIn(email, password);
      user = data.user;
      await loadProfileAndProgress();
      updateTopbar();
      navigate("#dashboard");
    } catch (err) {
      if (err.message === "NOT_CONFIGURED") {
        errorEl.textContent = "لم يتم ضبط Supabase بعد — استخدم زر المتابعة كضيف.";
      } else {
        errorEl.textContent = err.message || "حدث خطأ ما، حاول مجددًا.";
      }
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ------------------------------------------------------------------
// لوحة التحكم
// ------------------------------------------------------------------
function renderDashboard() {
  const items = [
    { route: "alphabet", icon: "ا", title: "الأبجدية الفارسية", desc: "تعرّف على ٣٢ حرفًا مع النطق والأمثلة" },
    { route: "vocab", icon: "❖", title: "المفردات", desc: "٦ مجموعات: تحيات، أرقام، عائلة، ألوان..." },
    { route: "sentences", icon: "✎", title: "جمل بسيطة", desc: "١٥ جملة يومية مع الترجمة والنطق" },
    { route: "flashcards/mixed", icon: "▤", title: "بطاقات تعليمية", desc: "مراجعة سريعة عشوائية لكل المحتوى" },
    { route: "lessons", icon: "✦", title: "الدروس المصغّرة", desc: "١٣ درسًا تدريجيًا من الصفر" },
    { route: "quiz-setup", icon: "◈", title: "اختبار", desc: "اختبر معلوماتك واكسب نقاط خبرة" },
    { route: "leaderboard", icon: "☆", title: "لوحة الصدارة", desc: "شاهد ترتيبك بين المتعلمين" },
    { route: "profile", icon: "☾", title: "ملفي الشخصي", desc: "تقدّمك، نقاطك، وإحصائياتك" },
  ];
  view.innerHTML = `
    <div class="hero">
      <div class="hero__farsi">خوش آمدید</div>
      <h1>أهلًا بك، ${escapeHtml(profile.username || "ضيف")}</h1>
      <p>اختر من أين تريد أن تبدأ اليوم. كل نشاط تكمله يمنحك نقاط خبرة (XP).</p>
    </div>
    <div class="grid">
      ${items.map((it) => `
        <button class="tile menu-card" data-route="${it.route}">
          <span class="menu-card__icon">${it.icon}</span>
          <span class="menu-card__title">${it.title}</span>
          <p class="menu-card__desc">${it.desc}</p>
        </button>
      `).join("")}
    </div>
  `;
  view.querySelectorAll("[data-route]").forEach((el) =>
    el.addEventListener("click", () => navigate(`#${el.dataset.route}`))
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ------------------------------------------------------------------
// الأبجدية
// ------------------------------------------------------------------
function renderAlphabet() {
  view.innerHTML = `
    <button class="back-link" id="back">→ رجوع</button>
    <h1>الأبجدية الفارسية</h1>
    <p>٣٢ حرفًا. اضغط على مكبر الصوت للاستماع للنطق.</p>
    <div class="btn-row">
      <button class="btn btn--primary" id="practiceBtn">تدرّب بالبطاقات التعليمية</button>
      <button class="btn btn--ghost" id="quizBtn">اختبار سريع على الأبجدية</button>
    </div>
    <div class="list" id="letterList"></div>
  `;
  const list = document.getElementById("letterList");
  list.innerHTML = ALPHABET.map((l, i) => {
    const mastered = progressMap[`alphabet:${i}`]?.mastered;
    return `
    <div class="list-row">
      <div class="list-row__main">
        <span class="list-row__fa">${l.letter}</span>
        <div>
          <div>${l.name} <span class="translit">/${l.sound}/</span></div>
          <div class="list-row__sub">مثال: <span class="farsi">${l.example}</span> <span class="translit">(${l.exTr})</span> — ${l.exMeaning}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${mastered ? '<span class="badge">مُتقن</span>' : ""}
        ${speakBtn(l.example)}
      </div>
    </div>`;
  }).join("");
  bindSpeakButtons(list);
  document.getElementById("back").addEventListener("click", () => navigate("#dashboard"));
  document.getElementById("practiceBtn").addEventListener("click", () => navigate("#flashcards/alphabet"));
  document.getElementById("quizBtn").addEventListener("click", () => navigate("#quiz/alphabet"));
}

// ------------------------------------------------------------------
// المفردات
// ------------------------------------------------------------------
function renderVocabCategories() {
  view.innerHTML = `
    <button class="back-link" id="back">→ رجوع</button>
    <h1>المفردات</h1>
    <p>اختر مجموعة كلمات لاستعراضها والتدرب عليها.</p>
    <div class="grid">
      ${VOCAB_CATEGORIES.map((c) => `
        <button class="tile menu-card" data-cat="${c.id}">
          <span class="menu-card__icon">${c.icon}</span>
          <span class="menu-card__title">${c.title}</span>
          <p class="menu-card__desc">${c.words.length} كلمات</p>
        </button>
      `).join("")}
    </div>
  `;
  document.getElementById("back").addEventListener("click", () => navigate("#dashboard"));
  view.querySelectorAll("[data-cat]").forEach((el) =>
    el.addEventListener("click", () => navigate(`#vocab/${el.dataset.cat}`))
  );
}

function renderVocabList(catId) {
  const cat = VOCAB_CATEGORIES.find((c) => c.id === catId);
  if (!cat) return renderVocabCategories();
  view.innerHTML = `
    <button class="back-link" id="back">→ كل المجموعات</button>
    <h1>${cat.icon} ${cat.title}</h1>
    <div class="btn-row">
      <button class="btn btn--primary" id="practiceBtn">تدرّب بالبطاقات التعليمية</button>
      <button class="btn btn--ghost" id="quizBtn">اختبار على هذه المجموعة</button>
    </div>
    <div class="list" id="vocabList"></div>
  `;
  const list = document.getElementById("vocabList");
  list.innerHTML = cat.words.map((w, i) => {
    const mastered = progressMap[`vocab:${cat.id}_${i}`]?.mastered;
    return `
    <div class="list-row">
      <div class="list-row__main">
        <span class="list-row__fa">${w.fa}</span>
        <div>
          <div class="translit">${w.tr}</div>
          <div class="list-row__sub">${w.ar}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${mastered ? '<span class="badge">مُتقن</span>' : ""}
        ${speakBtn(w.fa)}
      </div>
    </div>`;
  }).join("");
  bindSpeakButtons(list);
  document.getElementById("back").addEventListener("click", () => navigate("#vocab"));
  document.getElementById("practiceBtn").addEventListener("click", () => navigate(`#flashcards/vocab/${cat.id}`));
  document.getElementById("quizBtn").addEventListener("click", () => navigate(`#quiz/vocab/${cat.id}`));
}

// ------------------------------------------------------------------
// الجمل
// ------------------------------------------------------------------
function renderSentences() {
  view.innerHTML = `
    <button class="back-link" id="back">→ رجوع</button>
    <h1>جمل بسيطة</h1>
    <p>استمع واقرأ جملًا فارسية شائعة مع ترجمتها.</p>
    <div class="list" id="sentList"></div>
  `;
  const list = document.getElementById("sentList");
  list.innerHTML = SENTENCES.map((s) => `
    <div class="list-row">
      <div class="list-row__main">
        <div>
          <div class="list-row__fa" style="font-size:18px;">${s.fa}</div>
          <div class="translit">${s.tr}</div>
          <div class="list-row__sub">${s.ar}</div>
        </div>
      </div>
      ${speakBtn(s.fa)}
    </div>
  `).join("");
  bindSpeakButtons(list);
  document.getElementById("back").addEventListener("click", () => navigate("#dashboard"));
}

// ------------------------------------------------------------------
// البطاقات التعليمية (Flashcards)
// ------------------------------------------------------------------
function buildFlashcardDeck(type, catId) {
  if (type === "alphabet") {
    return ALPHABET.map((l, i) => ({
      id: `alphabet:${i}`, itemType: "alphabet", itemId: String(i),
      front: l.letter, tr: `/${l.sound}/ — ${l.name}`, back: `${l.example} (${l.exTr})`, meaning: l.exMeaning,
      say: l.example,
    }));
  }
  if (type === "vocab") {
    const words = catId ? VOCAB_CATEGORIES.find((c) => c.id === catId)?.words.map((w, i) => ({ ...w, id: `${catId}_${i}` })) || [] : flatVocab();
    return words.map((w) => ({
      id: `vocab:${w.id}`, itemType: "vocab", itemId: w.id,
      front: w.fa, tr: w.tr, back: w.ar, meaning: w.ar, say: w.fa,
    }));
  }
  if (type === "sentences") {
    return SENTENCES.map((s, i) => ({
      id: `sentence:${i}`, itemType: "sentence", itemId: String(i),
      front: s.fa, tr: s.tr, back: s.ar, meaning: s.ar, say: s.fa,
    }));
  }
  // mixed: خليط من كل المحتوى
  return shuffle([
    ...buildFlashcardDeck("alphabet"),
    ...buildFlashcardDeck("vocab"),
    ...buildFlashcardDeck("sentences"),
  ]).slice(0, 20);
}

function renderFlashcards(type, catId) {
  const deck = shuffle(buildFlashcardDeck(type, catId));
  let idx = 0;
  let known = 0;
  const total = deck.length;

  function draw() {
    if (idx >= total) return finish();
    const card = deck[idx];
    view.innerHTML = `
      <button class="back-link" id="back">→ خروج</button>
      <div class="flash-progress">
        <span>${idx + 1} / ${total}</span>
        <div class="progressbar"><div class="progressbar__fill" style="width:${(idx / total) * 100}%"></div></div>
      </div>
      <div class="flashcard-wrap">
        <div class="flashcard" id="card">
          <div class="flashcard__face">
            <div class="flashcard__word farsi">${card.front}</div>
            <div class="translit">${card.tr}</div>
            ${speakBtn(card.say)}
            <div class="flashcard__hint">اضغط للكشف عن المعنى</div>
          </div>
          <div class="flashcard__face flashcard__face--back">
            <div class="flashcard__meaning">${card.back}</div>
            <div class="flashcard__hint">اضغط للعودة</div>
          </div>
        </div>
      </div>
      <div class="flash-actions">
        <button class="btn" id="needReview">أحتاج مراجعة ↻</button>
        <button class="btn btn--primary" id="knowIt">أعرفها ✓</button>
      </div>
    `;
    bindSpeakButtons(view);
    const cardEl = document.getElementById("card");
    cardEl.addEventListener("click", () => cardEl.classList.toggle("flipped"));
    document.getElementById("back").addEventListener("click", () => navigate("#dashboard"));
    document.getElementById("knowIt").addEventListener("click", () => { known++; mark(true); });
    document.getElementById("needReview").addEventListener("click", () => mark(false));

    function mark(masteredNow) {
      markItem(user, card.itemType, card.itemId, masteredNow);
      progressMap[card.id] = { mastered: masteredNow };
      idx++;
      draw();
    }
  }

  async function finish() {
    const xp = Math.round((known / total) * 30) + 5;
    await awardXp(xp);
    view.innerHTML = `
      <div class="tile center" style="max-width:420px;margin:40px auto;">
        <h2>أحسنت! 🎉</h2>
        <p>راجعت ${total} بطاقة، وعرفت ${known} منها.</p>
        <p class="badge">+${xp} XP</p>
        <div class="btn-row" style="justify-content:center;">
          <button class="btn btn--primary" id="again">مراجعة أخرى</button>
          <button class="btn btn--ghost" id="home">الرئيسية</button>
        </div>
      </div>
    `;
    document.getElementById("again").addEventListener("click", () => navigate(`#flashcards/${type}${catId ? "/" + catId : ""}`));
    document.getElementById("home").addEventListener("click", () => navigate("#dashboard"));
  }

  draw();
}

// ------------------------------------------------------------------
// الاختبار (Quiz)
// ------------------------------------------------------------------
function buildQuestionPool(topic, catId) {
  if (topic === "alphabet") {
    return ALPHABET.map((l, i) => ({
      id: `alphabet:${i}`, itemType: "alphabet", itemId: String(i),
      prompt: "ما نطق هذا الحرف؟", word: l.letter, correct: `${l.name} — /${l.sound}/`,
      pool: ALPHABET.map((x) => `${x.name} — /${x.sound}/`),
    }));
  }
  if (topic === "vocab") {
    const words = catId ? VOCAB_CATEGORIES.find((c) => c.id === catId)?.words.map((w, i) => ({ ...w, id: `${catId}_${i}` })) || [] : flatVocab();
    return words.map((w) => ({
      id: `vocab:${w.id}`, itemType: "vocab", itemId: w.id,
      prompt: "ما معنى هذه الكلمة؟", word: w.fa, correct: w.ar, pool: flatVocab().map((x) => x.ar),
    }));
  }
  if (topic === "sentences") {
    return SENTENCES.map((s, i) => ({
      id: `sentence:${i}`, itemType: "sentence", itemId: String(i),
      prompt: "ما معنى هذه الجملة؟", word: s.fa, correct: s.ar, pool: SENTENCES.map((x) => x.ar),
    }));
  }
  // mixed
  return shuffle([
    ...buildQuestionPool("alphabet"),
    ...buildQuestionPool("vocab"),
    ...buildQuestionPool("sentences"),
  ]);
}

function renderQuizSetup() {
  view.innerHTML = `
    <button class="back-link" id="back">→ رجوع</button>
    <h1>اختبار</h1>
    <p>اختر الموضوع الذي تريد اختبار نفسك فيه.</p>
    <div class="grid">
      <button class="tile menu-card" data-topic="mixed"><span class="menu-card__icon">◈</span><span class="menu-card__title">اختبار شامل</span><p class="menu-card__desc">خليط من كل المحتوى</p></button>
      <button class="tile menu-card" data-topic="alphabet"><span class="menu-card__icon">ا</span><span class="menu-card__title">الأبجدية</span><p class="menu-card__desc">نطق الحروف</p></button>
      <button class="tile menu-card" data-topic="vocab"><span class="menu-card__icon">❖</span><span class="menu-card__title">المفردات</span><p class="menu-card__desc">كل الكلمات</p></button>
      <button class="tile menu-card" data-topic="sentences"><span class="menu-card__icon">✎</span><span class="menu-card__title">الجمل</span><p class="menu-card__desc">١٥ جملة</p></button>
    </div>
  `;
  document.getElementById("back").addEventListener("click", () => navigate("#dashboard"));
  view.querySelectorAll("[data-topic]").forEach((el) =>
    el.addEventListener("click", () => navigate(`#quiz/${el.dataset.topic}`))
  );
}

function renderQuiz(topic, catId) {
  if (!topic) return renderQuizSetup();
  const pool = buildQuestionPool(topic, catId);
  const questions = sample(pool, Math.min(10, pool.length)).map((q) => {
    const wrongOptions = sample(q.pool.filter((o) => o !== q.correct), 3);
    return { ...q, options: shuffle([q.correct, ...wrongOptions]) };
  });
  let idx = 0;
  let correctCount = 0;

  function draw() {
    if (idx >= questions.length) return finish();
    const q = questions[idx];
    view.innerHTML = `
      <button class="back-link" id="back">→ خروج</button>
      <div class="flash-progress">
        <span>${idx + 1} / ${questions.length}</span>
        <div class="progressbar"><div class="progressbar__fill" style="width:${(idx / questions.length) * 100}%"></div></div>
      </div>
      <div class="quiz-q">
        <div class="quiz-q__prompt">${q.prompt}</div>
        <div class="quiz-q__word farsi">${q.word}</div>
        ${speakBtn(q.word)}
      </div>
      <div class="quiz-options" id="options">
        ${q.options.map((o, i) => `<button class="quiz-option" data-opt="${i}">${o}</button>`).join("")}
      </div>
      <div class="quiz-status" id="status"></div>
    `;
    bindSpeakButtons(view);
    document.getElementById("back").addEventListener("click", () => navigate("#dashboard"));
    const optionsEl = document.getElementById("options");
    optionsEl.querySelectorAll(".quiz-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chosen = q.options[Number(btn.dataset.opt)];
        const isCorrect = chosen === q.correct;
        optionsEl.querySelectorAll(".quiz-option").forEach((b) => (b.disabled = true));
        btn.classList.add(isCorrect ? "correct" : "incorrect");
        if (!isCorrect) {
          optionsEl.querySelectorAll(".quiz-option").forEach((b) => {
            if (b.textContent === q.correct) b.classList.add("correct");
          });
        } else {
          correctCount++;
        }
        markItem(user, q.itemType, q.itemId, isCorrect);
        document.getElementById("status").textContent = isCorrect ? "إجابة صحيحة! ✓" : "إجابة غير صحيحة";
        setTimeout(() => { idx++; draw(); }, 1100);
      });
    });
  }

  async function finish() {
    const pct = Math.round((correctCount / questions.length) * 100);
    const xp = Math.round(correctCount * 4) + 5;
    await awardXp(xp);
    await logScore(user, "quiz", pct, xp);
    view.innerHTML = `
      <div class="tile center" style="max-width:420px;margin:40px auto;">
        <h2>${pct >= 70 ? "نتيجة رائعة! 🏆" : "استمر بالتدريب! 💪"}</h2>
        <p>أجبت بشكل صحيح على ${correctCount} من ${questions.length} (${pct}%)</p>
        <p class="badge">+${xp} XP</p>
        <div class="btn-row" style="justify-content:center;">
          <button class="btn btn--primary" id="again">اختبار آخر</button>
          <button class="btn btn--ghost" id="home">الرئيسية</button>
        </div>
      </div>
    `;
    document.getElementById("again").addEventListener("click", () => navigate("#quiz-setup"));
    document.getElementById("home").addEventListener("click", () => navigate("#dashboard"));
  }

  draw();
}

// ------------------------------------------------------------------
// الدروس المصغّرة
// ------------------------------------------------------------------
function renderLessons() {
  view.innerHTML = `
    <h1>الدروس المصغّرة</h1>
    <p>سلسلة من ١٣ درسًا قصيرًا تأخذك من الصفر خطوة بخطوة.</p>
    <div class="list" id="lessonList"></div>
  `;
  const list = document.getElementById("lessonList");
  list.innerHTML = LESSONS.map((l) => {
    const done = progressMap[`lesson:${l.id}`]?.mastered;
    return `
    <div class="list-row" data-lesson="${l.id}" style="cursor:pointer;">
      <div class="list-row__main">
        <div>
          <div>${l.title}</div>
          <div class="list-row__sub">+${l.xp} XP</div>
        </div>
      </div>
      ${done ? '<span class="badge">مكتمل ✓</span>' : '<span class="muted">ابدأ ›</span>'}
    </div>`;
  }).join("");
  list.querySelectorAll("[data-lesson]").forEach((row) =>
    row.addEventListener("click", () => navigate(`#lesson/${row.dataset.lesson}`))
  );
}

function renderLesson(id) {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) return renderLessons();

  let items = [];
  if (lesson.type === "vocab") {
    const cat = VOCAB_CATEGORIES.find((c) => c.id === lesson.categoryId);
    items = cat.words.map((w, i) => ({ id: `vocab:${lesson.categoryId}_${i}`, itemType: "vocab", itemId: `${lesson.categoryId}_${i}`, fa: w.fa, tr: w.tr, ar: w.ar }));
  } else if (lesson.type === "alphabet") {
    items = ALPHABET.slice(...lesson.range).map((l, i) => {
      const realIdx = lesson.range[0] + i;
      return { id: `alphabet:${realIdx}`, itemType: "alphabet", itemId: String(realIdx), fa: l.letter, tr: `${l.name} /${l.sound}/`, ar: `${l.example} — ${l.exMeaning}` };
    });
  } else if (lesson.type === "sentences") {
    items = SENTENCES.slice(...lesson.range).map((s, i) => {
      const realIdx = lesson.range[0] + i;
      return { id: `sentence:${realIdx}`, itemType: "sentence", itemId: String(realIdx), fa: s.fa, tr: s.tr, ar: s.ar };
    });
  }

  let stage = "teach"; // teach -> quiz -> done
  let qIdx = 0;
  let correctCount = 0;
  const questions = shuffle(items).map((it) => {
    const wrongPool = items.filter((x) => x.id !== it.id).map((x) => x.ar);
    const others = wrongPool.length >= 3 ? sample(wrongPool, 3) : sample(flatVocab().map((v) => v.ar), 3);
    return { ...it, options: shuffle([it.ar, ...others]) };
  });

  function drawTeach() {
    view.innerHTML = `
      <button class="back-link" id="back">→ خروج</button>
      <h1>${lesson.title}</h1>
      <p>تعرّف على العناصر التالية قبل التمرين.</p>
      <div class="list">
        ${items.map((it) => `
          <div class="list-row">
            <div class="list-row__main">
              <span class="list-row__fa">${it.fa}</span>
              <div>
                <div class="translit">${it.tr}</div>
                <div class="list-row__sub">${it.ar}</div>
              </div>
            </div>
            ${speakBtn(it.fa)}
          </div>
        `).join("")}
      </div>
      <div class="btn-row"><button class="btn btn--primary btn--block" id="startQuiz">ابدأ التمرين ›</button></div>
    `;
    bindSpeakButtons(view);
    document.getElementById("back").addEventListener("click", () => navigate("#lessons"));
    document.getElementById("startQuiz").addEventListener("click", () => { stage = "quiz"; drawQuiz(); });
  }

  function drawQuiz() {
    if (qIdx >= questions.length) return drawDone();
    const q = questions[qIdx];
    view.innerHTML = `
      <button class="back-link" id="back">→ خروج</button>
      <div class="flash-progress">
        <span>${qIdx + 1} / ${questions.length}</span>
        <div class="progressbar"><div class="progressbar__fill" style="width:${(qIdx / questions.length) * 100}%"></div></div>
      </div>
      <div class="quiz-q">
        <div class="quiz-q__prompt">ما معنى هذا العنصر؟</div>
        <div class="quiz-q__word farsi">${q.fa}</div>
        ${speakBtn(q.fa)}
      </div>
      <div class="quiz-options" id="options">
        ${q.options.map((o, i) => `<button class="quiz-option" data-opt="${i}">${o}</button>`).join("")}
      </div>
    `;
    bindSpeakButtons(view);
    document.getElementById("back").addEventListener("click", () => navigate("#lessons"));
    const optionsEl = document.getElementById("options");
    optionsEl.querySelectorAll(".quiz-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chosen = q.options[Number(btn.dataset.opt)];
        const isCorrect = chosen === q.ar;
        optionsEl.querySelectorAll(".quiz-option").forEach((b) => (b.disabled = true));
        btn.classList.add(isCorrect ? "correct" : "incorrect");
        if (!isCorrect) {
          optionsEl.querySelectorAll(".quiz-option").forEach((b) => { if (b.textContent === q.ar) b.classList.add("correct"); });
        } else correctCount++;
        markItem(user, q.itemType, q.itemId, isCorrect);
        setTimeout(() => { qIdx++; drawQuiz(); }, 1000);
      });
    });
  }

  async function drawDone() {
    await markItem(user, "lesson", lesson.id, true);
    progressMap[`lesson:${lesson.id}`] = { mastered: true };
    await awardXp(lesson.xp);
    await logScore(user, "lesson", Math.round((correctCount / questions.length) * 100), lesson.xp);
    const idxInList = LESSONS.findIndex((l) => l.id === lesson.id);
    const next = LESSONS[idxInList + 1];
    view.innerHTML = `
      <div class="tile center" style="max-width:420px;margin:40px auto;">
        <h2>أحسنت! أكملت الدرس 🎉</h2>
        <p>${correctCount} من ${questions.length} إجابات صحيحة</p>
        <p class="badge">+${lesson.xp} XP</p>
        <div class="btn-row" style="justify-content:center;">
          ${next ? `<button class="btn btn--primary" id="next">الدرس التالي ›</button>` : ""}
          <button class="btn btn--ghost" id="home">قائمة الدروس</button>
        </div>
      </div>
    `;
    if (next) document.getElementById("next").addEventListener("click", () => navigate(`#lesson/${next.id}`));
    document.getElementById("home").addEventListener("click", () => navigate("#lessons"));
  }

  drawTeach();
}

// ------------------------------------------------------------------
// لوحة الصدارة
// ------------------------------------------------------------------
async function renderLeaderboard() {
  view.innerHTML = `<h1>لوحة الصدارة</h1><p>جارِ التحميل...</p>`;
  if (!isConfigured) {
    view.innerHTML = `
      <h1>لوحة الصدارة</h1>
      <div class="config-banner">لوحة الصدارة تتطلب ربط المشروع بـ Supabase حتى تُحفظ نقاط جميع المستخدمين. راجع ملف README لإعداد ذلك.</div>
    `;
    return;
  }
  try {
    const rows = await getLeaderboard();
    view.innerHTML = `
      <h1>لوحة الصدارة</h1>
      <p>أفضل ٢٠ متعلمًا حسب نقاط الخبرة (XP).</p>
      <div class="tile">
        ${rows.length ? rows.map((r, i) => `
          <div class="lb-row">
            <span class="lb-rank">${i + 1}</span>
            <span class="lb-name">${escapeHtml(r.username)}</span>
            <span class="lb-xp">${r.xp} XP</span>
          </div>
        `).join("") : `<p class="muted center">لا يوجد لاعبون بعد — كن أول من يسجّل نقاطًا!</p>`}
      </div>
    `;
  } catch (err) {
    view.innerHTML = `<h1>لوحة الصدارة</h1><p class="muted">تعذّر تحميل البيانات حاليًا.</p>`;
  }
}

// ------------------------------------------------------------------
// الملف الشخصي
// ------------------------------------------------------------------
function renderProfile() {
  const counts = { alphabet: 0, vocab: 0, sentence: 0, lesson: 0 };
  Object.entries(progressMap).forEach(([key, v]) => {
    if (!v.mastered) return;
    const type = key.split(":")[0];
    if (counts[type] !== undefined) counts[type]++;
  });
  view.innerHTML = `
    <h1>ملفي الشخصي</h1>
    <div class="tile">
      <h2>${escapeHtml(profile.username)}</h2>
      <p class="badge">${profile.xp || 0} XP</p>
      ${user?.isGuest ? `<p class="muted">أنت في وضع الضيف — بياناتك محفوظة على هذا المتصفح فقط.</p>` : ""}
    </div>
    <h3 style="margin-top:24px;">ما أتقنته حتى الآن</h3>
    <div class="grid">
      <div class="tile center"><div style="font-size:26px;color:var(--gold-soft);">${counts.alphabet}/32</div><div class="muted">حروف</div></div>
      <div class="tile center"><div style="font-size:26px;color:var(--gold-soft);">${counts.vocab}/${flatVocab().length}</div><div class="muted">كلمات</div></div>
      <div class="tile center"><div style="font-size:26px;color:var(--gold-soft);">${counts.sentence}/${SENTENCES.length}</div><div class="muted">جمل</div></div>
      <div class="tile center"><div style="font-size:26px;color:var(--gold-soft);">${counts.lesson}/${LESSONS.length}</div><div class="muted">دروس</div></div>
    </div>
  `;
}

init();
