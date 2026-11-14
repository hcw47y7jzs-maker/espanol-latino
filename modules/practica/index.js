// Module Práctica : phrases, textes, écoute, lecture, écriture — corrigés par l'IA quand une clé Groq est enregistrée.

import { h, es, icon, topbar, segmented, toast, fmtDate, fill } from "../../core/ui.js";
import { go, refresh, current } from "../../core/router.js";
import { shuffle } from "../../core/check.js";
import * as EX from "../../core/exercise.js";
import { createPracticaEngine, promptVariant } from "./engine.js";
import { renderTranslate, renderWriting, writingResult } from "./cards.js";

let C, M, D, E;
let session = null;
const SESSION = "/practice/serie/en-cours";
const LV = ["A1", "A2", "B1", "B2", "C1", "C2"];

const K = {
  stats: () => C.key("practica/stats"),
  done: () => C.key("practica/done"),
  tests: () => C.key("practica/tests"),
  level: () => C.key("practica/level"),
  dir: () => C.key("practica/dir"),
  writings: () => C.key("practica/writings"),
  draft: (id) => C.key(`practica/draft/${id}`),
};
const level = () => C.store.get(K.level(), "A1");

const SUBS = [
  { id: "frases", title: "Phrases", es: "Frases", text: "Traduire des phrases dans les deux sens, corrigées par l'IA, avec mini-leçon en cas d'erreur.", icon: "check" },
  { id: "textos", title: "Textes", es: "Textos", text: "Traduire des textes entiers ou phrase par phrase.", icon: "check" },
  { id: "escucha", title: "Écoute", es: "Comprensión oral", text: "Dialogues et annonces : questions, dictées, sens des répliques.", icon: "speaker" },
  { id: "lectura", title: "Lecture", es: "Comprensión escrita", text: "Articles, lettres, récits : questions et vocabulaire en contexte.", icon: "search" },
  { id: "escritura", title: "Écriture", es: "Expresión escrita", text: "Un sujet, ton texte, une correction détaillée et une mini-leçon.", icon: "check" },
];
const LABELS = { question: "Compréhension", vocab: "Vocabulaire en contexte", sens: "Sens", titre: "Titre du texte", dictee: "Dictée", suite: "Suite logique", theme: "Thème (français → espagnol)", version: "Version (espagnol → français)" };

async function data() {
  if (!D) {
    D = await C.loadJSON(C.pack.practica.data);
    E = createPracticaEngine(D);
  }
}

export function register({ ctx, route }) {
  C = ctx;
  M = ctx.pack.modules.find((m) => m.id === "practice");
  route("/practice", async () => { await data(); return hub(); });
  route("/practice/frases", async () => { await data(); return frasesPage(); });
  route("/practice/textos", async () => { await data(); return listPage("textos"); });
  route("/practice/textos/:id", async ({ id }) => { await data(); return textoPage(id); });
  route("/practice/lectura", async () => { await data(); return listPage("lectura"); });
  route("/practice/lectura/:id", async ({ id }) => { await data(); return lecturaPage(id); });
  route("/practice/escucha", async () => { await data(); return listPage("escucha"); });
  route("/practice/escucha/:id", async ({ id }) => { await data(); return escuchaPage(id); });
  route("/practice/escritura", async ({ q }) => { await data(); return escrituraPage(q); });
  route("/practice/escritura/sujet/:pid", async ({ pid, q }) => { await data(); return writePage(pid, q); });
  route("/practice/escritura/texte/:ts", async ({ ts }) => { await data(); return writingView(Number(ts)); });
  route(SESSION, async () => { await data(); return sessionView(); });
}

export function summary() {
  const n = Object.keys(C.store.get(K.stats(), {})).length;
  return n ? `${n} exercice${n > 1 ? "s" : ""} faits` : "Commencer";
}

