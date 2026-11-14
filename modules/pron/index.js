// Module Prononciation : leçons sur les sons, exercices d'écoute et d'accent, dictées,
// et répétition au micro corrigée par l'IA (Groq Whisper).

import { h, es, icon, topbar, segmented, toast, fmtDate, fill } from "../../core/ui.js";
import { go, refresh, current } from "../../core/router.js";
import { normalize, shuffle, stripAccents } from "../../core/check.js";
import { render as renderMd } from "../../core/md.js";
import * as EX from "../../core/exercise.js";
import { createPronEngine, TYPES, QUIZ_TYPES } from "./engine.js";
import { renderSpeak } from "./speak.js";

let C, M, D, E;
let session = null;
const SESSION = "/pronunciation/serie/en-cours";
const LV = ["A1", "A2", "B1", "B2", "C1", "C2"];

const K = {
  reviewed: () => C.key("pron/reviewed"),
  stats: () => C.key("pron/stats"),
  tests: () => C.key("pron/tests"),
  tab: () => C.key("pron/tab"),
  setup: () => C.key("pron/setup"),
  speakSound: () => C.key("pron/speakSound"),
};
const reviewed = () => C.store.get(K.reviewed(), {});
const TYPE_LABELS = {
  ecoute: "Quel mot entends-tu ?",
  pareil: "Pareil ou différent ?",
  syllabe: "Où est l'accent ?",
  tilde: "Comment s'écrit-il ?",
  dictee: "Dictée",
  repetir: "Répéter au micro",
};
const TYPE_HINTS = {
  ecoute: "Distinguer des mots presque identiques (pero / perro).",
  pareil: "Reconnaître les mots qui sonnent pareil (casa / caza).",
  syllabe: "Trouver la syllabe forte d'un mot.",
  tilde: "Entendre l'accent et choisir la bonne orthographe.",
  dictee: "Écrire le mot entendu, accents compris.",
  repetir: "Parler et être corrigé (clé Groq dans les Réglages).",
};

async function data() {
  if (!D) {
    D = await C.loadJSON(C.pack.pronunciation.data);
    E = createPronEngine(D);
  }
}

export function register({ ctx, route }) {
  C = ctx;
  M = ctx.pack.modules.find((m) => m.id === "pronunciation");
  route("/pronunciation", async () => { await data(); return tabs(C.store.get(K.tab(), "lecons")); });
  route("/pronunciation/:tab", async ({ tab, q }) => { await data(); return tabs(tab, q); });
  route("/pronunciation/lecon/:id", async ({ id }) => { await data(); return lessonPage(id); });
  route("/pronunciation/dire/:w", async ({ w }) => { await data(); return sayPage(decodeURIComponent(w)); });
  route(SESSION, async () => { await data(); return sessionView(); });
}

export function summary() {
  const n = Object.keys(reviewed()).length;
  return n ? `${n} leçon${n > 1 ? "s" : ""} sur 15` : "Commencer";
}

const remember = (label) => C.store.set("nav/last", { path: current(), label });
const levelChip = (lvl) => h("span", { class: `chip lvl-${lvl.toLowerCase()}` }, lvl);
const say = (text) => h("button", { class: "icon-btn small", type: "button", "aria-label": `Écouter : ${text}`, onclick: () => C.audio.speak(text) }, icon("speaker"));
const screen = (...kids) => h("main", { class: "screen pron-screen", style: { "--band": M.color } }, ...kids);
const bar = (opts) => topbar({ color: M.color, ink: M.ink, ...opts });
const lessonTitle = (id) => E.lessonById[id]?.title || "";

const TABS = [
  { id: "lecons", label: "Leçons" },
  { id: "entrainement", label: "S'entraîner" },
  { id: "parler", label: "Parler" },
  { id: "test", label: "Tester" },
];

