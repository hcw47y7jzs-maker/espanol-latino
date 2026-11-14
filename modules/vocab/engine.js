// Moteur du module Vocabulaire : fabrique les exercices d'un mot (sans toucher à l'écran).
// Types : qes (QCM espagnol -> français), qfr (QCM français -> espagnol), vf (vrai/faux),
//         wes (écrire en espagnol), wfr (écrire en français).

import { normalize, shuffle, stripAccents } from "../../core/check.js";

export const TYPES = ["qes", "qfr", "vf", "wes", "wfr"];
const key = (s) => stripAccents(normalize(s));

export function createVocabEngine(data) {
  const words = data.words;
  const byId = Object.fromEntries(words.map((w) => [w.id, w]));
  const display = (w) => (w.art ? `${w.art} ${w.es}` : w.es);

  // Deux mots « se confondent » s'ils partagent une traduction ou la même forme espagnole.
  const clash = (a, b) =>
    a.id === b.id ||
    key(a.es) === key(b.es) ||
    a.frAll.some((x) => b.frAll.some((y) => key(x) === key(y))) ||
    key(a.fr) === key(b.fr);

  function distractors(w, n = 3, rnd = Math.random) {
    const samePos = (x) => w.lvl >= "C" || x.pos === w.pos;
    const near = (x) => !w.rank || !x.rank || Math.abs(x.rank - w.rank) < 400;
    let pool = words.filter((x) => x.id !== w.id && samePos(x) && near(x) && !clash(w, x));
    if (pool.length < n) pool = words.filter((x) => x.id !== w.id && !clash(w, x));
    const out = [];
    for (const x of shuffle(pool, rnd)) {
      if (out.every((y) => !clash(x, y))) out.push(x);
      if (out.length === n) break;
    }
    return out;
  }

  function why(w) {
    const parts = [];
    if (w.g === "m") parts.push("nom masculin");
    if (w.g === "f") parts.push("nom féminin");
    const meaning = `<i lang="es">${display(w)}</i>${parts.length ? ` (${parts.join(", ")})` : ""} : ${w.frFull}.`;
    const note = w.note ? ` ${w.note.replace(/\*([^*]+)\*/g, '<i lang="es">$1</i>')}` : "";
    return meaning + note;
  }

  function item(w, type, rnd = Math.random) {
    const base = { id: `${w.id}:${type}`, wid: w.id, full: display(w), why: why(w) };
    if (type === "qes") {
      const ds = distractors(w, 3, rnd);
      const opts = shuffle([w, ...ds], rnd);
      return { ...base, t: "Q", type, fr: "Que veut dire ce mot ?", q: display(w), say: display(w), qLang: "es", o: opts.map((x) => x.fr), oLang: "fr", c: opts.indexOf(w) };
    }
    if (type === "qfr") {
      const ds = distractors(w, 3, rnd);
      const opts = shuffle([w, ...ds], rnd);
      return { ...base, t: "Q", type, fr: "Comment dit-on en espagnol ?", q: w.fr, qLang: "fr", o: opts.map(display), oLang: "es", c: opts.indexOf(w) };
    }
    if (type === "vf") {
      const truth = rnd() < 0.5;
      const shown = truth ? w : distractors(w, 1, rnd)[0] || w;
      const v = shown.id === w.id;
      return { ...base, t: "V", type, q: `<i lang="es">${display(w)}</i> veut dire « ${shown.fr} »`, v };
    }
    if (type === "wes") {
      const answers = [w.es];
      return { ...base, t: "W", type, lang: "es", prompt: w.fr, a: answers, art: w.art, g: w.g, hint: w.pos !== "nom" && w.pos !== "mot" ? `(${w.pos})` : null };
    }
    if (type === "wfr") {
      return { ...base, t: "W", type, lang: "fr", prompt: display(w), a: w.frAll };
    }
    throw new Error(type);
  }

  /** Série : n exercices pris parmi les mots, pondérés par les erreurs et l'ancienneté. */
  function build({ wordIds, types = TYPES, n = 15, stats = {}, now = Date.now(), rnd = Math.random }) {
    const pool = wordIds.map((id) => byId[id]).filter(Boolean);
    if (!pool.length) return [];
    const weight = (w, t) => {
      const s = stats[`${w.id}:${t}`] || { ok: 0, ko: 0, last: 0 };
      const days = s.last ? (now - s.last) / 864e5 : 30;
      return Math.max(0.15, 1 + 2.5 * s.ko - 0.7 * s.ok) * (1 + Math.min(days, 30) / 8);
    };
    const cands = [];
    for (const w of pool) for (const t of types) cands.push([w, t, weight(w, t)]);
    const out = [];
    const usedWords = new Set();
    let guard = 0;
    while (out.length < n && cands.length && guard++ < n * 50) {
      const total = cands.reduce((a, c) => a + c[2], 0);
      let r = rnd() * total;
      let k = 0;
      for (; k < cands.length - 1; k++) if ((r -= cands[k][2]) <= 0) break;
      const [w, t] = cands[k];
      // Un même mot ne revient pas deux fois dans une série, sauf s'il n'y a pas assez de mots.
      if (usedWords.has(w.id) && usedWords.size < pool.length) continue;
      cands.splice(k, 1);
      usedWords.add(w.id);
      out.push(item(w, t, rnd));
    }
    return out;
  }

  return { words, byId, display, distractors, item, build, clash };
}