const remember = (label) => C.store.set("nav/last", { path: current(), label });
const levelChip = (lvl) => h("span", { class: `chip lvl-${lvl.toLowerCase()}` }, lvl);
const say = (text) => h("button", { class: "icon-btn small", type: "button", "aria-label": "Écouter", onclick: () => C.audio.speak(text) }, icon("speaker"));
const screen = (...kids) => h("main", { class: "screen practica-screen", style: { "--band": M.color } }, ...kids);
const bar = (opts) => topbar({ color: M.color, ink: M.ink, ...opts });
const levelPicker = (onPick) => segmented(LV.map((l) => ({ id: l, label: l })), level(), (l) => { C.store.set(K.level(), l); onPick(l); }, { scroll: true, label: "Niveau" });
const aiNote = () => (C.ai.hasKey() ? null : h("div", { class: "note note-astuce" }, h("p", { class: "note-title" }, "Correction par l'IA désactivée"), h("p", {}, "Ajoute ta clé Groq dans les Réglages pour que tes traductions et tes textes soient corrigés et expliqués. En attendant, tu compares avec la traduction proposée."), h("p", {}, h("a", { href: "#/reglages" }, "Ouvrir les Réglages"))));

// ---------- Accueil du module ----------

function hub() {
  remember("Práctica");
  const done = C.store.get(K.done(), {});
  const nDone = (prefix) => Object.keys(done).filter((k) => k.startsWith(prefix)).length;
  const sub = { frases: null, textos: `${nDone("textos:")} / ${D.lecturas.length} textes`, escucha: `${nDone("escucha:")} / ${D.escuchas.length} écoutes`, lectura: `${nDone("lectura:")} / ${D.lecturas.length} lectures`, escritura: `${C.store.get(K.writings(), []).length} textes écrits` };
  return screen(
    bar({ title: M.title, subtitle: M.subtitle }),
    h("section", { class: "sheet" },
      h("p", { class: "lead" }, "Mettre en pratique tout ce que tu as appris : traduire, écouter, lire et écrire, du niveau A1 au C2."),
      aiNote(),
      h("div", { class: "rows hub-rows" }, SUBS.map((s) =>
        h("a", { class: "row link hub-row", href: `#/practice/${s.id}` },
          h("span", { class: "row-text" }, h("span", { class: "row-title" }, s.title, h("span", { class: "muted es hub-es" }, ` ${s.es}`)), h("span", { class: "row-sub" }, s.text), sub[s.id] ? h("span", { class: "row-sub hub-count" }, sub[s.id]) : null)
        )
      ))
    )
  );
}

// ---------- Phrases ----------

function frasesPage() {
  remember("Práctica, phrases");
  const st = { dir: C.store.get(K.dir(), "both"), scope: "level" };
  const gram = Object.keys(C.store.get(C.key("grammar/reviewed"), {}));
  const wrap = h("div");
  const draw = () => {
    const n = E.frasesPool(st.scope === "grammar" ? { points: gram } : { lvl: level() }).length;
    fill(
      wrap,
      h("p", { class: "lead" }, `${D.frases.length} phrases à traduire : 400 construites sur les points de grammaire, et les exemples du module Expressions. L'IA corrige, explique l'erreur et te renvoie vers la bonne leçon.`),
      aiNote(),
      h("p", { class: "field-label" }, "Quelles phrases"),
      segmented([{ id: "level", label: "Un niveau" }, { id: "grammar", label: "Ma grammaire révisée" }], st.scope, (id) => { st.scope = id; draw(); }),
      st.scope === "level" ? levelPicker(draw) : h("p", { class: "small muted" }, gram.length ? `${gram.length} points de grammaire marqués comme révisés.` : "Aucun point de grammaire marqué comme révisé pour l'instant."),
      h("p", { class: "field-label" }, "Sens de traduction"),
      segmented([{ id: "fr-es", label: "Français → espagnol" }, { id: "es-fr", label: "Espagnol → français" }, { id: "both", label: "Les deux" }], st.dir, (id) => { st.dir = id; C.store.set(K.dir(), id); draw(); }, { scroll: true }),
      h("p", { class: "small muted" }, `${n} phrases disponibles.`),
      h("div", { class: "actions" },
        h("button", { class: "btn", type: "button", disabled: !n, onclick: () => startFrases(st, false) }, "S'entraîner (10 phrases)"),
        h("button", { class: "btn secondary", type: "button", disabled: !n, onclick: () => startFrases(st, true) }, "Test (10 phrases)")
      ),
      history("frases")
    );
  };
  draw();
  return screen(bar({ title: "Phrases", subtitle: "Frases", back: "#/practice", lang: "fr" }), h("section", { class: "sheet" }, wrap));
}