function tabs(tab, q = {}) {
  if (!TABS.some((t) => t.id === tab)) tab = "lecons";
  C.store.set(K.tab(), tab);
  remember(`Pronunciación, ${TABS.find((t) => t.id === tab).label.toLowerCase()}`);
  const hd = bar({ title: M.title, subtitle: M.subtitle });
  hd.append(segmented(TABS, tab, (id) => go(`/pronunciation/${id}`), { label: "Sections du module Prononciation" }));
  const body = { lecons: lessonsTab, entrainement: practiceTab, parler: speakTab, test: testTab }[tab](q);
  return screen(hd, h("section", { class: "sheet" }, body));
}

// ---------- Leçons ----------

function lessonsTab() {
  const rev = reviewed();
  return [
    h("p", { class: "lead" }, "Quinze leçons, des voyelles aux virelangues, avec la voix argentine de Daniela. Chaque leçon compare avec le français et signale ce qui change à Salta."),
    LV.map((lvl) => {
      const ls = E.lessons.filter((l) => l.level === lvl);
      if (!ls.length) return null;
      return [
        h("h2", { class: "section-title level-title" }, levelChip(lvl)),
        h("div", { class: "rows" }, ls.map((l) =>
          h("a", { class: "row link", href: `#/pronunciation/lecon/${l.id}` },
            h("span", { class: "row-text" }, h("span", { class: "row-title" }, l.title), h("span", { class: "row-sub es" }, l.es)),
            h("span", { class: "row-end" }, rev[l.id] ? h("span", { class: "done-mark" }, icon("check")) : null)
          )
        )),
      ];
    }),
  ];
}

function pairRows(groups, same) {
  return h("div", { class: "rows pair-rows" }, groups.map((g) =>
    h("div", { class: "row pair-row" },
      h("span", { class: "row-text pair-words" }, g.map((w, i) => [i ? h("span", { class: "muted" }, same ? " = " : " / ") : null, h("button", { class: "word-chip", type: "button", lang: "es", onclick: () => C.audio.speak(w) }, w)])),
      h("button", { class: "icon-btn small", type: "button", "aria-label": "Écouter la série", onclick: () => C.audio.speakSequence(g, 500) }, icon("play"))
    )
  ));
}

async function lessonPage(id) {
  const l = E.lessonById[id];
  if (!l) return tabs("lecons");
  const rev = reviewed();
  remember(`${l.title}, prononciation`);
  const prose = h("div", { class: "prose", html: renderMd(await C.loadText(l.md)) });
  prose.querySelectorAll("i[lang=es]").forEach((el) => {
    el.classList.add("say");
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.addEventListener("click", () => C.audio.speak(el.textContent));
  });
  const sample = E.wordsFor(l).filter((w) => w.src !== "vos" || l.tag === "vos").slice(0, 16);
  const label = (r) => (r ? `Leçon vue le ${fmtDate(r)}, retirer` : "Marquer la leçon comme vue");
  const btn = h("button", {
    class: `btn ${rev[id] ? "secondary" : ""}`, type: "button",
    onclick: () => {
      let now;
      C.store.update(K.reviewed(), {}, (r) => ((now = r[id] ? null : Date.now()), now ? (r[id] = now) : delete r[id], r));
      btn.textContent = label(now);
      btn.classList.toggle("secondary", !!now);
      toast(now ? "Ses exercices entreront dans tes séries et tes tests." : "Marque retirée.");
    },
  }, label(rev[id]));
  const idx = E.lessons.findIndex((x) => x.id === id);
  const next = E.lessons[idx + 1];
  return screen(
    bar({ title: l.title, subtitle: `${l.es}, niveau ${l.level}`, back: "#/pronunciation/lecons", lang: "fr" }),
    h("section", { class: "sheet" },
      prose,
      l.pairs.length ? [h("h2", { class: "section-title" }, "Paires à distinguer"), h("p", { class: "small muted" }, "Touche un mot pour l'écouter, ou le bouton pour écouter la série."), pairRows(l.pairs, false)] : null,
      l.same.length ? [h("h2", { class: "section-title" }, "Ces mots sonnent pareil"), pairRows(l.same, true)] : null,
      l.sentences.length ? [h("h2", { class: "section-title" }, "Phrases à répéter"), h("div", { class: "rows" }, l.sentences.map((s) => h("div", { class: "row" }, h("span", { class: "row-text" }, es(s, "sentence")), h("span", { class: "row-end" }, say(s), h("a", { class: "icon-btn small", href: `#/pronunciation/dire/${encodeURIComponent(s)}`, "aria-label": "Répéter au micro" }, icon("mic"))))))] : null,
      sample.length && !["trabalenguas", "entonacion", "argentina", "enlace"].includes(l.id) ? [h("h2", { class: "section-title" }, "Mots pour t'entraîner"), h("div", { class: "word-cloud" }, sample.map((w) => h("a", { class: "word-chip", lang: "es", href: `#/pronunciation/dire/${encodeURIComponent(w.w)}` }, w.w)))] : null,
      h("div", { class: "actions" },
        h("button", { class: "btn", type: "button", onclick: () => startPractice({ scope: "lessons", lessonIds: [id], types: QUIZ_TYPES, count: 15, back: `#/pronunciation/lecon/${id}` }) }, "S'entraîner sur ce son"),
        h("button", { class: "btn secondary", type: "button", onclick: () => startPractice({ scope: "lessons", lessonIds: [id], types: ["repetir"], count: 10, back: `#/pronunciation/lecon/${id}` }) }, icon("mic"), " Répéter au micro")
      ),
      h("div", { class: "actions" }, btn),
      next ? h("a", { class: "next-link", href: `#/pronunciation/lecon/${next.id}` }, `Leçon suivante : ${next.title}`) : null
    )
  );
}

