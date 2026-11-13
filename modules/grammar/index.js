// Module Grammaire : leçons par niveau, points révisés, entraînement et tests.

import { h, es, icon, topbar, segmented, toast, fmtDate, fill } from "../../core/ui.js";
import { render as md } from "../../core/md.js";
import { go, refresh, current } from "../../core/router.js";
import { shuffle } from "../../core/check.js";
import * as EX from "../../core/exercise.js";

let C, M, D; // contexte, description du module, données (points + exercices)
let session = null;
const SESSION = "/grammar/serie/en-cours";

const K = {
  reviewed: () => C.key("grammar/reviewed"),
  stats: () => C.key("grammar/stats"),
  read: () => C.key("grammar/lessonsRead"),
  tests: () => C.key("grammar/tests"),
  tab: () => C.key("grammar/tab"),
  setup: () => C.key("grammar/setup"),
};
const reviewed = () => C.store.get(K.reviewed(), {});
const byId = () => Object.fromEntries(D.points.map((p) => [p.id, p]));

async function data() {
  if (!D) D = await C.loadJSON(C.pack.grammar.data);
  return D;
}

export function register({ ctx, route }) {
  C = ctx;
  M = ctx.pack.modules.find((m) => m.id === "grammar");
  route("/grammar", async () => { await data(); return tabs(C.store.get(K.tab(), "lecons")); });
  route("/grammar/:tab", async ({ tab, q }) => { await data(); return tabs(tab, q); });
  route("/grammar/lecon/:id", async ({ id }) => { await data(); return lesson(id); });
  route(SESSION, async () => { await data(); return sessionView(); });
}

export function summary() {
  const n = Object.keys(reviewed()).length;
  return n ? `${n} point${n > 1 ? "s" : ""} révisé${n > 1 ? "s" : ""}` : "Commencer";
}

const remember = (label) => C.store.set("nav/last", { path: current(), label });
const levelChip = (lvl) => h("span", { class: `chip lvl-${lvl.toLowerCase()}` }, lvl);
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const lessonLink = (pid) => `<a href="#/grammar/lecon/${pid}">Revoir la leçon : ${lc(byId()[pid].fr)}</a>`;

const TABS = [
  { id: "lecons", label: "Leçons" },
  { id: "entrainement", label: "S'entraîner" },
  { id: "test", label: "Tester" },
];

function tabs(tab, q = {}) {
  if (!TABS.some((t) => t.id === tab)) tab = "lecons";
  C.store.set(K.tab(), tab);
  remember(`Gramática, ${TABS.find((t) => t.id === tab).label.toLowerCase()}`);
  const hd = topbar({ title: M.title, subtitle: M.subtitle, color: M.color, ink: M.ink });
  hd.append(segmented(TABS, tab, (id) => go(`/grammar/${id}`), { label: "Sections du module Grammaire" }));
  const body = { lecons: lessonsTab, entrainement: practiceTab, test: testTab }[tab](q);
  return h("main", { class: "screen", style: { "--band": M.color } }, hd, h("section", { class: "sheet" }, body));
}

// ---------- Leçons, regroupées par niveau ----------

function lessonsTab() {
  const read = C.store.get(K.read(), {});
  const rev = reviewed();
  const out = [h("p", { class: "lead" }, "Les règles qui comptent pour devenir bilingue, du niveau A1 au C2. Coche un point quand tu l'as révisé : il entrera dans tes tests.")];
  for (const lvl of C.pack.levels) {
    const pts = D.points.filter((p) => p.level === lvl);
    if (!pts.length) continue;
    const done = pts.filter((p) => rev[p.id]).length;
    out.push(h("h2", { class: "section-title level-title" }, levelChip(lvl), h("span", {}, ` ${done ? `${done} sur ${pts.length} révisés` : `${pts.length} point${pts.length > 1 ? "s" : ""}`}`)));
    out.push(
      h(
        "div",
        { class: "rows" },
        pts.map((p) => {
          const on = !!rev[p.id];
          const box = h(
            "button",
            { class: `check${on ? " on" : ""}`, type: "button", "aria-pressed": String(on), "aria-label": `${p.fr} : révisé`, onclick: () => { toggle(p.id); refresh(); } },
            icon("check")
          );
          return h(
            "div",
            { class: "row split" },
            h("a", { class: "row-main", href: `#/grammar/lecon/${p.id}` }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, p.fr), h("span", { class: "row-sub" }, es(p.es), read[p.id] ? ", leçon lue" : "")), h("span", { class: "row-end muted small" }, `${p.n} ex.`)),
            box
          );
        })
      )
    );
  }
  return out;
}