function startFrases(st, test) {
  const gram = Object.keys(C.store.get(C.key("grammar/reviewed"), {}));
  const items = E.buildFrases({ ...(st.scope === "grammar" ? { points: gram } : { lvl: level() }), dir: st.dir, n: 10, stats: C.store.get(K.stats(), {}) });
  if (!items.length) return toast("Aucune phrase avec ces choix.");
  startSession({ items, test, back: "#/practice/frases", title: test ? "Test : phrases" : "Phrases", testKey: test ? "frases" : null, meta: test ? `niveau ${st.scope === "level" ? level() : "grammaire révisée"}` : null });
}

function history(key) {
  const list = C.store.get(K.tests(), []).filter((t) => t.key === key).slice(-8).reverse();
  if (!list.length) return null;
  return [h("h2", { class: "section-title" }, "Tests passés"), h("div", { class: "rows" }, list.map((t) => h("div", { class: "row" }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, fmtDate(t.ts)), t.meta ? h("span", { class: "row-sub" }, t.meta) : null), h("span", { class: "row-end" }, `${t.score} / ${t.total}`))))];
}

// ---------- Listes (textes, lectures, écoutes) ----------

const LIST = {
  textos: { title: "Textes", es: "Textos", src: () => D.lecturas, lead: "Choisis un texte à traduire, phrase par phrase ou en entier. Les mêmes textes servent aussi à la lecture." },
  lectura: { title: "Lecture", es: "Comprensión escrita", src: () => D.lecturas, lead: "Lis le texte, réponds aux questions, puis travaille le vocabulaire et le sens des phrases." },
  escucha: { title: "Écoute", es: "Comprensión oral", src: () => D.escuchas, lead: "Écoute sans lire, réponds aux questions, puis fais les dictées. Deux voix : Daniela et une voix plus grave." },
};

function listPage(kind) {
  const L = LIST[kind];
  remember(`Práctica, ${L.title.toLowerCase()}`);
  const done = C.store.get(K.done(), {});
  const wrap = h("div");
  const draw = () => {
    const list = L.src().filter((t) => t.lvl === level());
    fill(
      wrap,
      h("p", { class: "lead" }, L.lead),
      kind === "textos" ? aiNote() : null,
      levelPicker(draw),
      h("div", { class: "rows" }, list.map((t) => {
        const d = done[`${kind}:${t.id}`];
        return h("a", { class: "row link", href: `#/practice/${kind}/${t.id}` },
          h("span", { class: "row-text" }, h("span", { class: "row-title es" }, t.es), h("span", { class: "row-sub" }, `${t.fr} · ${t.kind}`)),
          h("span", { class: "row-end" }, d ? h("span", { class: "done-mark", title: `fait le ${fmtDate(d.ts)}` }, icon("check")) : null));
      })),
      kind !== "textos" ? h("div", { class: "actions" }, h("button", { class: "btn secondary", type: "button", onclick: () => startTest(kind) }, `Test : ${kind === "lectura" ? "un texte inconnu" : "une écoute inconnue"} (${level()})`)) : h("div", { class: "actions" }, h("button", { class: "btn secondary", type: "button", onclick: () => startTest(kind) }, `Test de traduction (${level()})`)),
      history(kind)
    );
  };
  draw();
  return screen(bar({ title: L.title, subtitle: L.es, back: "#/practice", lang: "fr" }), h("section", { class: "sheet" }, wrap));
}

function markDone(kind, id, extra = {}) {
  C.store.update(K.done(), {}, (d) => ((d[`${kind}:${id}`] = { ts: Date.now(), ...extra }), d));
}