// ---------- Entraînement ----------

function practiceTab() {
  const rev = Object.keys(reviewed());
  const saved = C.store.get(K.setup(), {});
  const st = { scope: saved.scope && saved.scope !== "one" ? saved.scope : rev.length ? "reviewed" : "level", level: saved.level || "A1", types: saved.types || [...QUIZ_TYPES], count: saved.count || 15 };
  const wrap = h("div");
  const draw = () => {
    const opts = st.scope === "reviewed" ? { scope: "lessons", lessonIds: rev } : { scope: "level", level: st.level };
    const n = rev.length || st.scope === "level" ? E.count(opts) : {};
    const avail = st.types.reduce((a, t) => a + (n[t] || 0), 0);
    fill(
      wrap,
      h("p", { class: "field-label" }, "Quels sons"),
      segmented([{ id: "reviewed", label: "Mes leçons vues" }, { id: "level", label: "Un niveau" }], st.scope, (id) => { st.scope = id; draw(); }),
      st.scope === "level" ? [h("p", { class: "field-label" }, "Niveau"), segmented(LV.map((l) => ({ id: l, label: l })), st.level, (id) => { st.level = id; draw(); }, { scroll: true })] : null,
      h("p", { class: "small muted" }, st.scope === "reviewed" && !rev.length ? "Marque d'abord une leçon comme vue, ou choisis un niveau." : `${avail.toLocaleString("fr-FR")} exercices possibles avec ces choix.`),
      h("p", { class: "field-label" }, "Types d'exercices"),
      h("div", { class: "rows" }, TYPES.map((t) => {
        const on = st.types.includes(t);
        return h("button", { class: `row radio${on ? " on" : ""}`, type: "button", role: "checkbox", "aria-checked": String(on), onclick: () => { st.types = on ? st.types.filter((x) => x !== t) : [...st.types, t]; if (!st.types.length) st.types = [t]; draw(); } },
          h("span", { class: "check-dot" }),
          h("span", { class: "row-text" }, h("span", { class: "row-title" }, TYPE_LABELS[t]), h("span", { class: "row-sub" }, TYPE_HINTS[t])));
      })),
      h("p", { class: "field-label" }, "Nombre de questions"),
      segmented([10, 15, 25].map((x) => ({ id: x, label: String(x) })), st.count, (id) => { st.count = id; draw(); }),
      h("div", { class: "actions" }, h("button", { class: "btn", type: "button", disabled: !avail, onclick: () => { C.store.set(K.setup(), st); startPractice({ ...opts, types: st.types, count: st.count, back: "#/pronunciation/entrainement" }); } }, "Commencer"))
    );
  };
  draw();
  return [wrap];
}

