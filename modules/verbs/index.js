// Module Verbes : leçons, tableaux de conjugaison, marquage des temps révisés, entraînement et tests.

import { h, es, icon, topbar, segmented, toast, accentBar, answerInput, fmtDate, fill } from "../../core/ui.js";
import { render as md } from "../../core/md.js";
import { go, refresh, current } from "../../core/router.js";
import { stripAccents } from "../../core/check.js";
import { createVerbEngine } from "./engine.js";

let C; // contexte de l'app
let E; // moteur
let M; // description du module (couleurs, titres)
let session = null; // session d'entraînement ou de test en cours

const K = {
  reviewed: () => C.key("verbs/reviewed"),
  stats: () => C.key("verbs/stats"),
  read: () => C.key("verbs/lessonsRead"),
  tests: () => C.key("verbs/tests"),
  tab: () => C.key("verbs/tab"),
  setup: () => C.key("verbs/setup"),
};
const reviewed = () => C.store.get(K.reviewed(), {});
const pairKey = (inf, t) => `${inf}|${t}`;

async function engine() {
  if (!E) E = createVerbEngine({ pack: C.pack, data: await C.loadJSON(C.pack.verbs.data), lang: C.lang });
  return E;
}

export function register({ ctx, route }) {
  C = ctx;
  M = ctx.pack.modules.find((m) => m.id === "verbs");
  route("/verbs", async () => { await engine(); return tabs(C.store.get(K.tab(), "lecons")); });
  route("/verbs/:tab", async ({ tab, q }) => { await engine(); return tabs(tab, q); });
  route("/verbs/lecon/:id", async ({ id }) => { await engine(); return lesson(id); });
  route("/verbs/v/:inf", async ({ inf, q }) => { await engine(); return verbPage(inf, q.t); });
  route("/verbs/session/en-cours", async () => { await engine(); return sessionView(); });
}

export function summary() {
  const n = new Set(Object.keys(reviewed()).map((k) => k.split("|")[0])).size;
  return n ? `${n} verbe${n > 1 ? "s" : ""} révisé${n > 1 ? "s" : ""}` : "Commencer";
}

const remember = (label) => C.store.set("nav/last", { path: current(), label });

// ---------- En-tête et onglets ----------

const TABS = [
  { id: "lecons", label: "Leçons" },
  { id: "verbes", label: "Verbes" },
  { id: "entrainement", label: "S'entraîner" },
  { id: "test", label: "Tester" },
];

function header(tab) {
  const hd = topbar({ title: M.title, subtitle: M.subtitle, color: M.color, ink: M.ink });
  hd.append(segmented(TABS, tab, (id) => go(`/verbs/${id}`), { label: "Sections du module Verbes" }));
  return hd;
}

function tabs(tab, q = {}) {
  if (!TABS.some((t) => t.id === tab)) tab = "lecons";
  C.store.set(K.tab(), tab);
  const body = { lecons: lessonsTab, verbes: verbsTab, entrainement: practiceTab, test: testTab }[tab](q);
  remember(`Verbos, ${TABS.find((t) => t.id === tab).label.toLowerCase()}`);
  return h("main", { class: "screen", style: { "--band": M.color } }, header(tab), h("section", { class: "sheet" }, body));
}

const levelChip = (lvl) => h("span", { class: `chip lvl-${lvl.toLowerCase()}` }, lvl);

// ---------- Leçons ----------

function lessonsTab() {
  const read = C.store.get(K.read(), {});
  const rev = reviewed();
  const countFor = (t) => Object.keys(rev).filter((k) => k.endsWith("|" + t)).length;
  const intro = C.pack.verbs.introLesson;
  const row = (id, title, sub, extra) =>
    h(
      "a",
      { class: "row link", href: `#/verbs/lecon/${id}` },
      h("span", { class: "row-text" }, es(title, "row-title"), h("span", { class: "row-sub" }, sub)),
      h("span", { class: "row-end" }, extra)
    );
  return [
    h("p", { class: "lead" }, "Chaque leçon explique quand utiliser le temps, comment le former, et ce qui change en Argentine."),
    h(
      "div",
      { class: "rows" },
      row(intro.id, intro.es, intro.fr, read[intro.id] ? h("span", { class: "muted small" }, "Lue") : null),
      E.tenses.map((t) => {
        const n = countFor(t.id);
        return row(
          t.id,
          t.es,
          `${t.fr}${n ? `, ${n} verbe${n > 1 ? "s" : ""} révisé${n > 1 ? "s" : ""}` : ""}`,
          [levelChip(t.level), read[t.id] ? h("span", { class: "muted small" }, "Lue") : null]
        );
      })
    ),
  ];
}