function startTest(kind) {
  const done = C.store.get(K.done(), {});
  const pool = LIST[kind].src().filter((t) => t.lvl === level());
  const fresh = pool.filter((t) => !done[`${kind}:${t.id}`]);
  const t = shuffle(fresh.length ? fresh : pool)[0];
  if (!t) return toast("Aucun texte à ce niveau.");
  if (kind === "lectura") {
    const items = [...E.questions(t), ...shuffle(E.lecturaItems(t).filter((x) => x.type === "vocab")).slice(0, 4)];
    startSession({ items, test: true, back: "#/practice/lectura", title: "Test : lecture", testKey: "lectura", meta: `${t.es} (${t.lvl})`, header: () => readingHeader(t, true), onFinish: () => markDone("lectura", t.id) });
  } else if (kind === "escucha") {
    const dict = shuffle(E.escuchaItems(t).filter((x) => x.type === "dictee")).slice(0, 3);
    startSession({ items: [...E.questions(t), ...dict], test: true, back: "#/practice/escucha", title: "Test : écoute", testKey: "escucha", meta: `${t.es} (${t.lvl})`, header: () => listenHeader(t), onFinish: () => markDone("escucha", t.id) });
  } else {
    const picks = shuffle(t.lines.map((ln, k) => [ln, k])).slice(0, 4).sort((a, b) => a[1] - b[1]);
    const items = picks.map(([ln, k], i) => ({ id: `${t.id}:t${k}:${i % 2 ? "fr-es" : "es-fr"}`, type: i % 2 ? "theme" : "version", t: "TR", from: i % 2 ? "fr" : "es", to: i % 2 ? "es" : "fr", source: i % 2 ? ln.fr : ln.es, refs: [i % 2 ? ln.es : ln.fr], lvl: t.lvl, full: ln.es }));
    startSession({ items, test: true, back: "#/practice/textos", title: "Test : traduction", testKey: "textos", meta: `${t.es} (${t.lvl})`, header: () => h("p", { class: "small muted" }, `Phrases tirées de « ${t.es} »`), onFinish: () => markDone("textos", t.id) });
  }
}

// ---------- Traduction de textes ----------

function textoPage(id) {
  const t = E.lectura[id];
  if (!t) return listPage("textos");
  remember(`${t.es}, traduction`);
  const run = (mode, dir) => {
    const toEs = dir === "fr-es";
    let items;
    if (mode === "phrases") {
      items = t.lines.map((ln, k) => ({ id: `${t.id}:t${k}:${dir}`, type: toEs ? "theme" : "version", t: "TR", from: toEs ? "fr" : "es", to: toEs ? "es" : "fr", source: toEs ? ln.fr : ln.es, refs: [toEs ? ln.es : ln.fr], lvl: t.lvl, full: ln.es, context: k ? h("p", { class: "small muted", lang: toEs ? "fr" : "es" }, `… ${toEs ? t.lines[k - 1].fr : t.lines[k - 1].es}`) : null }));
    } else {
      const src = t.lines.map((ln) => (toEs ? ln.fr : ln.es)).join(" ");
      const ref = t.lines.map((ln) => (toEs ? ln.es : ln.fr)).join(" ");
      items = [{ id: `${t.id}:texte:${dir}`, type: toEs ? "theme" : "version", t: "TR", from: toEs ? "fr" : "es", to: toEs ? "es" : "fr", source: src, refs: [ref], lvl: t.lvl, full: t.es }];
    }
    startSession({ items, test: false, back: `#/practice/textos/${id}`, title: "Traduction", onFinish: () => markDone("textos", id) });
  };
  return screen(
    bar({ title: t.es, subtitle: `${t.fr}, niveau ${t.lvl}`, back: "#/practice/textos", lang: "es" }),
    h("section", { class: "sheet" },
      aiNote(),
      h("div", { class: "reading" }, t.lines.map((ln) => h("p", { class: "reading-line", lang: "es" }, ln.es))),
      h("p", { class: "field-label" }, "Phrase par phrase"),
      h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => run("phrases", "es-fr") }, "Espagnol → français"), h("button", { class: "btn secondary", type: "button", onclick: () => run("phrases", "fr-es") }, "Français → espagnol")),
      h("p", { class: "field-label" }, "Le texte entier d'un coup"),
      h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => run("texte", "es-fr") }, "Espagnol → français"), h("button", { class: "btn secondary", type: "button", onclick: () => run("texte", "fr-es") }, "Français → espagnol"))
    )
  );
}