const openSession = () => (current() === SESSION ? refresh() : go(SESSION));

function startPractice(opts) {
  const items = E.build({ scope: opts.scope, lessonIds: opts.lessonIds, level: opts.level, types: opts.types, n: opts.count, stats: C.store.get(K.stats(), {}) });
  if (!items.length) return toast("Aucun exercice avec ces choix.");
  session = { mode: "practice", items, index: 0, results: [], opts, back: opts.back || "#/pronunciation/entrainement" };
  openSession();
}

// ---------- Parler ----------

function speakTab() {
  const aiOn = C.ai.hasKey();
  const sound = C.store.get(K.speakSound(), "r-rr");
  const results = h("div", { class: "rows" });
  const search = h("input", { class: "search", type: "search", placeholder: "Un mot à prononcer", autocomplete: "off", autocorrect: "off", autocapitalize: "off" });
  const norm = (s) => stripAccents(normalize(s));
  search.addEventListener("input", () => {
    const s = norm(search.value.trim());
    if (!s) return fill(results);
    const found = E.words.filter((w) => norm(w.w).startsWith(s)).slice(0, 12);
    fill(results, found.length ? found.map((w) => h("a", { class: "row link", href: `#/pronunciation/dire/${encodeURIComponent(w.w)}` }, h("span", { class: "row-text" }, es(w.w, "word")), h("span", { class: "row-end" }, icon("mic")))) : h("p", { class: "empty" }, "Mot absent de la banque, mais tu peux l'essayer : ", h("a", { href: `#/pronunciation/dire/${encodeURIComponent(search.value.trim())}` }, "le dire")));
  });
  const soundLessons = E.lessons.filter((l) => !["alfabeto"].includes(l.id));
  const st = { lesson: sound };
  const pick = h("div");
  const drawPick = () => fill(pick, h("div", { class: "chip-pick" }, soundLessons.map((l) => h("button", { class: `pick${st.lesson === l.id ? " on" : ""}`, type: "button", onclick: () => { st.lesson = l.id; C.store.set(K.speakSound(), l.id); drawPick(); } }, l.title))));
  drawPick();
  return [
    aiOn
      ? h("p", { class: "lead" }, "Parle, et l'IA te dit ce qu'elle a entendu, quel son retravailler, et comment.")
      : h("div", { class: "note note-astuce" }, h("p", { class: "note-title" }, "Active la correction automatique"), h("p", {}, "Crée une clé gratuite sur console.groq.com (sans carte bancaire), puis colle-la dans les Réglages. En attendant, tu peux t'enregistrer et comparer ta voix au modèle."), h("p", {}, h("a", { href: "#/reglages" }, "Ouvrir les Réglages"))),
    h("p", { class: "field-label" }, "Une série de 10 à répéter"),
    pick,
    h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => startPractice({ scope: "lessons", lessonIds: [st.lesson], types: ["repetir"], count: 10, back: "#/pronunciation/parler" }) }, icon("mic"), " Commencer la série")),
    h("p", { class: "field-label" }, "Ou un mot précis"),
    h("label", { class: "search-wrap" }, icon("search"), search),
    results,
  ];
}

function sayPage(target) {
  const w = E.byW[target.toLowerCase()];
  const item = w ? { target: w.w, kind: "mot", syl: w.syl, st: w.st, full: w.w } : { target, kind: /\s/.test(target) ? "phrase" : "mot", full: target };
  const other = () => {
    const pool = E.words.filter((x) => (w ? x.tags.some((t) => w.tags.includes(t)) : true) && x.w !== target);
    const n = pool[Math.floor(Math.random() * pool.length)];
    if (n) go(`/pronunciation/dire/${encodeURIComponent(n.w)}`);
  };
  return screen(
    bar({ title: "Parler", subtitle: item.kind === "mot" ? "Un mot au micro" : "Une phrase au micro", back: "#/pronunciation/parler", lang: "fr" }),
    h("section", { class: "sheet" },
      renderSpeak(item, { C, lessonTitle, onResult: (r) => record(`re:${item.target}`, r.ok) }),
      h("div", { class: "actions" }, h("button", { class: "btn ghost", type: "button", onclick: other }, "Un autre mot avec le même son"))
    )
  );
}