function toggle(pid) {
  let on;
  C.store.update(K.reviewed(), {}, (r) => {
    on = !r[pid];
    on ? (r[pid] = Date.now()) : delete r[pid];
    return r;
  });
  return on;
}

async function lesson(id) {
  const p = byId()[id];
  if (!p) return tabs("lecons");
  const text = await C.loadText(p.lesson);
  remember(`leçon ${lc(p.fr)}`);
  C.store.update(K.read(), {}, (r) => ((r[id] = r[id] || Date.now()), r));
  const prose = h("article", { class: "prose", html: md(text, "es") });
  prose.querySelectorAll("i[lang=es]").forEach((el) => {
    el.classList.add("say");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.addEventListener("click", () => C.audio.speak(el.textContent));
  });
  const rev = reviewed();
  const btn = h(
    "button",
    {
      class: `btn ${rev[id] ? "secondary" : ""}`,
      type: "button",
      onclick: () => {
        const on = toggle(id);
        btn.textContent = on ? "Révisé aujourd'hui, retirer" : "Marquer comme révisé";
        btn.classList.toggle("secondary", on);
        toast(on ? "Ce point entrera dans tes tests." : "Marque retirée.");
      },
    },
    rev[id] ? `Révisé le ${fmtDate(rev[id])}, retirer` : "Marquer comme révisé"
  );
  const idx = D.points.findIndex((x) => x.id === id);
  const next = D.points[idx + 1];
  return h(
    "main",
    { class: "screen", style: { "--band": M.color } },
    topbar({ title: p.es, subtitle: `${p.fr}, niveau ${p.level}`, color: M.color, ink: M.ink, back: "#/grammar/lecons" }),
    h(
      "section",
      { class: "sheet" },
      h("p", { class: "hint" }, "Touche un exemple en espagnol pour l'écouter."),
      prose,
      h(
        "div",
        { class: "actions" },
        h("button", { class: "btn", type: "button", onclick: () => startPractice({ scope: "point", point: id, count: 12 }) }, `M'entraîner (${p.n} exercices)`),
        btn
      ),
      next ? h("a", { class: "next-link", href: `#/grammar/lecon/${next.id}` }, `Leçon suivante : ${next.fr}`) : null
    )
  );
}

// ---------- Entraînement ----------

function poolFor({ scope, point, level }) {
  const rev = reviewed();
  let pids;
  if (scope === "point") pids = [point];
  else if (scope === "level") pids = D.points.filter((p) => p.level === level).map((p) => p.id);
  else pids = Object.keys(rev).filter((k) => D.ex[k]);
  return pids.flatMap((pid) => D.ex[pid].map((it) => ({ ...it, pid })));
}