// ---------- Lecture ----------

function readingHeader(t, open = false) {
  const det = h("details", { class: "reading-box", open: open ? "" : null }, h("summary", {}, `Le texte : ${t.es}`), h("div", { class: "reading" }, t.lines.map((ln) => h("p", { class: "reading-line", lang: "es" }, ln.es))));
  return det;
}

function lecturaPage(id) {
  const t = E.lectura[id];
  if (!t) return listPage("lectura");
  remember(`${t.es}, lecture`);
  const showFr = h("div", { class: "reading" });
  let tr = false;
  const draw = () => fill(showFr, t.lines.map((ln) => h("p", { class: "reading-line", lang: "es" }, ln.es, tr ? h("span", { class: "reading-fr", lang: "fr" }, ln.fr) : null)));
  draw();
  const all = E.lecturaItems(t);
  const go2 = (items, title) => startSession({ items, test: false, back: `#/practice/lectura/${id}`, title, header: () => readingHeader(t), onFinish: () => markDone("lectura", id) });
  return screen(
    bar({ title: t.es, subtitle: `${t.fr}, niveau ${t.lvl}`, back: "#/practice/lectura", lang: "es" }),
    h("section", { class: "sheet" },
      h("p", { class: "small muted" }, `${t.kind}. Lis le texte une première fois sans traduction.`),
      showFr,
      h("div", { class: "actions" }, h("button", { class: "btn ghost", type: "button", onclick: (ev) => { tr = !tr; draw(); ev.target.textContent = tr ? "Masquer la traduction" : "Afficher la traduction"; } }, "Afficher la traduction")),
      h("p", { class: "field-label" }, "Exercices"),
      h("div", { class: "actions" },
        h("button", { class: "btn", type: "button", onclick: () => go2([...E.questions(t), all.find((x) => x.type === "titre")], "Compréhension") }, `Questions (${t.q.length + 1})`),
        h("button", { class: "btn secondary", type: "button", onclick: () => go2(all.filter((x) => x.type === "vocab"), "Vocabulaire") }, `Vocabulaire (${all.filter((x) => x.type === "vocab").length})`),
        h("button", { class: "btn secondary", type: "button", onclick: () => go2(shuffle(all.filter((x) => x.type === "sens")), "Sens des phrases") }, `Sens des phrases (${t.lines.length})`)
      )
    )
  );
}

// ---------- Écoute ----------

function listenHeader(t) {
  const lines = t.lines.map((ln) => E.voiced(t, ln));
  return h("div", { class: "listen-wrap" }, h("button", { class: "listen-btn", type: "button", onclick: () => C.audio.speakSequence(lines, 450) }, icon("speaker"), h("span", {}, "Écouter le dialogue")));
}

