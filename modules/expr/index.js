// Module Expressions : groupes thématiques (Amérique latine, puis Argentine et Salta),
// cartes d'étude, entraînement et tests de traduction.

import { h, es, icon, topbar, segmented, toast, fmtDate, fill } from "../../core/ui.js";
import { go, refresh, current } from "../../core/router.js";
import { normalize, shuffle, stripAccents } from "../../core/check.js";
import * as EX from "../../core/exercise.js";
import { createExprEngine, TYPES, DEFAULT_TYPES } from "./engine.js";

let C, M, D, E;
let session = null;
const SESSION = "/expressions/serie/en-cours";
// L'ocre du bandeau est trop clair pour du texte sur fond blanc : le contenu utilise une ocre foncée.
const SHEET_BAND = "#8A5A0B";

const K = {
  reviewed: () => C.key("expr/reviewed"),
  stats: () => C.key("expr/stats"),
  tests: () => C.key("expr/tests"),
  tab: () => C.key("expr/tab"),
  setup: () => C.key("expr/setup"),
  cardDir: () => C.key("expr/cardDir"),
};
const reviewed = () => C.store.get(K.reviewed(), {});
const TYPE_LABELS = {
  qes: "QCM : le sens de l'expression",
  qfr: "QCM : l'expression en espagnol",
  trou: "Compléter la phrase",
  vf: "Vrai ou faux",
  wfr: "Traduire en français",
  wes: "Traduire en espagnol",
  tph: "Traduire la phrase d'exemple",
};
const TYPE_HINTS = { tph: "Tu compares toi-même avec la traduction proposée." };

async function data() {
  if (!D) {
    D = await C.loadJSON(C.pack.expressions.data);
    E = createExprEngine(D);
  }
}

export function register({ ctx, route }) {
  C = ctx;
  M = ctx.pack.modules.find((m) => m.id === "expressions");
  route("/expressions", async () => { await data(); return tabs(C.store.get(K.tab(), "liste")); });
  route("/expressions/:tab", async ({ tab, q }) => { await data(); return tabs(tab, q); });
  route("/expressions/groupe/:id", async ({ id }) => { await data(); return groupPage(id); });
  route("/expressions/cartes/:id", async ({ id }) => { await data(); return cards(id); });
  route(SESSION, async () => { await data(); return sessionView(); });
}

export function summary() {
  const rev = Object.values(reviewed());
  if (!rev.length) return "Commencer";
  const n = rev.reduce((a, r) => a + (r.n || 0), 0);
  return `${n} expression${n > 1 ? "s" : ""} révisée${n > 1 ? "s" : ""}`;
}

const remember = (label) => C.store.set("nav/last", { path: current(), label });
const levelChip = (lvl) => h("span", { class: `chip lvl-${lvl.toLowerCase()}` }, lvl);
const levelRange = (g) => (g.lvl[0] === g.lvl[1] ? g.lvl[0] : `${g.lvl[0]}–${g.lvl[1]}`);
const say = (text) => h("button", { class: "icon-btn small", type: "button", "aria-label": `Écouter : ${text}`, onclick: () => C.audio.speak(text) }, icon("speaker"));
const groupItems = (id) => E.groupOf[id].ids.map((x) => E.byId[x]);
const regChip = (e) => (e.reg === "latam" ? null : h("span", { class: `reg-chip reg-${e.reg}` }, D.regions[e.reg]));
const mdHtml = (s) => s.replace(/\*([^*]+)\*/g, '<i lang="es">$1</i>');
const screen = (...kids) => h("main", { class: "screen expr-screen", style: { "--band": SHEET_BAND, "--band-ink": "#FFFFFF" } }, ...kids);
const bar = (opts) => topbar({ color: M.color, ink: M.ink, ...opts });

const TABS = [
  { id: "liste", label: "Expressions" },
  { id: "entrainement", label: "S'entraîner" },
  { id: "test", label: "Tester" },
];

function tabs(tab, q = {}) {
  if (!TABS.some((t) => t.id === tab)) tab = "liste";
  C.store.set(K.tab(), tab);
  remember(`Expresiones, ${TABS.find((t) => t.id === tab).label.toLowerCase()}`);
  const hd = bar({ title: M.title, subtitle: M.subtitle });
  hd.append(segmented(TABS, tab, (id) => go(`/expressions/${id}`), { label: "Sections du module Expressions" }));
  const body = { liste: listTab, entrainement: practiceTab, test: testTab }[tab](q);
  return screen(hd, h("section", { class: "sheet" }, body));
}

