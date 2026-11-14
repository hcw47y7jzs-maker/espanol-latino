// Moteur du module Expressions : fabrique les exercices d'une expression (sans toucher à l'écran).
// Types : qes (QCM sens), qfr (QCM expression), trou (compléter l'exemple), vf (vrai/faux),
//         wfr (écrire le sens en français), wes (écrire l'expression en espagnol),
//         tph (traduire la phrase d'exemple, auto-évaluée).

import { normalize, shuffle, stripAccents } from "../../core/check.js";

export const TYPES = ["qes", "qfr", "trou", "vf", "wfr", "wes", "tph"];
export const DEFAULT_TYPES = ["qes", "qfr", "trou", "vf", "wfr", "wes"];
const key = (s) => stripAccents(normalize(s)).replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
const it = (s) => `<i lang="es">${s}</i>`;
const md = (s) => s.replace(/\*([^*]+)\*/g, (_, x) => it(x));

export function createExprEngine(data) {
  const items = data.items;
  const byId = Object.fromEntries(items.map((x) => [x.id, x]));
  const groupOf = Object.fromEntries(data.groups.map((g) => [g.id, g]));
  const LV = ["A1", "A2", "B1", "B2", "C1", "C2"];

  const clash = (a, b) =>
    a.id === b.id ||
    key(a.main) === key(b.main) ||
    key(a.span) === key(b.span) ||
    a.frAll.some((x) => b.frAll.some((y) => key(x) === key(y)));

  /** Distracteurs : d'abord le même groupe, puis la même moitié à un niveau proche, puis tout. */
  function distractors(e, n = 3, rnd = Math.random) {
    const half = groupOf[e.group].half;
    const near = (x) => Math.abs(LV.indexOf(x.lvl) - LV.indexOf(e.lvl)) <= 1;
    const tiers = [
      items.filter((x) => x.group === e.group),
      items.filter((x) => x.group !== e.group && groupOf[x.group].half === half && near(x)),
      items.filter((x) => x.group !== e.group && near(x)),
      items,
    ];
    const out = [];
    for (const tier of tiers) {
      for (const x of shuffle(tier, rnd)) {
        if (out.length === n) return out;
        if (!clash(e, x) && out.every((y) => !clash(x, y))) out.push(x);
      }
    }
    return out;
  }

  function why(e) {
    const region = data.regions[e.reg];
    const head = `${it(e.es)} : ${e.frText}.`;
    const reg = e.reg === "latam" ? "" : ` <span class="small">(${region})</span>`;
    return `<p>${head}${reg}</p>${e.note ? `<p>${md(e.note)}</p>` : ""}<p class="small">${it(e.ex)}<br>${e.exFr}</p>`;
  }

  function item(e, type, rnd = Math.random) {
    const base = { id: `${e.id}:${type}`, eid: e.id, type, full: e.main, why: why(e) };
    if (type === "qes") {
      const opts = shuffle([e, ...distractors(e, 3, rnd)], rnd);
      return { ...base, t: "Q", fr: "Que veut dire cette expression ?", q: e.es, say: e.main, qLang: "es", o: opts.map((x) => x.fr), oLang: "fr", c: opts.indexOf(e) };
    }
    if (type === "qfr") {
      const opts = shuffle([e, ...distractors(e, 3, rnd)], rnd);
      return { ...base, t: "Q", fr: "Comment le dit-on en espagnol ?", q: e.fr, qLang: "fr", o: opts.map((x) => x.main), oLang: "es", c: opts.indexOf(e) };
    }
    if (type === "trou") {
      const opts = shuffle([e, ...distractors(e, 3, rnd)], rnd);
      return { ...base, t: "Q", full: e.ex, fr: `Complète la phrase : « ${e.exFr} »`, q: e.exQ, qLang: "es", o: opts.map((x) => x.blank), oLang: "es", c: opts.indexOf(e) };
    }
    if (type === "vf") {
      const truth = rnd() < 0.5;
      const shown = truth ? e : distractors(e, 1, rnd)[0] || e;
      return { ...base, t: "V", q: `${it(e.main)} veut dire « ${shown.fr} »`, v: shown.id === e.id };
    }
    if (type === "wfr") {
      return { ...base, t: "W", lang: "fr", context: "Donne le sens en français :", prompt: e.main, a: e.frAll, selfGrade: true };
    }
    if (type === "wes") {
      return { ...base, t: "W", lang: "es", context: "Écris l'expression en espagnol :", prompt: e.fr, a: e.esAll, selfGrade: true, hint: e.reg === "latam" ? null : `(${data.regions[e.reg]})` };
    }
    if (type === "tph") {
      return { ...base, t: "S", full: e.ex, prompt: e.ex, lang: "fr", ref: e.exFr };
    }
    throw new Error(type);
  }

  const allowed = (e, t) => !(t === "wes" && e.noWrite);

  /** Série : n exercices, pondérés par les erreurs et l'ancienneté. Une expression au plus une fois. */
  function build({ ids, types = DEFAULT_TYPES, n = 20, stats = {}, exclude = new Set(), now = Date.now(), rnd = Math.random }) {
    const pool = ids.map((id) => byId[id]).filter((e) => e && !exclude.has(e.id));
    if (!pool.length) return [];
    const weight = (e, t) => {
      const s = stats[`${e.id}:${t}`] || { ok: 0, ko: 0, last: 0 };
      const days = s.last ? (now - s.last) / 864e5 : 30;
      return Math.max(0.15, 1 + 2.5 * s.ko - 0.7 * s.ok) * (1 + Math.min(days, 30) / 8);
    };
    const cands = [];
    for (const e of pool) for (const t of types) if (allowed(e, t)) cands.push([e, t, weight(e, t)]);
    const out = [];
    const used = new Set();
    let guard = 0;
    while (out.length < n && cands.length && guard++ < n * 60) {
      const total = cands.reduce((a, c) => a + c[2], 0);
      let r = rnd() * total;
      let k = 0;
      for (; k < cands.length - 1; k++) if ((r -= cands[k][2]) <= 0) break;
      const [e, t] = cands[k];
      if (used.has(e.id) && used.size < pool.length) continue;
      cands.splice(k, 1);
      used.add(e.id);
      out.push(item(e, t, rnd));
    }
    return out;
  }

  /** Test : 20 questions dont 4 traductions de phrases, sur des expressions toutes différentes. */
  function buildTest({ ids, stats = {}, n = 20, phrases = 4, rnd = Math.random }) {
    const a = build({ ids, types: ["tph"], n: Math.min(phrases, Math.floor(n / 4)), stats, rnd });
    const b = build({ ids, types: DEFAULT_TYPES, n: n - a.length, stats, exclude: new Set(a.map((x) => x.eid)), rnd });
    return shuffle([...b, ...a], rnd);
  }

  return { items, byId, groupOf, distractors, item, build, buildTest, clash };
}