function escuchaPage(id) {
  const t = E.escucha[id];
  if (!t) return listPage("escucha");
  remember(`${t.es}, écoute`);
  const all = E.escuchaItems(t);
  const transcript = h("details", { class: "reading-box" }, h("summary", {}, "Transcription et traduction"), h("div", { class: "reading" }, t.lines.map((ln) =>
    h("p", { class: "reading-line", lang: "es" }, h("b", { class: `spk spk-${ln.sp}` }, `${t.speakers[ln.sp] || ln.sp} : `), ln.es, say(E.voiced(t, ln)), h("span", { class: "reading-fr", lang: "fr" }, ln.fr))
  )));
  const go2 = (items, title) => startSession({ items, test: false, back: `#/practice/escucha/${id}`, title, header: () => listenHeader(t), onFinish: () => markDone("escucha", id) });
  return screen(
    bar({ title: t.es, subtitle: `${t.fr}, niveau ${t.lvl}`, back: "#/practice/escucha", lang: "es" }),
    h("section", { class: "sheet" },
      h("p", { class: "small muted" }, `${t.kind}. ${Object.entries(t.speakers).map(([k, v]) => `${k === "A" ? "voix 1" : "voix 2"} : ${v}`).join(" ; ")}.`),
      listenHeader(t),
      h("p", { class: "small muted center" }, "Écoute une ou deux fois avant de lire la transcription."),
      h("p", { class: "field-label" }, "Exercices"),
      h("div", { class: "actions" },
        h("button", { class: "btn", type: "button", onclick: () => go2(E.questions(t), "Compréhension") }, `Questions (${t.q.length})`),
        h("button", { class: "btn secondary", type: "button", onclick: () => go2(all.filter((x) => x.type === "dictee"), "Dictée") }, `Dictée (${t.lines.length})`),
        h("button", { class: "btn secondary", type: "button", onclick: () => go2(shuffle(all.filter((x) => x.type === "sens" || x.type === "suite")), "Sens et suite") }, "Sens et suite logique")
      ),
      transcript
    )
  );
}

// ---------- Écriture ----------

function escrituraPage(q = {}) {
  remember("Práctica, écriture");
  const tab = q.tab === "textes" ? "textes" : "sujets";
  const wrap = h("div");
  const writings = C.store.get(K.writings(), []);
  const draw = () => {
    const prompts = D.escritura.prompts.filter((p) => p.lvl === level());
    fill(
      wrap,
      segmented([{ id: "sujets", label: "Sujets" }, { id: "textes", label: `Mes textes (${writings.length})` }], tab, (id) => go(`/practice/escritura?tab=${id}`)),
      tab === "sujets"
        ? [
            aiNote(),
            levelPicker(draw),
            h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => { const p = shuffle(prompts)[0]; go(`/practice/escritura/sujet/${p.id}?v=${Math.floor(Math.random() * 1000)}`); } }, "Un sujet au hasard"), h("button", { class: "btn secondary", type: "button", onclick: () => { const p = shuffle(prompts)[0]; go(`/practice/escritura/sujet/${p.id}?v=${Math.floor(Math.random() * 1000)}&test=1`); } }, "Test d'écriture")),
            h("div", { class: "rows" }, prompts.map((p) => h("a", { class: "row link", href: `#/practice/escritura/sujet/${p.id}?v=0` }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, promptVariant(p.text, 0)), h("span", { class: "row-sub" }, `${p.genre}, ${p.min} à ${p.max} mots${p.combos > 1 ? `, ${p.combos} variantes` : ""}`))))),
            history("escritura"),
          ]
        : writings.length
          ? h("div", { class: "rows" }, writings.slice().reverse().map((w) => h("a", { class: "row link", href: `#/practice/escritura/texte/${w.ts}` }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, w.prompt.slice(0, 90) + (w.prompt.length > 90 ? "…" : "")), h("span", { class: "row-sub" }, `${fmtDate(w.ts)}, ${w.lvl}${w.result?.note != null ? `, ${w.result.note}/20` : ""}`)))))
          : h("p", { class: "empty" }, "Tes textes corrigés apparaîtront ici.")
    );
  };
  draw();
  return screen(bar({ title: "Écriture", subtitle: "Expresión escrita", back: "#/practice", lang: "fr" }), h("section", { class: "sheet" }, wrap));
}