function practiceTab() {
  const rev = reviewed();
  const has = Object.keys(rev).length > 0;
  const saved = C.store.get(K.setup(), {});
  const st = { scope: saved.scope && saved.scope !== "point" ? saved.scope : has ? "reviewed" : "level", level: saved.level || "A1", count: saved.count || 15 };
  const wrap = h("div");
  const draw = () => {
    const pool = poolFor(st);
    fill(
      wrap,
      h("p", { class: "field-label" }, "Quoi travailler"),
      segmented([{ id: "reviewed", label: "Mes points révisés" }, { id: "level", label: "Un niveau" }], st.scope, (id) => { st.scope = id; draw(); }),
      st.scope === "level" ? [h("p", { class: "field-label" }, "Niveau"), segmented(C.pack.levels.map((l) => ({ id: l, label: l })), st.level, (id) => { st.level = id; draw(); }, { scroll: true })] : null,
      h("p", { class: "small muted" }, st.scope === "reviewed" && !has ? "Tu n'as encore coché aucun point. Ouvre une leçon et marque-la comme révisée, ou choisis un niveau." : `${pool.length} exercices disponibles. Pour travailler un seul point, ouvre sa leçon.`),
      h("p", { class: "field-label" }, "Nombre de questions"),
      segmented([10, 15, 25].map((n) => ({ id: n, label: String(n) })), st.count, (id) => { st.count = id; draw(); }),
      h("div", { class: "actions" }, h("button", { class: "btn", type: "button", disabled: !pool.length, onclick: () => { C.store.set(K.setup(), st); startPractice(st); } }, "Commencer"))
    );
  };
  draw();
  return [h("p", { class: "lead" }, "Phrases à trous, choix multiples, phrases à remettre dans l'ordre, vrai ou faux : les types se mélangent."), wrap];
}

function pickItems(pool, n, stats) {
  const w = (it) => {
    const s = stats[it.id] || { ok: 0, ko: 0, last: 0 };
    const days = s.last ? (Date.now() - s.last) / 864e5 : 30;
    return Math.max(0.2, 1 + 2 * s.ko - 0.6 * s.ok) * (1 + Math.min(days, 30) / 10);
  };
  const chosen = [];
  const left = pool.slice();
  // Varier les points : pas deux exercices identiques, et alternance des points quand c'est possible.
  while (chosen.length < n && left.length) {
    const total = left.reduce((a, it) => a + w(it), 0);
    let r = Math.random() * total;
    let k = 0;
    for (; k < left.length - 1; k++) if ((r -= w(left[k])) <= 0) break;
    const [it] = left.splice(k, 1);
    if (chosen.length && chosen[chosen.length - 1].pid === it.pid && left.some((x) => x.pid !== it.pid) && Math.random() < 0.6) {
      left.push(it);
      continue;
    }
    chosen.push(it);
  }
  return chosen;
}

const openSession = () => (current() === SESSION ? refresh() : go(SESSION));

function startPractice(opts) {
  const items = pickItems(poolFor(opts), opts.count, C.store.get(K.stats(), {}));
  if (!items.length) return toast("Aucun exercice avec ces choix.");
  session = { mode: "practice", items, index: 0, results: [], opts, back: opts.scope === "point" ? `#/grammar/lecon/${opts.point}` : "#/grammar/entrainement" };
  openSession();
}

// ---------- Test ----------

function testTab() {
  const rev = reviewed();
  const n = Object.keys(rev).length;
  const history = C.store.get(K.tests(), []);
  return [
    h("p", { class: "lead" }, "Un test, ce sont 10 questions tirées des points que tu as cochés. La correction arrive à la fin, avec une explication pour chaque erreur."),
    n ? h("p", { class: "small muted" }, `${n} point${n > 1 ? "s" : ""} révisé${n > 1 ? "s" : ""}. Les questions ratées reviennent plus souvent.`) : h("p", { class: "empty" }, "Coche d'abord des points révisés dans l'onglet Leçons."),
    h("div", { class: "actions" }, n ? h("button", { class: "btn", type: "button", onclick: startTest }, "Commencer un test") : h("a", { class: "btn", href: "#/grammar/lecons" }, "Voir les leçons")),
    history.length ? h("h2", { class: "section-title" }, "Tests passés") : null,
    history.length
      ? h("div", { class: "rows" }, history.slice(-15).reverse().map((t) => h("div", { class: "row" }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, fmtDate(t.ts)), h("span", { class: "row-sub" }, t.points.join(", "))), h("span", { class: "row-end" }, `${t.score} / ${t.total}`))))
      : null,
  ];
}