async function lesson(id) {
  const intro = C.pack.verbs.introLesson;
  const t = id === intro.id ? intro : E.tenseById[id];
  if (!t) return tabs("lecons");
  const text = await C.loadText(t.lesson);
  const read = C.store.get(K.read(), {});
  remember(`leçon ${t.fr.toLowerCase()}`);
  const prose = h("article", { class: "prose", html: md(text, "es") });
  // Les exemples en espagnol se lisent d'un toucher.
  prose.querySelectorAll("i[lang=es]").forEach((el) => {
    el.classList.add("say");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.addEventListener("click", () => C.audio.speak(el.textContent));
  });
  const markBtn = h(
    "button",
    {
      class: "btn ghost",
      type: "button",
      onclick: () => {
        C.store.update(K.read(), {}, (r) => ((r[t.id] = Date.now()), r));
        markBtn.textContent = "Leçon lue";
        markBtn.disabled = true;
      },
      disabled: !!read[t.id],
    },
    read[t.id] ? "Leçon lue" : "Marquer la leçon comme lue"
  );
  const isTense = !!E.tenseById[id];
  return h(
    "main",
    { class: "screen", style: { "--band": M.color } },
    topbar({ title: t.es, subtitle: t.fr, color: M.color, ink: M.ink, back: "#/verbs/lecons" }),
    h(
      "section",
      { class: "sheet" },
      h("p", { class: "hint" }, "Touche un mot en espagnol pour l'écouter."),
      prose,
      h(
        "div",
        { class: "actions" },
        isTense ? h("a", { class: "btn", href: `#/verbs/verbes?temps=${id}` }, "Choisir les verbes révisés à ce temps") : null,
        isTense ? h("button", { class: "btn secondary", type: "button", onclick: () => startPractice({ scope: "tense", tense: id, level: "B1", type: "form", count: 10 }) }, "M'entraîner sur ce temps") : null,
        markBtn
      )
    )
  );
}

// ---------- Liste des verbes et marquage ----------

