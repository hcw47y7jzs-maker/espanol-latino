// Module Vocabulaire : lots de mots par niveau, cartes d'étude, entraînement et tests.

import { h, es, icon, topbar, segmented, toast, fmtDate, fill } from "../../core/ui.js";
import { go, refresh, current } from "../../core/router.js";
import { normalize, shuffle, stripAccents } from "../../core/check.js";
import * as EX from "../../core/exercise.js";
import { createVocabEngine, TYPES } from "./engine.js";

let C, M, D, V;
let session = null;
const SESSION = "/vocab/serie/en-cours";

const K = {
  reviewed: () => C.key("vocab/reviewedLots"),
  stats: () => C.key("vocab/stats"),
  tests: () => C.key("vocab/tests"),
  tab: () => C.key("vocab/tab"),
  setup: () => C.key("vocab/setup"),
};
const reviewed = () => C.store.get(K.reviewed(), {});
const TYPE_LABELS = { qes: "QCM espagnol → français", qfr: "QCM français → espagnol", vf: "Vrai ou faux", wes: "Écrire en espagnol", wfr: "Écrire en français" };
const LEVEL_TEXT = {
  A1: "Mots 1 à 750 : le cœur de la langue.",
  A2: "Mots 751 à 1 500 : la vie quotidienne.",
  B1: "Mots 1 501 à 2 250 : parler de tout, simplement.",
  B2: "Mots 2 251 à 3 000 : la précision.",
  C1: "Les faux amis : les mots qui trompent les francophones.",
  C2: "Les mots d'Argentine qui remplacent ceux d'Espagne.",
};

async function data() {
  if (!D) {
    D = await C.loadJSON(C.pack.vocab.data);
    V = createVocabEngine(D);
  }
}

export function register({ ctx, route }) {
  C = ctx;
  M = ctx.pack.modules.find((m) => m.id === "vocab");
  route("/vocab", async () => { await data(); return tabs(C.store.get(K.tab(), "mots")); });
  route("/vocab/:tab", async ({ tab, q }) => { await data(); return tabs(tab, q); });
  route("/vocab/lot/:id", async ({ id }) => { await data(); return lotPage(id); });
  route("/vocab/cartes/:id", async ({ id }) => { await data(); return cards(id); });
  route(SESSION, async () => { await data(); return sessionView(); });
}

export function summary() {
  const rev = reviewed();
  if (!Object.keys(rev).length) return "Commencer";
  // Compte approximatif sans charger les données : 50 mots par lot, sauf C1/C2.
  const n = Object.keys(rev).reduce((a, id) => a + (id.startsWith("C") ? 48 : 50), 0);
  return `${n.toLocaleString("fr-FR")} mots révisés`;
}

const remember = (label) => C.store.set("nav/last", { path: current(), label });
const levelChip = (lvl) => h("span", { class: `chip lvl-${lvl.toLowerCase()}` }, lvl);
const lotWords = (id) => V.words.filter((w) => w.lot === id);
const say = (text) => h("button", { class: "icon-btn small", type: "button", "aria-label": `Écouter ${text}`, onclick: () => C.audio.speak(text) }, icon("speaker"));

const TABS = [
  { id: "mots", label: "Mots" },
  { id: "entrainement", label: "S'entraîner" },
  { id: "test", label: "Tester" },
];

function tabs(tab, q = {}) {
  if (!TABS.some((t) => t.id === tab)) tab = "mots";
  C.store.set(K.tab(), tab);
  remember(`Vocabulario, ${TABS.find((t) => t.id === tab).label.toLowerCase()}`);
  const hd = topbar({ title: M.title, subtitle: M.subtitle, color: M.color, ink: M.ink });
  hd.append(segmented(TABS, tab, (id) => go(`/vocab/${id}`), { label: "Sections du module Vocabulaire" }));
  const body = { mots: wordsTab, entrainement: practiceTab, test: testTab }[tab](q);
  return h("main", { class: "screen", style: { "--band": M.color } }, hd, h("section", { class: "sheet" }, body));
}

// ---------- Mots : lots par niveau + recherche ----------