// ---------- Liste : deux moitiés, des groupes, une recherche ----------

function listTab() {
  const rev = reviewed();
  const results = h("div", { class: "rows" });
  const groupsWrap = h("div");
  const search = h("input", { class: "search", type: "search", placeholder: "Chercher (espagnol ou français)", autocomplete: "off", autocorrect: "off", autocapitalize: "off" });
  const norm = (s) => stripAccents(normalize(s));
  search.addEventListener("input", () => {
    const s = norm(search.value.trim());
    groupsWrap.hidden = !!s;
    if (!s) return fill(results);
    const found = E.items.filter((e) => e.esAll.some((x) => norm(x).includes(s)) || e.frAll.some((f) => norm(f).includes(s))).slice(0, 30);
    fill(results, found.length ? found.map((e) => exprCard(e, { link: true })) : h("p", { class: "empty" }, "Aucune expression trouvée."));
  });

  fill(
    groupsWrap,
    D.halves.map((half) => {
      const gs = D.groups.filter((g) => g.half === half.id);
      const n = gs.reduce((a, g) => a + g.n, 0);
      return [
        h("h2", { class: `section-title half-title half-${half.id}` }, half.title, h("span", { class: "half-count" }, ` ${n} expressions`)),
        h("p", { class: "small muted level-text" }, half.text),
        h(
          "div",
          { class: "lot-grid group-grid" },
          gs.map((g) =>
            h(
              "a",
              { class: `lot group-card${rev[g.id] ? " on" : ""}`, href: `#/expressions/groupe/${g.id}` },
              h("span", { class: "group-meta" }, levelChip(g.lvl[0]), g.lvl[1] !== g.lvl[0] ? [h("span", { class: "muted" }, "→"), levelChip(g.lvl[1])] : null),
              h("span", { class: "lot-title" }, g.title),
              h("span", { class: "lot-first es" }, groupItems(g.id).slice(0, 2).map((e) => e.main).join(", ")),
              rev[g.id] ? h("span", { class: "lot-done" }, "Révisé") : null
            )
          )
        ),
      ];
    })
  );
  return [
    h("p", { class: "lead" }, `${E.items.length} expressions en ${D.groups.length} groupes : d'abord celles de toute l'Amérique latine, puis l'Argentine et le parler de Salta. Ouvre un groupe, puis marque-le comme révisé : ses expressions entreront dans tes tests.`),
    h("label", { class: "search-wrap" }, icon("search"), search),
    results,
    groupsWrap,
  ];
}

function exprCard(e, { link = false } = {}) {
  const exHtml = e.exQ.replace("___", `<b>${e.span}</b>`);
  return h(
    "article",
    { class: "expr" },
    h("div", { class: "expr-head" }, h("span", { class: "expr-es", lang: "es" }, e.es), say(e.main)),
    h("p", { class: "expr-fr" }, e.frText),
    h("p", { class: "expr-tags" }, levelChip(e.lvl), regChip(e), link ? h("a", { class: "expr-group-link", href: `#/expressions/groupe/${e.group}` }, E.groupOf[e.group].title) : null),
    h("div", { class: "expr-ex" }, h("p", { class: "expr-ex-es", lang: "es" }, h("span", { html: exHtml }), say(e.ex)), h("p", { class: "expr-ex-fr" }, e.exFr)),
    e.note ? h("p", { class: "expr-note", html: mdHtml(e.note) }) : null
  );
}

function groupPage(id) {
  const g = E.groupOf[id];
  if (!g) return tabs("liste");
  const list = groupItems(id);
  const rev = reviewed();
  remember(`${g.title}, expressions`);
  const label = (r) => (r ? `Révisé le ${fmtDate(r.ts)}, retirer` : "Marquer le groupe comme révisé");
  const btn = h(
    "button",
    {
      class: `btn ${rev[id] ? "secondary" : ""}`,
      type: "button",
      onclick: () => {
        let now;
        C.store.update(K.reviewed(), {}, (r) => ((now = r[id] ? null : { ts: Date.now(), n: list.length }), now ? (r[id] = now) : delete r[id], r));
        btn.textContent = label(now);
        btn.classList.toggle("secondary", !!now);
        toast(now ? "Ces expressions entreront dans tes tests." : "Marque retirée.");
      },
    },
    label(rev[id])
  );
  const idx = D.groups.findIndex((x) => x.id === id);
  const next = D.groups[idx + 1];
  return screen(
    bar({ title: g.title, subtitle: `${list.length} expressions, niveau${g.lvl[0] === g.lvl[1] ? "" : "x"} ${levelRange(g)}`, back: "#/expressions/liste", lang: "fr" }),
    h(
      "section",
      { class: "sheet" },
      h("p", { class: "lead" }, g.text),
      h(
        "div",
        { class: "actions top" },
        h("a", { class: "btn", href: `#/expressions/cartes/${id}` }, "Étudier en cartes"),
        h("button", { class: "btn secondary", type: "button", onclick: () => startPractice({ scope: "group", group: id, types: DEFAULT_TYPES, count: Math.min(20, list.length) }) }, "M'entraîner sur ce groupe")
      ),
      h("div", { class: "expr-list" }, list.map((e) => exprCard(e))),
      h("div", { class: "actions" }, btn),
      next ? h("a", { class: "next-link", href: `#/expressions/groupe/${next.id}` }, `Groupe suivant : ${next.title}`) : null
    )
  );
}