function verbsTab(q = {}) {
  const state = { search: "", level: q.niveau || "tous", mark: q.temps || null };
  const list = h("div", { class: "rows verb-list" });
  const markBar = h("div", { class: "mark-bar" });
  const search = h("input", { class: "search", type: "search", placeholder: "Chercher un verbe (espagnol ou français)", lang: "fr", autocomplete: "off", autocorrect: "off", autocapitalize: "off" });
  const norm = (s) => stripAccents(s.toLowerCase());

  const levels = [{ id: "tous", label: "Tous" }, ...C.pack.levels.map((l) => ({ id: l, label: l }))];
  const tenseOpts = [{ id: "", label: "Non" }, ...E.tenses.map((t) => ({ id: t.id, label: t.fr }))];

  const filtered = () => {
    const s = norm(state.search.trim());
    return E.verbs.filter((v) => (state.level === "tous" || v.lvl === state.level) && (!s || norm(v.inf).includes(s) || norm(v.fr).includes(s)));
  };

  function draw() {
    const rev = reviewed();
    const vs = filtered();
    fill(list, 
      ...vs.map((v) => {
        const dots = h(
          "span",
          { class: "dots", "aria-label": `Temps révisés : ${E.tenses.filter((t) => rev[pairKey(v.inf, t.id)]).map((t) => t.fr).join(", ") || "aucun"}` },
          E.tenses.map((t) => h("span", { class: `dot${rev[pairKey(v.inf, t.id)] ? " on" : ""}${state.mark === t.id ? " focus" : ""}`, title: t.fr }))
        );
        const link = h(
          "a",
          { class: "row-main", href: `#/verbs/v/${encodeURIComponent(v.inf)}${state.mark ? `?t=${state.mark}` : ""}` },
          h("span", { class: "row-text" }, es(v.inf, "row-title"), h("span", { class: "row-sub" }, v.fr)),
          h("span", { class: "row-end" }, levelChip(v.lvl), dots)
        );
        if (!state.mark || !v.t[state.mark]) return h("div", { class: "row split" }, link);
        const on = !!rev[pairKey(v.inf, state.mark)];
        const box = h(
          "button",
          {
            class: `check${on ? " on" : ""}`,
            type: "button",
            "aria-pressed": String(on),
            "aria-label": `${v.inf} révisé au ${E.tenseById[state.mark].fr.toLowerCase()}`,
            onclick: () => { toggleReviewed(v.inf, state.mark); draw(); },
          },
          icon("check")
        );
        return h("div", { class: "row split" }, link, box);
      })
    );
    if (!vs.length) list.append(h("p", { class: "empty" }, "Aucun verbe ne correspond. Essaie l'infinitif espagnol ou la traduction française."));
    drawMarkBar(vs);
  }

  function drawMarkBar(vs) {
    fill(markBar);
    if (!state.mark) return;
    const t = E.tenseById[state.mark];
    const rev = reviewed();
    const all = vs.filter((v) => v.t[t.id]);
    const allOn = all.length && all.every((v) => rev[pairKey(v.inf, t.id)]);
    markBar.append(
      h("p", { class: "small" }, `Coche les verbes que tu as révisés au ${t.fr.toLowerCase()}. Ils pourront ensuite tomber dans les tests.`),
      h(
        "button",
        {
          class: "btn small secondary",
          type: "button",
          onclick: () => {
            C.store.update(K.reviewed(), {}, (r) => {
              for (const v of all) allOn ? delete r[pairKey(v.inf, t.id)] : (r[pairKey(v.inf, t.id)] = Date.now());
              return r;
            });
            draw();
          },
        },
        allOn ? `Tout décocher (${all.length})` : `Tout cocher (${all.length} affichés)`
      )
    );
  }

  search.addEventListener("input", () => { state.search = search.value; draw(); });
  const levelSeg = () => segmented(levels, state.level, (id) => { state.level = id; fill(levelWrap, levelSeg()); draw(); }, { label: "Niveau", scroll: true });
  const markSeg = () => segmented(tenseOpts, state.mark || "", (id) => { state.mark = id || null; fill(markWrap, markSeg()); draw(); }, { label: "Temps à marquer", scroll: true });
  const levelWrap = h("div", {}, levelSeg());
  const markWrap = h("div", {}, markSeg());
  draw();
  return [
    h("label", { class: "search-wrap" }, icon("search"), search),
    h("p", { class: "field-label" }, "Niveau"),
    levelWrap,
    h("p", { class: "field-label" }, "Marquer comme révisé"),
    markWrap,
    markBar,
    h("p", { class: "legend small muted" }, "Les six pastilles indiquent les temps révisés, dans l'ordre des leçons."),
    list,
  ];
}

function toggleReviewed(inf, t) {
  let on;
  C.store.update(K.reviewed(), {}, (r) => {
    const k = pairKey(inf, t);
    on = !r[k];
    on ? (r[k] = Date.now()) : delete r[k];
    return r;
  });
  return on;
}

// ---------- Page d'un verbe ----------