function wordsTab() {
  const rev = reviewed();
  const results = h("div", { class: "rows" });
  const lotsWrap = h("div");
  const search = h("input", { class: "search", type: "search", placeholder: "Chercher un mot (espagnol ou français)", autocomplete: "off", autocorrect: "off", autocapitalize: "off" });
  const norm = (s) => stripAccents(normalize(s));

  search.addEventListener("input", () => {
    const s = norm(search.value.trim());
    lotsWrap.hidden = !!s;
    if (!s) return fill(results);
    const found = V.words.filter((w) => norm(w.es).startsWith(s) || w.frAll.some((f) => norm(f).startsWith(s))).slice(0, 40);
    fill(results, found.length ? found.map(wordRow) : h("p", { class: "empty" }, "Aucun mot trouvé."));
  });

  const levels = C.pack.levels.map((lvl) => {
    const lots = D.lots.filter((l) => l.lvl === lvl);
    const done = lots.filter((l) => rev[l.id]).length;
    return [
      h("h2", { class: "section-title level-title" }, levelChip(lvl), h("span", {}, done ? ` ${done} lot${done > 1 ? "s" : ""} sur ${lots.length} révisé${done > 1 ? "s" : ""}` : ` ${lots.length} lot${lots.length > 1 ? "s" : ""}`)),
      h("p", { class: "small muted level-text" }, LEVEL_TEXT[lvl]),
      h(
        "div",
        { class: "lot-grid" },
        lots.map((l) =>
          h("a", { class: `lot${rev[l.id] ? " on" : ""}`, href: `#/vocab/lot/${l.id}` }, h("span", { class: "lot-title" }, l.title), h("span", { class: "lot-first es" }, lotWords(l.id).slice(0, 3).map((w) => w.es).join(", ")), rev[l.id] ? h("span", { class: "lot-done" }, "Révisé") : null)
        )
      ),
    ];
  });
  fill(lotsWrap, levels);
  return [
    h("p", { class: "lead" }, "Les 3 000 mots les plus utiles, par ordre de fréquence, en lots de 50. Ouvre un lot pour l'étudier, puis marque-le comme révisé : ses mots entreront dans tes tests."),
    h("label", { class: "search-wrap" }, icon("search"), search),
    results,
    lotsWrap,
  ];
}

function wordRow(w) {
  return h(
    "div",
    { class: "row word-row" },
    h(
      "span",
      { class: "row-text" },
      h("span", { class: "row-title" }, w.art ? h("span", { class: `art g-${w.g || "x"}`, lang: "es" }, `${w.art} `) : null, es(w.es, "word")),
      h("span", { class: "row-sub" }, w.frFull),
      w.note ? h("span", { class: "row-note small", html: w.note.replace(/\*([^*]+)\*/g, '<i lang="es">$1</i>') }) : null
    ),
    h("span", { class: "row-end" }, say(V.display(w)))
  );
}

function lotPage(id) {
  const lot = D.lots.find((l) => l.id === id);
  if (!lot) return tabs("mots");
  const words = lotWords(id);
  const rev = reviewed();
  remember(`${lot.title}, niveau ${lot.lvl}`);
  const btn = h(
    "button",
    {
      class: `btn ${rev[id] ? "secondary" : ""}`,
      type: "button",
      onclick: () => {
        let on;
        C.store.update(K.reviewed(), {}, (r) => ((on = !r[id]), on ? (r[id] = Date.now()) : delete r[id], r));
        btn.textContent = on ? "Révisé aujourd'hui, retirer" : "Marquer le lot comme révisé";
        btn.classList.toggle("secondary", on);
        toast(on ? "Ces mots entreront dans tes tests." : "Marque retirée.");
      },
    },
    rev[id] ? `Révisé le ${fmtDate(rev[id])}, retirer` : "Marquer le lot comme révisé"
  );
  const idx = D.lots.findIndex((l) => l.id === id);
  const next = D.lots[idx + 1];
  return h(
    "main",
    { class: "screen", style: { "--band": M.color } },
    topbar({ title: lot.title, subtitle: `Niveau ${lot.lvl}, ${words.length} mots`, color: M.color, ink: M.ink, back: "#/vocab/mots", lang: "fr" }),
    h(
      "section",
      { class: "sheet" },
      h(
        "div",
        { class: "actions top" },
        h("a", { class: "btn", href: `#/vocab/cartes/${id}` }, "Étudier en cartes"),
        h("button", { class: "btn secondary", type: "button", onclick: () => startPractice({ scope: "lot", lot: id, types: TYPES, count: 20 }) }, "M'entraîner sur ce lot")
      ),
      h("p", { class: "small muted" }, "Articles en couleur : bleu pour le masculin, rose pour le féminin. Touche le haut-parleur pour écouter."),
      h("div", { class: "rows" }, words.map(wordRow)),
      h("div", { class: "actions" }, btn),
      next ? h("a", { class: "next-link", href: `#/vocab/lot/${next.id}` }, `Lot suivant : ${next.title}`) : null
    )
  );
}