function writePage(pid, q = {}) {
  const p = D.escritura.prompts.find((x) => x.id === pid);
  if (!p) return escrituraPage();
  const v = Number(q.v || 0);
  const test = q.test === "1";
  const defis = D.escritura.defis[p.lvl] || [];
  let d = q.d !== undefined ? Number(q.d) : -1;
  const prompt = promptVariant(p.text, v);
  const draftKey = K.draft(`${pid}-${v}`);
  const holder = h("div");
  const draw = () => {
    const task = { lvl: p.lvl, prompt, defi: d >= 0 ? defis[d] : null, min: p.min, max: p.max, points: p.points, pid, v };
    fill(
      holder,
      !test && defis.length ? [h("p", { class: "field-label" }, "Défi facultatif"), segmented([{ id: -1, label: "Aucun" }, ...defis.map((_, i) => ({ id: i, label: `Défi ${i + 1}` }))], d, (id) => { d = id; draw(); })] : null,
      renderWriting(task, {
        C, E,
        draft: C.store.get(draftKey, ""),
        onDraft: (t) => C.store.set(draftKey, t),
        onResult: (r, text) => {
          C.store.set(draftKey, "");
          C.store.update(K.writings(), [], (l) => (l.push({ ts: Date.now(), pid, v, lvl: p.lvl, prompt, defi: task.defi, text, result: r }), l.slice(-200)));
          C.store.update(K.stats(), {}, (s) => ((s[`ee:${pid}:${v}:${d}`] = { ok: r && r.note >= 10 ? 1 : 0, ko: r && r.note < 10 ? 1 : 0, last: Date.now() }), s));
          if (test && r) C.store.update(K.tests(), [], (l) => (l.push({ key: "escritura", ts: Date.now(), score: r.note, total: 20, meta: `${p.lvl}, ${p.genre}` }), l.slice(-200)));
        },
      })
    );
  };
  draw();
  remember(`Écriture : ${prompt.slice(0, 40)}…`);
  return screen(bar({ title: test ? "Test d'écriture" : "Écriture", subtitle: `Niveau ${p.lvl}, ${p.genre}`, back: "#/practice/escritura", lang: "fr" }), h("section", { class: "sheet" }, holder));
}

function writingView(ts) {
  const w = C.store.get(K.writings(), []).find((x) => x.ts === ts);
  if (!w) return escrituraPage({ tab: "textes" });
  return screen(
    bar({ title: "Mon texte", subtitle: `${fmtDate(w.ts)}, niveau ${w.lvl}`, back: "#/practice/escritura?tab=textes", lang: "fr" }),
    h("section", { class: "sheet" },
      h("div", { class: "write-task" }, h("p", { class: "write-prompt" }, w.prompt), w.defi ? h("p", { class: "write-defi" }, h("b", {}, "Défi : "), w.defi) : null),
      w.result ? writingResult(C, E, w.result, w.text) : [h("p", { class: "diff-text", lang: "es" }, w.text), h("p", { class: "small muted" }, "Ce texte n'a pas été corrigé par l'IA.")],
      h("div", { class: "actions" }, h("a", { class: "btn secondary", href: `#/practice/escritura/sujet/${w.pid}?v=${w.v}` }, "Réécrire ce sujet"))
    )
  );
}

// ---------- Déroulé d'une série ----------

function startSession(opts) {
  session = { ...opts, index: 0, results: [] };
  current() === SESSION ? refresh() : go(SESSION);
}

function record(id, ok) {
  C.store.update(K.stats(), {}, (s) => {
    const x = (s[id] ||= { ok: 0, ko: 0, last: 0 });
    ok ? x.ok++ : x.ko++;
    x.last = Date.now();
    return s;
  });
}