function verbPage(inf, tenseParam) {
  const v = E.byInf[inf];
  if (!v) return tabs("verbes");
  let t = tenseParam && v.t[tenseParam] ? tenseParam : E.tenses.find((x) => v.t[x.id]).id;
  const tableWrap = h("div");
  const segWrap = h("div");
  remember(v.inf);

  function draw() {
    const rev = reviewed();
    const slots = E.slots(v, t, { tu: true, vos: true });
    const say = (text) => h("button", { class: "icon-btn small", type: "button", "aria-label": `Écouter ${text}`, onclick: () => C.audio.speak(text) }, icon("speaker"));
    const on = !!rev[pairKey(inf, t)];
    const reviewBtn = h(
      "button",
      {
        class: `btn ${on ? "secondary" : ""}`,
        type: "button",
        onclick: () => {
          const now = toggleReviewed(inf, t);
          toast(now ? `${inf} au ${E.tenseById[t].fr.toLowerCase()} : marqué comme révisé.` : "Marque retirée.");
          draw();
        },
      },
      on ? `Révisé le ${fmtDate(rev[pairKey(inf, t)])}, retirer` : "Marquer ce temps comme révisé"
    );
    fill(tableWrap, 
      h(
        "table",
        { class: "conj" },
        h(
          "tbody",
          {},
          slots.map((s) =>
            h(
              "tr",
              {},
              h("th", { scope: "row", lang: "es" }, s.label),
              h("td", { lang: "es", class: "es form" }, E.display(s.form)),
              h("td", { class: "say-cell" }, say(`${s.label.split(" / ")[0]} ${E.display(s.form).split(" / ")[0]}`))
            )
          )
        )
      ),
      t === "imperativo" ? h("p", { class: "small muted" }, "Au négatif : no + subjonctif présent (", es(`no ${v.t.subj_presente?.[1] || ""}`), ").") : null,
      h(
        "div",
        { class: "actions" },
        reviewBtn,
        h("button", { class: "btn ghost", type: "button", onclick: () => C.audio.speak(slots.map((s) => `${s.label.split(" / ")[0]} ${E.display(s.form).split(" / ")[0]}`).join(", ")) }, "Écouter tout le tableau"),
        h("button", { class: "btn ghost", type: "button", onclick: () => startPractice({ scope: "verb", verb: inf, tense: t, type: "table", count: 1, then: "form" }) }, "M'entraîner sur ce tableau")
      )
    );
    fill(segWrap, 
      segmented(
        E.tenses.filter((x) => v.t[x.id]).map((x) => ({ id: x.id, label: (rev[pairKey(inf, x.id)] ? "✓ " : "") + x.fr })),
        t,
        (id) => { t = id; draw(); },
        { label: "Temps", scroll: true }
      )
    );
  }
  draw();

  return h(
    "main",
    { class: "screen", style: { "--band": M.color } },
    topbar({ title: v.inf, subtitle: v.fr, color: M.color, ink: M.ink, back: "#/verbs/verbes" }),
    h(
      "section",
      { class: "sheet" },
      h("div", { class: "verb-meta" }, levelChip(v.lvl), h("span", { class: "small" }, v.reg ? "Régulier" : v.irr)),
      segWrap,
      tableWrap,
      h(
        "p",
        { class: "small muted forms-np" },
        "Gérondif : ", es(v.ger || "–"), ". Participe passé : ", es(v.part || "–"), "."
      )
    )
  );
}

// ---------- Entraînement ----------

const TYPES = [
  { id: "form", label: "Conjuguer une forme", sub: "Un verbe, un temps, une personne : tu écris la forme." },
  { id: "phrase", label: "Compléter une phrase", sub: "La phrase donne le contexte (ayer, mañana, antes…)." },
  { id: "qcm", label: "Reconnaître une forme", sub: "On te montre une forme, tu trouves le temps et la personne." },
  { id: "table", label: "Tableau complet", sub: "Tu remplis toutes les personnes d'un temps." },
  { id: "mix", label: "Mélange", sub: "Un peu de tout, pour varier." },
];