// ---------- Cartes d'étude ----------

function cards(id) {
  const lot = D.lots.find((l) => l.id === id);
  const words = shuffle(lotWords(id));
  let k = 0;
  let dir = C.store.get(C.key("vocab/cardDir"), "es");
  let known = 0;
  const stage = h("div", { class: "card-stage" });

  function draw() {
    if (k >= words.length) {
      fill(
        stage,
        h("p", { class: "result-line" }, "Lot parcouru"),
        h("p", { class: "small muted" }, `Tu connaissais ${known} mot${known > 1 ? "s" : ""} sur ${words.length}. Les autres reviendront plus souvent à l'entraînement.`),
        h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => startPractice({ scope: "lot", lot: id, types: TYPES, count: 20 }) }, "M'entraîner sur ce lot"), h("a", { class: "btn ghost", href: `#/vocab/lot/${id}` }, "Retour au lot"))
      );
      return;
    }
    const w = words[k];
    const front = dir === "es" ? h("p", { class: "card-word es" }, V.display(w)) : h("p", { class: "card-word" }, w.fr);
    const back = h(
      "div",
      { class: "card-back", hidden: true },
      dir === "es" ? h("p", { class: "card-answer" }, w.frFull) : h("p", { class: "card-answer es" }, V.display(w)),
      w.note ? h("p", { class: "small", html: w.note.replace(/\*([^*]+)\*/g, '<i lang="es">$1</i>') }) : null,
      h(
        "div",
        { class: "actions" },
        h("button", { class: "btn secondary", type: "button", onclick: () => mark(false) }, "À revoir"),
        h("button", { class: "btn", type: "button", onclick: () => mark(true) }, "Je le savais")
      )
    );
    const reveal = h("button", { class: "btn", type: "button", onclick: () => { back.hidden = false; reveal.remove(); if (dir === "fr") C.audio.speak(V.display(w)); } }, "Voir la réponse");
    fill(
      stage,
      h("p", { class: "small muted" }, `Carte ${k + 1} sur ${words.length}`),
      h("div", { class: "card" }, front, dir === "es" ? say(V.display(w)) : null),
      reveal,
      back
    );
    if (dir === "es") C.audio.speak(V.display(w));
  }
  function mark(ok) {
    const w = words[k];
    if (ok) known++;
    C.store.update(K.stats(), {}, (s) => {
      for (const t of ok ? [] : ["qes", "wes"]) {
        const x = (s[`${w.id}:${t}`] ||= { ok: 0, ko: 0, last: 0 });
        x.ko++;
        x.last = Date.now();
      }
      return s;
    });
    k++;
    draw();
  }
  const dirSeg = h("div");
  const drawDir = () =>
    fill(dirSeg, segmented([{ id: "es", label: "Espagnol → français" }, { id: "fr", label: "Français → espagnol" }], dir, (d) => { dir = d; C.store.set(C.key("vocab/cardDir"), d); k = 0; known = 0; drawDir(); draw(); }));
  drawDir();
  draw();
  return h(
    "main",
    { class: "screen", style: { "--band": M.color } },
    topbar({ title: "Cartes", subtitle: `${lot.title}, niveau ${lot.lvl}`, color: M.color, ink: M.ink, back: `#/vocab/lot/${id}`, lang: "fr" }),
    h("section", { class: "sheet" }, dirSeg, stage)
  );
}

// ---------- Entraînement ----------

function wordIdsFor({ scope, lot, level }) {
  const rev = reviewed();
  if (scope === "lot") return lotWords(lot).map((w) => w.id);
  if (scope === "level") return V.words.filter((w) => w.lvl === level).map((w) => w.id);
  return V.words.filter((w) => rev[w.lot]).map((w) => w.id);
}

