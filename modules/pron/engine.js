// Moteur du module Prononciation : fabrique les exercices (sans toucher à l'écran).
// Types : ecoute (quel mot entends-tu ?), pareil (pareil ou différent ?), syllabe (où est l'accent ?),
//         tilde (comment s'écrit-il ?), dictee (écris ce que tu entends), repetir (au micro).

import { shuffle } from "../../core/check.js";
import { key } from "./diagnose.js";

export const TYPES = ["ecoute", "pareil", "syllabe", "tilde", "dictee", "repetir"];
export const QUIZ_TYPES = ["ecoute", "pareil", "syllabe", "tilde", "dictee"];
const LV = ["A1", "A2", "B1", "B2", "C1", "C2"];
const SOUND_TAGS = new Set(["rr", "lly", "ssz", "jg", "bvd", "chnx", "diph", "vos"]);
const it = (s) => `<i lang="es">${s}</i>`;

export function ruleText(w) {
  const n = w.syl.length;
  const pos = n - 1 - w.st;
  const shown = w.syl.map((s, i) => (i === w.st ? `<b>${s}</b>` : s)).join("-");
  const tilde = /[áéíóú]/.test(w.w);
  const vns = /[aeiouáéíóúns]$/.test(w.w) && !/y$/.test(w.w);
  let r;
  if (pos === 0) r = vns ? "accent sur la dernière syllabe, et le mot finit par une voyelle, *n* ou *s* : accent écrit obligatoire" : "accent sur la dernière syllabe, et le mot finit par une autre consonne : pas d'accent écrit (c'est la règle normale)";
  else if (pos === 1) r = vns ? "accent sur l'avant-dernière syllabe, et le mot finit par une voyelle, *n* ou *s* : pas d'accent écrit (c'est la règle normale)" : "accent sur l'avant-dernière syllabe, mais le mot finit par une autre consonne : accent écrit obligatoire";
  else r = "accent sur l'antépénultième syllabe : toujours un accent écrit";
  if (tilde && /[íú]/.test(w.w) && pos <= 1 && !r.includes("obligatoire")) r = "le *í* ou le *ú* accentué forme un hiatus : accent écrit obligatoire";
  return `${it(w.w)} (${shown}) : ${r.replace(/\*([^*]+)\*/g, (_, x) => it(x))}.`;
}