// ---------- Test ----------

function testTab() {
  const rev = Object.keys(reviewed());
  const history = C.store.get(K.tests(), []);
  return [
    h("p", { class: "lead" }, "Un test, ce sont 15 questions sur les leçons que tu as vues : écoute, accent, dictée" + (C.ai.hasKey() ? ", et trois mots à prononcer au micro." : ".") + " La correction arrive à la fin."),
    rev.length ? null : h("p", { class: "empty" }, "Marque d'abord des leçons comme vues dans l'onglet Leçons."),
    h("div", { class: "actions" }, rev.length ? h("button", { class: "btn", type: "button", onclick: startTest }, "Commencer un test") : h("a", { class: "btn", href: "#/pronunciation/lecons" }, "Voir les leçons")),
    history.length ? h("h2", { class: "section-title" }, "Tests passés") : null,
    history.length ? h("div", { class: "rows" }, history.slice(-15).reverse().map((t) => h("div", { class: "row" }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, fmtDate(t.ts)), h("span", { class: "row-sub" }, `${t.lessons} leçon${t.lessons > 1 ? "s" : ""} vue${t.lessons > 1 ? "s" : ""}`)), h("span", { class: "row-end" }, `${t.score} / ${t.total}`)))) : null,
  ];
}

function startTest() {
  const rev = Object.keys(reviewed());
  const stats = C.store.get(K.stats(), {});
  const mic = C.ai.hasKey() ? 3 : 0;
  const a = E.build({ scope: "lessons", lessonIds: rev, types: QUIZ_TYPES, n: 15 - mic, stats });
  const b = mic ? E.build({ scope: "lessons", lessonIds: rev, types: ["repetir"], n: mic, stats }) : [];
  const items = [...a, ...b];
  if (!items.length) return toast("Marque d'abord des leçons comme vues.");
  session = { mode: "test", items, index: 0, results: [], back: "#/pronunciation/test", lessons: rev.length };
  openSession();
}

// ---------- Déroulé d'une série ----------

function record(id, ok) {
  C.store.update(K.stats(), {}, (s) => {
    const x = (s[id] ||= { ok: 0, ko: 0, last: 0 });
    ok ? x.ok++ : x.ko++;
    x.last = Date.now();
    return s;
  });
}