function practiceTab() {
  const has = Object.keys(reviewed()).length > 0;
  const saved = C.store.get(K.setup(), {});
  const st = { scope: saved.scope && saved.scope !== "lot" ? saved.scope : has ? "reviewed" : "level", level: saved.level || "A1", types: saved.types || [...TYPES], count: saved.count || 20 };
  const wrap = h("div");
  const draw = () => {
    const n = wordIdsFor(st).length;
    fill(
      wrap,
      h("p", { class: "field-label" }, "Quels mots"),
      segmented([{ id: "reviewed", label: "Mes lots révisés" }, { id: "level", label: "Un niveau" }], st.scope, (id) => { st.scope = id; draw(); }),
      st.scope === "level" ? [h("p", { class: "field-label" }, "Niveau"), segmented(C.pack.levels.map((l) => ({ id: l, label: l })), st.level, (id) => { st.level = id; draw(); }, { scroll: true })] : null,
      h("p", { class: "small muted" }, st.scope === "reviewed" && !has ? "Tu n'as encore marqué aucun lot comme révisé. Ouvre un lot dans l'onglet Mots, ou choisis un niveau." : `${n} mots. Pour un seul lot, ouvre-le dans l'onglet Mots.`),
      h("p", { class: "field-label" }, "Types d'exercices"),
      h(
        "div",
        { class: "rows" },
        TYPES.map((t) => {
          const on = st.types.includes(t);
          return h(
            "button",
            { class: `row radio${on ? " on" : ""}`, type: "button", role: "checkbox", "aria-checked": String(on), onclick: () => { st.types = on ? st.types.filter((x) => x !== t) : [...st.types, t]; if (!st.types.length) st.types = [t]; draw(); } },
            h("span", { class: "check-dot" }),
            h("span", { class: "row-text" }, h("span", { class: "row-title" }, TYPE_LABELS[t]))
          );
        })
      ),
      h("p", { class: "field-label" }, "Nombre de questions"),
      segmented([10, 20, 30].map((x) => ({ id: x, label: String(x) })), st.count, (id) => { st.count = id; draw(); }),
      h("div", { class: "actions" }, h("button", { class: "btn", type: "button", disabled: !n, onclick: () => { C.store.set(K.setup(), st); startPractice(st); } }, "Commencer"))
    );
  };
  draw();
  return [wrap];
}

const openSession = () => (current() === SESSION ? refresh() : go(SESSION));

function startPractice(opts) {
  const items = V.build({ wordIds: wordIdsFor(opts), types: opts.types, n: opts.count, stats: C.store.get(K.stats(), {}) });
  if (!items.length) return toast("Aucun mot avec ces choix.");
  session = { mode: "practice", items, index: 0, results: [], opts, back: opts.scope === "lot" ? `#/vocab/lot/${opts.lot}` : "#/vocab/entrainement" };
  openSession();
}

// ---------- Test ----------

function testTab() {
  const ids = wordIdsFor({ scope: "reviewed" });
  const history = C.store.get(K.tests(), []);
  return [
    h("p", { class: "lead" }, "Un test, ce sont 20 questions sur les mots de tes lots révisés : QCM, vrai ou faux, et mots à écrire dans les deux sens. La correction arrive à la fin."),
    ids.length ? h("p", { class: "small muted" }, `${ids.length} mots révisés. Les mots ratés reviennent plus souvent.`) : h("p", { class: "empty" }, "Marque d'abord des lots comme révisés dans l'onglet Mots."),
    h("div", { class: "actions" }, ids.length ? h("button", { class: "btn", type: "button", onclick: startTest }, "Commencer un test") : h("a", { class: "btn", href: "#/vocab/mots" }, "Voir les lots")),
    history.length ? h("h2", { class: "section-title" }, "Tests passés") : null,
    history.length ? h("div", { class: "rows" }, history.slice(-15).reverse().map((t) => h("div", { class: "row" }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, fmtDate(t.ts)), h("span", { class: "row-sub" }, `${t.words} mots révisés à ce moment-là`)), h("span", { class: "row-end" }, `${t.score} / ${t.total}`)))) : null,
  ];
}

function startTest() {
  const ids = wordIdsFor({ scope: "reviewed" });
  const items = V.build({ wordIds: ids, n: 20, stats: C.store.get(K.stats(), {}) });
  if (!items.length) return toast("Marque d'abord des lots comme révisés.");
  session = { mode: "test", items, index: 0, results: [], back: "#/vocab/test", words: ids.length };
  openSession();
}