function practiceTab() {
  const rev = reviewed();
  const hasRev = Object.keys(rev).length > 0;
  const saved = C.store.get(K.setup(), {});
  const st = { scope: saved.scope || (hasRev ? "reviewed" : "tense"), tense: saved.tense || "presente", level: saved.level || "A1", type: saved.type || "form", count: saved.count || 10 };
  const wrap = h("div");

  function draw() {
    const scopeSeg = segmented(
      [{ id: "reviewed", label: "Mes révisés" }, { id: "tense", label: "Un temps" }, { id: "level", label: "Un niveau" }],
      st.scope, (id) => { st.scope = id; draw(); }, { label: "Quoi travailler" }
    );
    const tenseSeg = segmented(E.tenses.map((t) => ({ id: t.id, label: t.fr })), st.tense, (id) => { st.tense = id; draw(); }, { label: "Temps", scroll: true });
    const levelSeg = segmented(C.pack.levels.map((l) => ({ id: l, label: l })), st.level, (id) => { st.level = id; draw(); }, { label: "Niveau", scroll: true });
    const types = h(
      "div",
      { class: "rows", role: "radiogroup", "aria-label": "Type d'exercice" },
      TYPES.map((ty) =>
        h(
          "button",
          { class: `row radio${st.type === ty.id ? " on" : ""}`, type: "button", role: "radio", "aria-checked": String(st.type === ty.id), onclick: () => { st.type = ty.id; draw(); } },
          h("span", { class: "radio-dot" }),
          h("span", { class: "row-text" }, h("span", { class: "row-title" }, ty.label), h("span", { class: "row-sub" }, ty.sub))
        )
      )
    );
    const countSeg = segmented([10, 20, 30].map((n) => ({ id: n, label: String(n) })), st.count, (id) => { st.count = id; draw(); }, { label: "Nombre de questions" });

    const pairs = E.pairsForScope({ scope: st.scope, tense: st.tense, level: st.level, reviewed: rev });
    const explain =
      st.scope === "reviewed"
        ? hasRev ? `${Object.keys(rev).length} couples verbe et temps marqués comme révisés.` : "Tu n'as encore rien marqué comme révisé. Ouvre l'onglet Verbes, choisis un temps et coche les verbes que tu as travaillés."
        : st.scope === "tense"
        ? `${E.tenseById[st.tense].fr} des verbes jusqu'au niveau ${st.level}.`
        : `Tous les temps des verbes de niveau ${st.level}.`;

    fill(wrap, 
      h("p", { class: "field-label" }, "Quoi travailler"),
      scopeSeg,
      st.scope === "tense" ? [h("p", { class: "field-label" }, "Temps"), tenseSeg, h("p", { class: "field-label" }, "Verbes jusqu'au niveau"), levelSeg] : null,
      st.scope === "level" ? [h("p", { class: "field-label" }, "Niveau"), levelSeg] : null,
      h("p", { class: "small muted" }, explain),
      h("p", { class: "field-label" }, "Type d'exercice"),
      types,
      h("p", { class: "field-label" }, st.type === "table" ? "Nombre de tableaux" : "Nombre de questions"),
      countSeg,
      h(
        "div",
        { class: "actions" },
        h("button", { class: "btn", type: "button", disabled: !pairs.length, onclick: () => { C.store.set(K.setup(), st); startPractice(st); } }, "Commencer")
      )
    );
  }
  draw();
  return [wrap];
}

function startPractice(opts) {
  const pairs = E.pairsForScope({ ...opts, reviewed: reviewed() });
  let items = E.buildSession({ pairs, type: opts.type, count: opts.count, prefs: C.prefs() });
  if (opts.then === "form") items = items.concat(E.buildSession({ pairs, type: "form", count: 6, prefs: C.prefs() }));
  if (!items.length) return toast("Aucun exercice possible avec ces choix.");
  session = { mode: "practice", items, index: 0, results: [], back: opts.scope === "verb" ? `#/verbs/v/${encodeURIComponent(opts.verb)}?t=${opts.tense}` : "#/verbs/entrainement", opts };
  openSession();
}

// ---------- Test ----------