function sessionView() {
  if (!session) return tabs("entrainement");
  const S = session;
  const test = S.mode === "test";
  const top = bar({ title: test ? "Test" : "Entraînement", back: S.back, lang: "fr" });
  const progress = h("p", { class: "topbar-sub" });
  top.append(progress);
  const stage = h("section", { class: "sheet" });
  const speak = (t) => C.audio.speak(t);
  const speakSeq = (list, pause) => C.audio.speakSequence(list, pause);

  function next() {
    if (S.index >= S.items.length) return finish();
    const item = S.items[S.index];
    progress.textContent = `Question ${S.index + 1} sur ${S.items.length}`;
    const last = S.index + 1 >= S.items.length;
    const go2 = () => { S.index++; next(); };
    if (item.t === "R") {
      let res = null;
      const nav = h("div", { class: "actions" }, h("button", { class: "btn ghost", type: "button", onclick: () => { if (!res) S.results.push({ item, res: { ok: false, skipped: true } }); go2(); } }, "Passer"));
      const card = renderSpeak(item, {
        C, lessonTitle,
        onResult: (r) => {
          const first = !res;
          res = r;
          if (first) {
            S.results.push({ item, res: r });
            fill(nav, h("button", { class: "btn", type: "button", onclick: go2 }, last ? "Voir le bilan" : "Question suivante"));
          } else S.results[S.results.length - 1].res = r.ok ? r : S.results[S.results.length - 1].res; // garde la meilleure tentative
          record(item.id, r.ok);
        },
      });
      fill(stage, h("p", { class: "item-tense" }, TYPE_LABELS.repetir), card, nav);
      window.scrollTo(0, 0);
      return;
    }
    const el = EX.render(item, {
      accentKeys: C.pack.accentKeys, test, speak, speakSeq,
      onAnswer: (answer, res, out) => {
        S.results.push({ item, answer, res });
        record(item.id, res.ok);
        if (test) { S.index++; return setTimeout(next, 150); }
        if (res.ok && item.type !== "pareil") speak(item.full);
        const btn = h("button", { class: "btn", type: "button", onclick: go2 }, last ? "Voir le bilan" : "Question suivante");
        const html = res.ok ? `${res.html || ""}${item.why}` : `${res.html}${(res.html || "").includes(item.why) ? "" : item.why}`;
        fill(out, EX.feedback({ ...item, full: item.type === "pareil" ? null : item.full }, { ...res, html }, speak), h("div", { class: "actions" }, btn));
        setTimeout(() => btn.focus({ preventScroll: true }), 60);
      },
    });
    fill(stage, h("p", { class: "item-tense" }, TYPE_LABELS[item.type]), el);
    window.scrollTo(0, 0);
  }

  function finish() {
    const ok = S.results.filter((r) => r.res.ok).length;
    const total = S.results.length;
    progress.textContent = "Terminé";
    if (test && !S.saved) {
      S.saved = true;
      C.store.update(K.tests(), [], (l) => (l.push({ ts: Date.now(), score: ok, total, lessons: S.lessons }), l.slice(-100)));
    }
    const wrong = S.results.filter((r) => !r.res.ok);
    const shown = test ? S.results : wrong;
    const answerText = (r) => (r.res.skipped ? "passé" : r.item.t === "R" ? (r.res.self ? "auto-évaluation" : `${Math.round((r.res.score || 0) * 100)} % des mots reconnus`) : r.item.t === "Q" ? r.item.o[Number(r.answer)] : r.answer) || "(vide)";
    fill(
      stage,
      h("p", { class: "result-line" }, `${ok} bonne${ok > 1 ? "s" : ""} réponse${ok > 1 ? "s" : ""} sur ${total}`),
      h("p", { class: "small muted" }, wrong.length ? (test ? "Voici la correction complète." : "À revoir :") : "Aucune erreur sur cette série."),
      h("div", { class: "rows recap" }, shown.map((r) =>
        h("div", { class: `row recap-row ${r.res.ok ? "ok" : "ko"}` },
          h("div", { class: "row-text" },
            h("span", { class: "row-title" }, es(r.item.full)),
            h("span", { class: "row-sub" }, `${TYPE_LABELS[r.item.type]}. `, r.res.ok ? "Juste." : ["Ta réponse : ", h("span", { lang: "es" }, answerText(r))])
          ),
          h("span", { class: "row-end" }, r.item.type === "pareil" ? h("button", { class: "icon-btn small", type: "button", "aria-label": "Écouter", onclick: () => speakSeq(r.item.listen, 600) }, icon("speaker")) : say(r.item.full))
        )
      )),
      h("div", { class: "actions" },
        wrong.length ? h("button", { class: "btn", type: "button", onclick: () => { session = { ...S, mode: "practice", items: shuffle(wrong.map((r) => r.item)), index: 0, results: [], saved: false }; refresh(); } }, "Refaire les erreurs") : null,
        test ? h("button", { class: "btn secondary", type: "button", onclick: startTest }, "Nouveau test") : h("button", { class: "btn secondary", type: "button", onclick: () => (S.opts ? startPractice(S.opts) : go("/pronunciation/entrainement")) }, "Nouvelle série"),
        h("a", { class: "btn ghost", href: S.back }, "Terminer")
      )
    );
  }

  next();
  return screen(top, stage);
}