// ---------- Déroulé d'une série ----------

function record(item, ok) {
  C.store.update(K.stats(), {}, (s) => {
    const x = (s[item.id] ||= { ok: 0, ko: 0, last: 0 });
    ok ? x.ok++ : x.ko++;
    x.last = Date.now();
    return s;
  });
}

function sessionView() {
  if (!session) return tabs("entrainement");
  const S = session;
  const test = S.mode === "test";
  const bar = topbar({ title: test ? "Test" : "Entraînement", color: M.color, ink: M.ink, back: S.back, lang: "fr" });
  const progress = h("p", { class: "topbar-sub" });
  bar.append(progress);
  const stage = h("section", { class: "sheet" });
  const speak = (t) => C.audio.speak(t);

  function next() {
    if (S.index >= S.items.length) return finish();
    const item = S.items[S.index];
    progress.textContent = `Question ${S.index + 1} sur ${S.items.length}`;
    const el = EX.render(item, {
      accentKeys: C.pack.accentKeys,
      test,
      speak,
      onAnswer: (answer, res, out) => {
        S.results.push({ item, answer, res });
        record(item, res.ok);
        if (test) { S.index++; return setTimeout(next, 150); }
        if (res.ok) speak(item.full);
        const last = S.index + 1 >= S.items.length;
        const btn = h("button", { class: "btn", type: "button", onclick: () => { S.index++; next(); } }, last ? "Voir le bilan" : "Question suivante");
        fill(out, EX.feedback({ ...item, full: item.full }, { ...res, html: res.ok ? res.html : `${res.html}${res.html.includes(item.why) ? "" : `<p>${item.why}</p>`}` }, speak), h("div", { class: "actions" }, btn));
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
      C.store.update(K.tests(), [], (l) => (l.push({ ts: Date.now(), score: ok, total, words: S.words }), l.slice(-100)));
    }
    const wrong = S.results.filter((r) => !r.res.ok);
    const shown = test ? S.results : wrong;
    const answerText = (r) => (r.item.t === "Q" ? r.item.o[Number(r.answer)] : r.item.t === "V" ? (r.answer === "true" ? "Vrai" : "Faux") : r.answer) || "(vide)";
    fill(
      stage,
      h("p", { class: "result-line" }, `${ok} bonne${ok > 1 ? "s" : ""} réponse${ok > 1 ? "s" : ""} sur ${total}`),
      h("p", { class: "small muted" }, wrong.length ? (test ? "Voici la correction complète." : "Les mots à revoir :") : "Aucune erreur sur cette série."),
      h(
        "div",
        { class: "rows recap" },
        shown.map((r) => {
          const w = V.byId[r.item.wid];
          return h(
            "div",
            { class: `row recap-row ${r.res.ok ? "ok" : "ko"}` },
            h(
              "div",
              { class: "row-text" },
              h("span", { class: "row-title" }, es(V.display(w)), h("span", { class: "muted" }, ` : ${w.frFull}`)),
              h("span", { class: "row-sub" }, `${TYPE_LABELS[r.item.type]}. `, r.res.ok ? "Juste." : ["Ta réponse : ", h("span", { lang: r.item.t === "W" ? r.item.lang : "fr" }, answerText(r))])
            ),
            h("span", { class: "row-end" }, say(V.display(w)))
          );
        })
      ),
      h(
        "div",
        { class: "actions" },
        wrong.length ? h("button", { class: "btn", type: "button", onclick: () => { session = { ...S, mode: "practice", items: shuffle(wrong.map((r) => V.item(V.byId[r.item.wid], r.item.type))), index: 0, results: [], saved: false }; refresh(); } }, "Refaire les erreurs") : null,
        test ? h("button", { class: "btn secondary", type: "button", onclick: startTest }, "Nouveau test") : h("button", { class: "btn secondary", type: "button", onclick: () => (S.opts ? startPractice(S.opts) : go("/vocab/entrainement")) }, "Nouvelle série"),
        h("a", { class: "btn ghost", href: S.back }, "Terminer")
      )
    );
  }

  next();
  return h("main", { class: "screen session", style: { "--band": M.color } }, bar, stage);
}