function testTab() {
  const rev = reviewed();
  const n = Object.keys(rev).length;
  const verbsN = new Set(Object.keys(rev).map((k) => k.split("|")[0])).size;
  const history = C.store.get(K.tests(), []);
  return [
    h("p", { class: "lead" }, "Un test, ce sont 10 verbes tirés parmi ceux que tu as marqués comme révisés, tous temps confondus. Tu vois les corrections à la fin."),
    n
      ? h("p", { class: "small muted" }, `${verbsN} verbe${verbsN > 1 ? "s" : ""} révisé${verbsN > 1 ? "s" : ""}, ${n} temps au total. Les formes que tu rates reviennent plus souvent.`)
      : h("p", { class: "empty" }, "Pour lancer un test, marque d'abord des verbes comme révisés : onglet Verbes, puis « Marquer comme révisé »."),
    h(
      "div",
      { class: "actions" },
      n ? h("button", { class: "btn", type: "button", onclick: startTest }, "Commencer un test") : h("a", { class: "btn", href: "#/verbs/verbes?temps=presente" }, "Marquer des verbes")
    ),
    history.length ? h("h2", { class: "section-title" }, "Tests passés") : null,
    history.length
      ? h(
          "div",
          { class: "rows" },
          history.slice(-15).reverse().map((t) =>
            h("div", { class: "row" }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, fmtDate(t.ts)), h("span", { class: "row-sub" }, t.tenses.join(", "))), h("span", { class: "row-end" }, `${t.score} / ${t.total}`))
          )
        )
      : null,
  ];
}

function startTest() {
  const items = E.buildTest({ reviewed: reviewed(), stats: C.store.get(K.stats(), {}), prefs: C.prefs() });
  if (!items.length) return toast("Marque d'abord des verbes comme révisés.");
  session = { mode: "test", items, index: 0, results: [], back: "#/verbs/test" };
  openSession();
}

const SESSION = "/verbs/session/en-cours";
const openSession = () => (current() === SESSION ? refresh() : go(SESSION));

// ---------- Déroulé d'une série (entraînement ou test) ----------

function recordStat(item, ok) {
  C.store.update(K.stats(), {}, (s) => {
    const k = pairKey(item.verb.inf, item.tense);
    const x = (s[k] ||= { ok: 0, ko: 0, last: 0 });
    ok ? x.ok++ : x.ko++;
    x.last = Date.now();
    return s;
  });
}