// ---------- Cartes d'étude ----------

function cards(id) {
  const g = E.groupOf[id];
  if (!g) return tabs("liste");
  const list = shuffle(groupItems(id));
  let k = 0;
  let known = 0;
  let dir = C.store.get(K.cardDir(), "es");
  const stage = h("div", { class: "card-stage" });

  function draw() {
    if (k >= list.length) {
      fill(
        stage,
        h("p", { class: "result-line" }, "Groupe parcouru"),
        h("p", { class: "small muted" }, `Tu connaissais ${known} expression${known > 1 ? "s" : ""} sur ${list.length}. Les autres reviendront plus souvent à l'entraînement.`),
        h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => startPractice({ scope: "group", group: id, types: DEFAULT_TYPES, count: Math.min(20, list.length) }) }, "M'entraîner sur ce groupe"), h("a", { class: "btn ghost", href: `#/expressions/groupe/${id}` }, "Retour au groupe"))
      );
      return;
    }
    const e = list[k];
    const front = dir === "es" ? h("p", { class: "card-word es expr-card-word" }, e.main) : h("p", { class: "card-word expr-card-word" }, e.fr);
    const back = h(
      "div",
      { class: "card-back", hidden: true },
      dir === "es" ? h("p", { class: "card-answer" }, e.frText) : h("p", { class: "card-answer es" }, e.es),
      h("p", { class: "expr-ex-es", lang: "es" }, h("span", { html: e.exQ.replace("___", `<b>${e.span}</b>`) }), say(e.ex)),
      h("p", { class: "expr-ex-fr" }, e.exFr),
      e.note ? h("p", { class: "small", html: mdHtml(e.note) }) : null,
      h("div", { class: "actions" }, h("button", { class: "btn secondary", type: "button", onclick: () => mark(false) }, "À revoir"), h("button", { class: "btn", type: "button", onclick: () => mark(true) }, "Je le savais"))
    );
    const reveal = h("button", { class: "btn", type: "button", onclick: () => { back.hidden = false; reveal.remove(); if (dir === "fr") C.audio.speak(e.main); } }, "Voir la réponse");
    fill(stage, h("p", { class: "small muted" }, `Carte ${k + 1} sur ${list.length}`), h("div", { class: "card" }, front, dir === "es" ? say(e.main) : null, regChip(e)), reveal, back);
    if (dir === "es") C.audio.speak(e.main);
  }
  function mark(ok) {
    const e = list[k];
    if (ok) known++;
    else
      C.store.update(K.stats(), {}, (s) => {
        for (const t of ["qes", "wes"]) {
          const x = (s[`${e.id}:${t}`] ||= { ok: 0, ko: 0, last: 0 });
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
    fill(dirSeg, segmented([{ id: "es", label: "Espagnol → français" }, { id: "fr", label: "Français → espagnol" }], dir, (d) => { dir = d; C.store.set(K.cardDir(), d); k = 0; known = 0; drawDir(); draw(); }));
  drawDir();
  draw();
  return screen(bar({ title: "Cartes", subtitle: g.title, back: `#/expressions/groupe/${id}`, lang: "fr" }), h("section", { class: "sheet" }, dirSeg, stage));
}

// ---------- Entraînement ----------

function idsFor({ scope, group, level }) {
  const rev = reviewed();
  if (scope === "group") return E.groupOf[group]?.ids || [];
  if (scope === "level") return E.items.filter((e) => e.lvl === level).map((e) => e.id);
  return E.items.filter((e) => rev[e.group]).map((e) => e.id);
}

function practiceTab() {
  const has = Object.keys(reviewed()).length > 0;
  const saved = C.store.get(K.setup(), {});
  const st = { scope: saved.scope && saved.scope !== "group" ? saved.scope : has ? "reviewed" : "level", level: saved.level || "A1", types: saved.types || [...DEFAULT_TYPES], count: saved.count || 20 };
  const wrap = h("div");
  const draw = () => {
    const n = idsFor(st).length;
    fill(
      wrap,
      h("p", { class: "field-label" }, "Quelles expressions"),
      segmented([{ id: "reviewed", label: "Mes groupes révisés" }, { id: "level", label: "Un niveau" }], st.scope, (id) => { st.scope = id; draw(); }),
      st.scope === "level" ? [h("p", { class: "field-label" }, "Niveau"), segmented(C.pack.levels.map((l) => ({ id: l, label: l })), st.level, (id) => { st.level = id; draw(); }, { scroll: true })] : null,
      h("p", { class: "small muted" }, st.scope === "reviewed" && !has ? "Tu n'as encore marqué aucun groupe comme révisé. Ouvre un groupe dans l'onglet Expressions, ou choisis un niveau." : `${n} expressions. Pour un seul groupe, ouvre-le dans l'onglet Expressions.`),
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
            h("span", { class: "row-text" }, h("span", { class: "row-title" }, TYPE_LABELS[t]), TYPE_HINTS[t] ? h("span", { class: "row-sub" }, TYPE_HINTS[t]) : null)
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
  const items = E.build({ ids: idsFor(opts), types: opts.types, n: opts.count, stats: C.store.get(K.stats(), {}) });
  if (!items.length) return toast("Aucune expression avec ces choix.");
  session = { mode: "practice", items, index: 0, results: [], opts, back: opts.scope === "group" ? `#/expressions/groupe/${opts.group}` : "#/expressions/entrainement" };
  openSession();
}

// ---------- Test ----------

function testTab() {
  const ids = idsFor({ scope: "reviewed" });
  const history = C.store.get(K.tests(), []);
  return [
    h("p", { class: "lead" }, "Un test, ce sont 20 questions sur tes groupes révisés : QCM, phrases à compléter, traductions dans les deux sens, et quatre phrases entières à traduire. La correction arrive à la fin."),
    ids.length ? h("p", { class: "small muted" }, `${ids.length} expressions révisées. Celles que tu rates reviennent plus souvent.`) : h("p", { class: "empty" }, "Marque d'abord des groupes comme révisés dans l'onglet Expressions."),
    h("div", { class: "actions" }, ids.length ? h("button", { class: "btn", type: "button", onclick: startTest }, "Commencer un test") : h("a", { class: "btn", href: "#/expressions/liste" }, "Voir les groupes")),
    history.length ? h("h2", { class: "section-title" }, "Tests passés") : null,
    history.length ? h("div", { class: "rows" }, history.slice(-15).reverse().map((t) => h("div", { class: "row" }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, fmtDate(t.ts)), h("span", { class: "row-sub" }, `${t.count} expressions révisées à ce moment-là`)), h("span", { class: "row-end" }, `${t.score} / ${t.total}`)))) : null,
  ];
}

function startTest() {
  const ids = idsFor({ scope: "reviewed" });
  const items = E.buildTest({ ids, stats: C.store.get(K.stats(), {}) });
  if (!items.length) return toast("Marque d'abord des groupes comme révisés.");
  session = { mode: "test", items, index: 0, results: [], back: "#/expressions/test", count: ids.length };
  openSession();
}

// ---------- Déroulé d'une série ----------

function record(id, ok, undo = false) {
  C.store.update(K.stats(), {}, (s) => {
    const x = (s[id] ||= { ok: 0, ko: 0, last: 0 });
    if (undo) x.ko = Math.max(0, x.ko - 1);
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

  function next() {
    if (S.index >= S.items.length) return finish();
    const item = S.items[S.index];
    progress.textContent = `Question ${S.index + 1} sur ${S.items.length}`;
    const el = EX.render(item, {
      accentKeys: C.pack.accentKeys,
      test,
      speak,
      onAnswer: (answer, res, out) => {
        const result = { item, answer, res };
        S.results.push(result);
        record(item.id, res.ok);
        if (test) { S.index++; return setTimeout(next, item.t === "S" ? 350 : 150); }
        if (res.ok) speak(item.full);
        const last = S.index + 1 >= S.items.length;
        const nextBtn = h("button", { class: "btn", type: "button", onclick: () => { S.index++; next(); } }, last ? "Voir le bilan" : "Question suivante");
        const html = res.self ? item.why : res.ok ? res.html : `${res.html}${res.html.includes(item.why) ? "" : item.why}`;
        const draw = () => {
          const override = !result.res.ok && item.selfGrade && !result.res.accentOnly
            ? h("button", { class: "btn ghost", type: "button", onclick: () => { result.res = { ...result.res, ok: true, html: `<p>Compté comme juste.</p>${item.why}` }; record(item.id, true, true); draw(); } }, "J'avais juste, compter comme bon")
            : null;
          fill(out, EX.feedback(item, { ...result.res, html: result.res.ok && !res.ok ? result.res.html : html }, speak), h("div", { class: "actions" }, nextBtn, override));
        };
        draw();
        setTimeout(() => nextBtn.focus({ preventScroll: true }), 60);
      },
    });
    fill(stage, h("p", { class: "item-tense" }, TYPE_LABELS[item.type]), el);
    window.scrollTo(0, 0);
  }

  function finish() {
    progress.textContent = "Terminé";
    const score = () => S.results.filter((r) => r.res.ok).length;
    const total = S.results.length;
    if (test && !S.saved) {
      S.saved = Date.now();
      C.store.update(K.tests(), [], (l) => (l.push({ ts: S.saved, score: score(), total, count: S.count }), l.slice(-100)));
    }
    const updateSaved = () => test && C.store.update(K.tests(), [], (l) => l.map((t) => (t.ts === S.saved ? { ...t, score: score() } : t)));
    const scoreLine = h("p", { class: "result-line" });
    const drawScore = () => { const ok = score(); scoreLine.textContent = `${ok} bonne${ok > 1 ? "s" : ""} réponse${ok > 1 ? "s" : ""} sur ${total}`; };
    drawScore();
    const wrong = S.results.filter((r) => !r.res.ok);
    const shown = test ? S.results : wrong;
    const answerText = (r) => (r.item.t === "Q" ? r.item.o[Number(r.answer)] : r.item.t === "V" ? (r.answer === "true" ? "Vrai" : "Faux") : r.answer) || "(vide)";
    const row = (r) => {
      const e = E.byId[r.item.eid];
      const box = h("div");
      const draw = () => {
        const canFix = !r.res.ok && r.item.selfGrade && !r.res.accentOnly;
        fill(
          box,
          h(
            "div",
            { class: `row recap-row ${r.res.ok ? "ok" : "ko"}` },
            h(
              "div",
              { class: "row-text" },
              h("span", { class: "row-title" }, es(e.main), h("span", { class: "muted" }, ` : ${e.fr}`)),
              h("span", { class: "row-sub" }, `${TYPE_LABELS[r.item.type]}. `, r.res.ok ? (r.res.self ? "Juste, selon toi." : "Juste.") : ["Ta réponse : ", h("span", { lang: r.item.t === "W" ? r.item.lang : "fr" }, answerText(r))]),
              r.item.t === "S" ? h("span", { class: "row-sub" }, `Traduction proposée : ${r.item.ref}`) : null,
              canFix ? h("button", { class: "btn ghost small-btn", type: "button", onclick: () => { r.res = { ...r.res, ok: true }; record(r.item.id, true, true); updateSaved(); drawScore(); draw(); } }, "J'avais juste, compter comme bon") : null
            ),
            h("span", { class: "row-end" }, say(e.main))
          )
        );
      };
      draw();
      return box;
    };
    fill(
      stage,
      scoreLine,
      h("p", { class: "small muted" }, wrong.length ? (test ? "Voici la correction complète. Si une traduction refusée était juste, tu peux la compter comme bonne." : "Les expressions à revoir :") : "Aucune erreur sur cette série."),
      h("div", { class: "rows recap" }, shown.map(row)),
      h(
        "div",
        { class: "actions" },
        wrong.length ? h("button", { class: "btn", type: "button", onclick: () => { session = { ...S, mode: "practice", items: shuffle(S.results.filter((r) => !r.res.ok).map((r) => E.item(E.byId[r.item.eid], r.item.type))), index: 0, results: [], saved: false }; refresh(); } }, "Refaire les erreurs") : null,
        test ? h("button", { class: "btn secondary", type: "button", onclick: startTest }, "Nouveau test") : h("button", { class: "btn secondary", type: "button", onclick: () => (S.opts ? startPractice(S.opts) : go("/expressions/entrainement")) }, "Nouvelle série"),
        h("a", { class: "btn ghost", href: S.back }, "Terminer")
      )
    );
  }

  next();
  return screen(top, stage);
}