function startTest() {
  const items = pickItems(poolFor({ scope: "reviewed" }), 10, C.store.get(K.stats(), {}));
  if (!items.length) return toast("Coche d'abord des points révisés.");
  session = { mode: "test", items, index: 0, results: [], back: "#/grammar/test" };
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

  function next() {
    if (S.index >= S.items.length) return finish();
    const item = S.items[S.index];
    const p = byId()[item.pid];
    progress.textContent = `Question ${S.index + 1} sur ${S.items.length}`;
    const el = EX.render(item, {
      accentKeys: C.pack.accentKeys,
      test,
      lessonLink: lessonLink(item.pid),
      onAnswer: (answer, res, out) => {
        S.results.push({ item, answer, res });
        record(item, res.ok);
        if (test) { S.index++; return setTimeout(next, 150); }
        const last = S.index + 1 >= S.items.length;
        const btn = h("button", { class: "btn", type: "button", onclick: () => { S.index++; next(); } }, last ? "Voir le bilan" : "Question suivante");
        fill(out, EX.feedback(item, res, (t) => C.audio.speak(t)), h("div", { class: "actions" }, btn));
        setTimeout(() => btn.focus({ preventScroll: true }), 60);
      },
    });
    fill(stage, h("p", { class: "item-tense" }, p.fr), el);
    window.scrollTo(0, 0);
  }

  function finish() {
    const ok = S.results.filter((r) => r.res.ok).length;
    const total = S.results.length;
    progress.textContent = "Terminé";
    if (test && !S.saved) {
      S.saved = true;
      C.store.update(K.tests(), [], (l) => (l.push({ ts: Date.now(), score: ok, total, points: [...new Set(S.items.map((i) => byId()[i.pid].fr))] }), l.slice(-100)));
    }
    const wrong = S.results.filter((r) => !r.res.ok);
    const shown = test ? S.results : wrong;
    const answerText = (r) => (r.item.t === "Q" ? r.item.o[Number(r.answer)] : r.item.t === "V" ? (r.answer === "true" ? "Vrai" : "Faux") : r.answer) || "(vide)";
    fill(
      stage,
      h("p", { class: "result-line" }, `${ok} bonne${ok > 1 ? "s" : ""} réponse${ok > 1 ? "s" : ""} sur ${total}`),
      h("p", { class: "small muted" }, wrong.length ? (test ? "Voici la correction complète." : "À revoir :") : "Aucune erreur sur cette série."),
      h(
        "div",
        { class: "rows recap" },
        shown.map((r) =>
          h(
            "div",
            { class: `row recap-row ${r.res.ok ? "ok" : "ko"}` },
            h(
              "div",
              { class: "row-text" },
              h("span", { class: "row-title" }, r.item.t === "V" ? h("span", { html: r.item.q }) : es(r.item.full || r.item.a?.[0] || r.item.q)),
              h("span", { class: "row-sub" }, r.res.ok ? "Juste : " : "Ta réponse : ", es(answerText(r)), r.res.ok ? null : [" ; attendu : ", es(r.res.correct)]),
              !r.res.ok && r.res.html ? h("div", { class: "feedback-text small", html: r.res.html }) : null
            )
          )
        )
      ),
      h(
        "div",
        { class: "actions" },
        wrong.length ? h("button", { class: "btn", type: "button", onclick: () => { session = { ...S, mode: "practice", items: shuffle(wrong.map((r) => r.item)), index: 0, results: [], saved: false }; refresh(); } }, "Refaire les erreurs") : null,
        test ? h("button", { class: "btn secondary", type: "button", onclick: startTest }, "Nouveau test") : h("button", { class: "btn secondary", type: "button", onclick: () => (S.opts ? startPractice(S.opts) : go("/grammar/entrainement")) }, "Nouvelle série"),
        h("a", { class: "btn ghost", href: S.back }, "Terminer")
      )
    );
  }

  next();
  return h("main", { class: "screen session", style: { "--band": M.color } }, bar, stage);
}