function sessionView() {
  if (!session) return tabs("entrainement");
  const S = session;
  const root = h("main", { class: "screen session", style: { "--band": M.color } });
  const title = S.mode === "test" ? "Test" : "Entraînement";
  const bar = topbar({ title, color: M.color, ink: M.ink, back: S.back, lang: "fr" });
  const progress = h("p", { class: "topbar-sub" });
  bar.append(progress);
  const stage = h("section", { class: "sheet" });
  root.append(bar, stage);

  function next() {
    if (S.index >= S.items.length) return finish();
    progress.textContent = `Question ${S.index + 1} sur ${S.items.length}`;
    const item = S.items[S.index];
    fill(stage, item.type === "table" ? tableItem(item) : item.type === "qcm" ? qcmItem(item) : typedItem(item));
    stage.querySelector("input")?.focus({ preventScroll: true });
  }

  const tenseLine = (item) => h("p", { class: "item-tense" }, E.tenseById[item.tense].fr);

  function feedback(res, item) {
    if (S.mode === "test") return null;
    const sayBtn = h("button", { class: "icon-btn small", type: "button", "aria-label": "Écouter", onclick: () => C.audio.speak(res.speak || res.correct.split(" / ")[0]) }, icon("speaker"));
    return h(
      "div",
      { class: `feedback ${res.ok ? "ok" : "ko"}`, role: "status" },
      h("p", { class: "feedback-title" }, res.ok ? "Correct" : res.accentOnly ? "Presque" : "Pas tout à fait"),
      h("p", { class: "feedback-answer" }, es(res.correct, "big"), sayBtn),
      res.html ? h("div", { class: "feedback-text", html: res.html }) : null
    );
  }

  function continueBtn() {
    const last = S.index + 1 >= S.items.length;
    const b = h("button", { class: "btn", type: "button", onclick: () => { S.index++; next(); } }, last ? (S.mode === "test" ? "Voir la correction" : "Voir le bilan") : "Question suivante");
    setTimeout(() => b.focus({ preventScroll: true }), 50);
    return b;
  }

  function typedItem(item) {
    const input = answerInput();
    const out = h("div");
    const v = item.verb;
    let prompt;
    if (item.type === "phrase") {
      prompt = h(
        "div",
        { class: "item" },
        item.context ? h("p", { class: "item-context" }, item.context) : null,
        tenseLine(item),
        h("p", { class: "phrase", lang: "es" }, item.before, input, item.after),
        h("p", { class: "small muted" }, v.fr)
      );
      input.classList.add("inline");
    } else {
      prompt = h(
        "div",
        { class: "item" },
        h("p", { class: "item-verb" }, es(v.inf, "big"), h("span", { class: "muted" }, ` ${v.fr}`)),
        tenseLine(item),
        h("p", { class: "item-person", lang: "es" }, item.personLabel),
        input
      );
    }
    const submit = h("button", { class: "btn", type: "button" }, S.mode === "test" ? "Valider" : "Vérifier");
    const done = () => {
      if (input.readOnly) return;
      const res = E.check(item, input.value);
      input.readOnly = true;
      input.classList.add(res.ok ? "is-ok" : "is-ko");
      S.results.push({ item, answer: input.value, res });
      recordStat(item, res.ok);
      if (S.mode === "test") { S.index++; return next(); }
      submit.remove();
      fill(out, feedback(res, item), continueBtn());
    };
    submit.addEventListener("click", done);
    input.addEventListener("keydown", (e) => e.key === "Enter" && done());
    return h("div", {}, prompt, accentBar(input, C.pack.accentKeys), h("div", { class: "actions" }, submit), out);
  }

  function qcmItem(item) {
    const out = h("div");
    const v = item.verb;
    const opts = h(
      "div",
      { class: "options" },
      item.options.map((o) =>
        h(
          "button",
          {
            class: "option", type: "button",
            onclick: (e) => {
              if (opts.dataset.done) return;
              opts.dataset.done = "1";
              const correct = item.options.find((x) => x.ok);
              const ct = E.tenseById[correct.tense].fr.toLowerCase();
              const res = { ok: o.ok, correct: item.shown, html: o.ok ? null : `<p><i lang="es">${item.shown}</i> est au ${ct}, personne <i lang="es">${E.label(correct.tense, correct.i)}</i>.</p><p><a href="#/verbs/lecon/${correct.tense}">Revoir la leçon : ${ct}</a></p>` };
              e.currentTarget.classList.add(o.ok ? "is-ok" : "is-ko");
              opts.querySelectorAll(".option").forEach((b, k) => item.options[k].ok && b.classList.add("is-ok"));
              S.results.push({ item, answer: o.text, res });
              recordStat(item, o.ok);
              if (S.mode === "test") { S.index++; return next(); }
              fill(out, feedback({ ...res, correct: `${item.shown} : ${correct.text}`, speak: item.shown }, item), continueBtn());
            },
          },
          o.text
        )
      )
    );
    return h(
      "div",
      {},
      h("div", { class: "item" }, h("p", { class: "item-context" }, "À quel temps et à quelle personne est cette forme ?"), h("p", { class: "item-verb" }, es(item.shown, "huge"), h("button", { class: "icon-btn small", type: "button", "aria-label": "Écouter", onclick: () => C.audio.speak(item.shown) }, icon("speaker"))), h("p", { class: "small muted" }, `Verbe ${v.inf}, ${v.fr}`)),
      opts,
      out
    );
  }

  function tableItem(item) {
    let focused = null;
    const rows = item.slots.map((s) => {
      const input = answerInput("");
      input.addEventListener("focus", () => (focused = input));
      return { s, input };
    });
    const out = h("div");
    const submit = h("button", { class: "btn", type: "button" }, "Vérifier le tableau");
    const tbl = h(
      "table",
      { class: "conj fill" },
      h("tbody", {}, rows.map(({ s, input }) => h("tr", {}, h("th", { scope: "row", lang: "es" }, s.label), h("td", {}, input))))
    );
    submit.addEventListener("click", () => {
      let okCount = 0;
      const notes = [];
      rows.forEach(({ s, input }) => {
        const sub = { verb: item.verb, tense: item.tense, i: s.i };
        const res = E.check(sub, input.value);
        input.readOnly = true;
        input.classList.add(res.ok ? "is-ok" : "is-ko");
        if (res.ok) okCount++;
        else {
          input.insertAdjacentElement("afterend", h("span", { class: "correction", lang: "es" }, res.correct));
          notes.push(h("div", { class: "feedback-text" }, h("p", { class: "small" }, h("b", { lang: "es" }, s.label), " : "), h("div", { html: res.html })));
        }
        recordStat(sub, res.ok);
      });
      const ok = okCount === rows.length;
      S.results.push({ item, answer: `${okCount}/${rows.length}`, res: { ok, correct: rows.map((r) => r.s.form).join(", ") } });
      submit.remove();
      fill(out, 
        h("div", { class: `feedback ${ok ? "ok" : "ko"}` }, h("p", { class: "feedback-title" }, ok ? "Tableau complet, sans faute" : `${okCount} formes justes sur ${rows.length}`), ...notes.slice(0, 3)),
        continueBtn()
      );
    });
    return h(
      "div",
      {},
      h("div", { class: "item" }, h("p", { class: "item-verb" }, es(item.verb.inf, "big"), h("span", { class: "muted" }, ` ${item.verb.fr}`)), tenseLine(item)),
      tbl,
      accentBar(() => focused || rows[0].input, C.pack.accentKeys),
      h("div", { class: "actions" }, submit),
      out
    );
  }

  function finish() {
    const ok = S.results.filter((r) => r.res.ok).length;
    const total = S.results.length;
    progress.textContent = "Terminé";
    if (S.mode === "test" && !S.saved) {
      S.saved = true;
      C.store.update(K.tests(), [], (list) => {
        list.push({ ts: Date.now(), score: ok, total, tenses: [...new Set(S.items.map((i) => E.tenseById[i.tense].fr))] });
        return list.slice(-100);
      });
    }
    const wrong = S.results.filter((r) => !r.res.ok);
    const recap = h(
      "div",
      { class: "rows recap" },
      (S.mode === "test" ? S.results : wrong).map((r) => {
        const it = r.item;
        const who = it.type === "table" ? "tableau" : E.label(it.tense, it.i, it.personLabel === "tú / vos");
        return h(
          "div",
          { class: `row recap-row ${r.res.ok ? "ok" : "ko"}` },
          h(
            "div",
            { class: "row-text" },
            h("span", { class: "row-title" }, es(it.verb.inf), h("span", { class: "muted" }, `, ${E.tenseById[it.tense].fr.toLowerCase()}, `), es(who)),
            h("span", { class: "row-sub" }, r.res.ok ? "Juste : " : "Ta réponse : ", es(r.answer || "(vide)"), r.res.ok ? null : [" ; attendu : ", es(r.res.correct)]),
            !r.res.ok && r.res.html && S.mode === "test" ? h("div", { class: "feedback-text small", html: r.res.html }) : null
          )
        );
      })
    );
    const redo = wrong.filter((r) => r.item.type !== "table").map((r) => ({ ...r.item }));
    fill(stage, 
      h("p", { class: "result-line" }, `${ok} bonne${ok > 1 ? "s" : ""} réponse${ok > 1 ? "s" : ""} sur ${total}`),
      h("p", { class: "small muted" }, wrong.length ? (S.mode === "test" ? "Voici la correction complète. Les formes ratées reviendront plus souvent dans les prochains tests." : "Les formes à revoir :") : "Aucune erreur sur cette série."),
      recap,
      h(
        "div",
        { class: "actions" },
        redo.length ? h("button", { class: "btn", type: "button", onclick: () => { session = { ...S, mode: "practice", items: redo, index: 0, results: [], saved: false }; refresh(); } }, "Refaire les erreurs") : null,
        S.mode === "test"
          ? h("button", { class: "btn secondary", type: "button", onclick: startTest }, "Nouveau test")
          : h("button", { class: "btn secondary", type: "button", onclick: () => (S.opts ? startPractice(S.opts) : go("/verbs/entrainement")) }, "Nouvelle série"),
        h("a", { class: "btn ghost", href: S.back }, "Terminer")
      )
    );
  }

  next();
  return root;
}