export function createPronEngine(data) {
  const lessons = data.lessons;
  const lessonById = Object.fromEntries(lessons.map((l) => [l.id, l]));
  const words = data.words;
  const byW = Object.fromEntries(words.map((w) => [w.w, w]));
  // Homophones : même clé phonétique et même syllabe accentuée -> toutes les graphies acceptées en dictée.
  const homo = {};
  for (const w of words) (homo[`${key(w.w)}|${w.st}|${w.syl.length}`] ||= []).push(w.w);
  const spellings = (w) => homo[`${key(w.w)}|${w.st}|${w.syl.length}`] || [w.w];
  const link = (l) => (l ? `<a href="#/pronunciation/lecon/${l.id}">Revoir la leçon : ${l.title}</a>` : "");

  function wordsFor(lesson) {
    if (SOUND_TAGS.has(lesson.tag)) return words.filter((w) => w.tags.includes(lesson.tag));
    if (lesson.tag === "stress") return words.filter((w) => w.syl.length >= 2);
    const max = LV.indexOf(lesson.level);
    return words.filter((w) => LV.indexOf(w.lvl) <= Math.max(1, max));
  }
  function sentencesFor(lesson) {
    const max = LV.indexOf(lesson.level) + 1;
    return data.sentences.filter((s) => s.lesson === lesson.id || (!s.lesson && SOUND_TAGS.has(lesson.tag) && s.tags.includes(lesson.tag) && LV.indexOf(s.lvl) <= max));
  }

  /** Candidats [clé, fabrique, niveau] pour une portée. */
  function candidates({ scope, lessonIds = [], level = "A1" }) {
    let ls, ws, ss;
    if (scope === "level") {
      ls = lessons.filter((l) => LV.indexOf(l.level) <= LV.indexOf(level));
      ws = words.filter((w) => w.lvl === level);
      ss = data.sentences.filter((s) => s.lvl === level);
    } else {
      ls = lessonIds.map((id) => lessonById[id]).filter(Boolean);
      const seen = new Set();
      ws = ls.flatMap(wordsFor).filter((w) => !seen.has(w.w) && seen.add(w.w));
      const seenS = new Set();
      ss = ls.flatMap(sentencesFor).filter((s) => !seenS.has(s.s) && seenS.add(s.s));
    }
    const lessonOf = (w) => ls.find((l) => (SOUND_TAGS.has(l.tag) ? w.tags.includes(l.tag) : false)) || lessonById.acento;
    const c = { ecoute: [], pareil: [], syllabe: [], tilde: [], dictee: [], repetir: [] };
    for (const l of ls) {
      for (const g of l.pairs) {
        for (const w of g) c.ecoute.push({ id: `ec:${w}:${g.join("/")}`, lvl: l.level, make: (rnd) => ({ t: "Q", listen: w, q: "", fr: "Quel mot entends-tu ?", o: shuffle(g, rnd), oLang: "es", full: w, why: `<p>Tu as entendu ${it(w)}. Compare : ${g.map(it).join(", ")}.</p><p>${link(l)}</p>` }) });
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) c.pareil.push({ id: `pa:${g[i]}/${g[j]}`, lvl: l.level, make: () => ({ t: "Q", listen: [g[i], g[j]], q: "", fr: "Ces deux mots se prononcent-ils pareil ?", o: ["Pareil", "Différent"], oLang: "fr", ans: "Différent", full: `${g[i]} / ${g[j]}`, why: `<p>${it(g[i])} et ${it(g[j])} se prononcent différemment.</p><p>${link(l)}</p>` }) });
      }
      for (const g of l.same) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) c.pareil.push({ id: `pa:${g[i]}/${g[j]}`, lvl: l.level, make: () => ({ t: "Q", listen: [g[i], g[j]], q: "", fr: "Ces deux mots se prononcent-ils pareil ?", o: ["Pareil", "Différent"], oLang: "fr", ans: "Pareil", full: `${g[i]} / ${g[j]}`, why: `<p>${it(g[i])} et ${it(g[j])} se prononcent exactement pareil en Amérique latine : seule l'orthographe change.</p><p>${link(l)}</p>` }) });
      for (const s of sentencesFor(l)) c.repetir.push({ id: `re:${s.s}`, lvl: s.lvl, make: () => ({ t: "R", target: s.s, kind: "phrase", fr: s.fr || null, full: s.s, lesson: l.id }) });
    }
    for (const w of ws) {
      const l = lessonOf(w);
      if (w.syl.length >= 2 && !/[áéíóú]/.test(w.w) && new Set(w.syl).size === w.syl.length)
        c.syllabe.push({ id: `sy:${w.w}`, lvl: w.lvl, make: () => ({ t: "Q", q: w.syl.join(" · "), qLang: "es", fr: "Quelle syllabe est accentuée ?", o: w.syl, oLang: "es", c: w.st, full: w.w, why: `<p>${ruleText(w)}</p><p>${link(lessonById.acento)}</p>` }) });
      if (w.alt) c.tilde.push({ id: `ti:${w.w}`, lvl: w.lvl, make: (rnd) => ({ t: "Q", listen: w.w, q: "", fr: "Écoute : comment s'écrit ce mot ?", o: shuffle([w.w, ...w.alt], rnd), oLang: "es", full: w.w, why: `<p>${ruleText(w)}</p><p>${link(lessonById.acento)}</p>` }) });
      if (w.w.length >= 3) c.dictee.push({ id: `di:${w.w}`, lvl: w.lvl, make: () => ({ t: "W", lang: "es", listen: w.w, context: "Écris le mot que tu entends :", a: spellings(w), full: w.w, why: `<p>${ruleText(w)}</p>${spellings(w).length > 1 ? `<p>Ces orthographes se prononcent pareil : ${spellings(w).map(it).join(", ")}.</p>` : ""}${l && l.id !== "acento" ? `<p>${link(l)}</p>` : ""}` }) });
      c.repetir.push({ id: `re:${w.w}`, lvl: w.lvl, make: () => ({ t: "R", target: w.w, kind: "mot", syl: w.syl, st: w.st, full: w.w, lesson: l?.id }) });
    }
    if (scope === "level") for (const s of ss) c.repetir.push({ id: `re:${s.s}`, lvl: s.lvl, make: () => ({ t: "R", target: s.s, kind: "phrase", fr: s.fr || null, full: s.s }) });
    return c;
  }

  function finish(cand, type, rnd) {
    const item = cand.make(rnd);
    item.id = cand.id;
    item.type = type;
    item.lvl = cand.lvl;
    if (item.ans) item.c = item.o.indexOf(item.ans);
    if (item.c === undefined && item.t === "Q") item.c = item.o.indexOf(item.full);
    return item;
  }

  /** Série pondérée par les erreurs passées ; un même mot au plus une fois. */
  function build({ scope = "lessons", lessonIds = [], level = "A1", types = QUIZ_TYPES, n = 15, stats = {}, now = Date.now(), rnd = Math.random }) {
    const c = candidates({ scope, lessonIds, level });
    const pool = [];
    for (const t of types) {
      // On limite chaque type à 400 candidats tirés au hasard pour garder le tirage rapide.
      const list = c[t].length > 400 ? shuffle(c[t], rnd).slice(0, 400) : c[t];
      for (const x of list) {
        const s = stats[x.id] || { ok: 0, ko: 0, last: 0 };
        const days = s.last ? (now - s.last) / 864e5 : 30;
        // Les types rares (paires) ne doivent pas être noyés par les milliers de mots.
        const share = 1 / Math.max(1, list.length);
        pool.push([x, t, Math.max(0.15, 1 + 2.5 * s.ko - 0.7 * s.ok) * (1 + Math.min(days, 30) / 8) * share]);
      }
    }
    const out = [];
    const used = new Set();
    let guard = 0;
    while (out.length < n && pool.length && guard++ < n * 80) {
      const total = pool.reduce((a, p) => a + p[2], 0);
      let r = rnd() * total;
      let k = 0;
      for (; k < pool.length - 1; k++) if ((r -= pool[k][2]) <= 0) break;
      const [x, t] = pool[k];
      pool.splice(k, 1);
      const word = x.id.split(":")[1];
      if (used.has(word)) continue;
      used.add(word);
      out.push(finish(x, t, rnd));
    }
    return out;
  }

  const count = (opts) => {
    const c = candidates(opts);
    return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.length]));
  };

  return { lessons, lessonById, words, byW, wordsFor, sentencesFor, candidates, build, count, spellings };
}