function sessionView() {
  if (!session) return hub();
  const S = session;
  const top = bar({ title: S.title || "Práctica", back: S.back, lang: "fr" });
  const progress = h("p", { class: "topbar-sub" });
  top.append(progress);
  const head = h("div");
  if (S.header) fill(head, S.header());
  const stage = h("section", { class: "sheet" }, head);
  const body = h("div");
  stage.append(body);
  const speak = (t) => C.audio.speak(t);
  const speakSeq = (l, p) => C.audio.speakSequence(l, p);

  function next() {
    if (S.index >= S.items.length) return finish();
    const item = S.items[S.index];
    const last = S.index + 1 >= S.items.length;
    progress.textContent = S.items.length > 1 ? `${S.index + 1} sur ${S.items.length}` : "";
    const go2 = () => { S.index++; next(); };
    const nextBtn = () => h("button", { class: "btn", type: "button", onclick: go2 }, last ? "Voir le bilan" : "Suivant");
    if (item.t === "TR") {
      const nav = h("div", { class: "actions" });
      const card = renderTranslate(item, {
        C, E, test: S.test,
        onResult: (r) => {
          S.results.push({ item, answer: r.answer, res: { ok: r.ok, half: r.half, note: r.note } });
          record(item.id, r.ok || r.half);
          fill(nav, nextBtn());
        },
      });
      fill(body, h("p", { class: "item-tense" }, LABELS[item.type] || ""), card, nav);
      window.scrollTo(0, 0);
      return;
    }
    const el = EX.render(item, {
      accentKeys: C.pack.accentKeys, test: S.test, speak, speakSeq,
      onAnswer: (answer, res, out) => {
        S.results.push({ item, answer, res });
        record(item.id, res.ok);
        if (S.test) { S.index++; return setTimeout(next, 150); }
        const btn = nextBtn();
        fill(out, EX.feedback(item, { ...res, html: `${res.html || ""}${res.ok || (res.html || "").includes(item.why) ? "" : item.why || ""}` }, speak), h("div", { class: "actions" }, btn));
        setTimeout(() => btn.focus({ preventScroll: true }), 60);
      },
    });
    fill(body, h("p", { class: "item-tense" }, LABELS[item.type] || ""), el);
    if (item.listen === undefined) window.scrollTo(0, 0);
  }

  function finish() {
    progress.textContent = "Terminé";
    const score = S.results.reduce((a, r) => a + (r.res.ok ? 1 : r.res.half ? 0.5 : 0), 0);
    const total = S.results.length;
    if (S.testKey && !S.saved) {
      S.saved = true;
      C.store.update(K.tests(), [], (l) => (l.push({ key: S.testKey, ts: Date.now(), score, total, meta: S.meta || null }), l.slice(-200)));
    }
    if (S.onFinish && !S.finished) { S.finished = true; S.onFinish(); }
    const wrong = S.results.filter((r) => !r.res.ok);
    const shown = S.test ? S.results : wrong;
    const answerText = (r) => (r.item.t === "Q" ? r.item.o[Number(r.answer)] : r.answer) || "(vide)";
    fill(
      body,
      h("p", { class: "result-line" }, `${String(score).replace(".", ",")} sur ${total}`),
      h("p", { class: "small muted" }, wrong.length ? (S.test ? "Voici la correction." : "À revoir :") : "Aucune erreur sur cette série."),
      h("div", { class: "rows recap" }, shown.map((r) =>
        h("div", { class: `row recap-row ${r.res.ok ? "ok" : r.res.half ? "almost" : "ko"}` },
          h("div", { class: "row-text" },
            h("span", { class: "row-title" }, r.item.t === "TR" ? r.item.source : r.item.fr || r.item.q || ""),
            r.item.t === "Q" ? h("span", { class: "row-sub" }, `Réponse : ${r.item.o[r.item.c]}`) : r.item.t === "W" ? h("span", { class: "row-sub" }, es(r.item.full)) : h("span", { class: "row-sub" }, `Référence : ${r.item.refs[0]}`),
            !r.res.ok ? h("span", { class: "row-sub" }, "Ta réponse : ", answerText(r)) : null
          ),
          r.item.full ? h("span", { class: "row-end" }, say(r.item.listen && typeof r.item.listen === "string" ? r.item.listen : r.item.full)) : null
        )
      )),
      h("div", { class: "actions" },
        wrong.length && !S.test ? h("button", { class: "btn", type: "button", onclick: () => startSession({ ...S, items: wrong.map((r) => r.item), testKey: null, onFinish: null, saved: false, finished: false }) }, "Refaire les erreurs") : null,
        h("a", { class: "btn ghost", href: S.back }, "Terminer")
      )
    );
  }

  next();
  return screen(top, stage);
}
