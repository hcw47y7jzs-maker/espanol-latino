// Moteur du module Verbes : génère les exercices et corrige les réponses.
// Il ne touche pas à l'écran, ce qui permet de le tester (voir tests/verbs.test.mjs).

import { compare, diffHtml, pick, shuffle, normalize, answers } from "../../core/check.js";

export function createVerbEngine({ pack, data, lang }) {
  const P = pack.persons.order;
  const tenses = pack.verbs.tenses;
  const allTenses = [...tenses, ...pack.verbs.auxTenses];
  const tenseById = Object.fromEntries(allTenses.map((t) => [t.id, t]));
  const verbs = data.verbs;
  const byInf = Object.fromEntries(verbs.map((v) => [v.inf, v]));
  const ignored = pack.persons.ignoredWords;
  const LEVELS = pack.levels;

  const forms = (verb, tense) => verb.t[tense] || null;
  const display = (form) => (form || "").split("|").join(" / ");

  function label(tense, i, collapsed = false) {
    const key = P[i];
    if (tense === "imperativo") return pack.persons.imperativeLabels[key];
    if (collapsed && key === "tu") return "tú / vos";
    return pack.persons.labels[key];
  }

  /** Personnes à interroger pour ce verbe et ce temps, selon les réglages tú / vos. */
  function slots(verb, tense, prefs = { tu: true, vos: true }) {
    const f = forms(verb, tense);
    if (!f) return [];
    const same = f[1] && f[1] === f[2];
    const out = [];
    f.forEach((form, i) => {
      if (form == null) return;
      if (i === 1 && !prefs.tu && !(same && prefs.vos)) return;
      if (i === 2 && (!prefs.vos || (same && prefs.tu))) return;
      const collapsed = i === 1 && same && prefs.vos && prefs.tu;
      const lab = i === 1 && same && !prefs.tu ? "vos" : label(tense, i, collapsed);
      out.push({ i, key: P[i], label: lab, form });
    });
    return out;
  }

  function verbLevelOk(verb, level) {
    return !level || LEVELS.indexOf(verb.lvl) <= LEVELS.indexOf(level);
  }

  // ---------- Explications d'erreurs ----------

  function explain(verb, tense, i, cmp) {
    const correct = cmp.matched;
    const user = cmp.user;
    const t = tenseById[tense];
    const lessonLink = t?.lesson ? `<a href="#/verbs/lecon/${tense}">Revoir la leçon : ${t.fr.toLowerCase()}</a>` : "";
    const out = (kind, text) => ({ kind, html: `<p>${text}</p>${lessonLink ? `<p>${lessonLink}</p>` : ""}` });

    if (!user) return out("vide", `La bonne réponse est <b lang="es">${display(forms(verb, tense)[i])}</b>.`);

    if (cmp.accentOnly) return out("accent", `Presque : seule l'accentuation est fausse. ${lang.accentHint(tense, i, correct, user)}`);

    const stem = lang.stemHint(tense, i, correct, user);
    if (stem) return out("radical", stem);

    // Autre personne du même temps ?
    const f = forms(verb, tense);
    for (let j = 0; j < f.length; j++) {
      if (j === i || !f[j]) continue;
      if (answers(f[j]).includes(user)) {
        if (i === 2 && j === 1)
          return out("tu-vos", `<i lang="es">${user}</i> est la forme de <i lang="es">tú</i>. Avec <i lang="es">vos</i>, on dit <b lang="es">${display(f[i])}</b>.`);
        if (i === 1 && j === 2)
          return out("tu-vos", `<i lang="es">${user}</i> est la forme de <i lang="es">vos</i>. Avec <i lang="es">tú</i>, on dit <b lang="es">${display(f[i])}</b>.`);
        return out("personne", `<i lang="es">${user}</i> est la forme de <i lang="es">${label(tense, j)}</i>. Pour <i lang="es">${label(tense, i)}</i> : <b lang="es">${display(f[i])}</b>.`);
      }
    }
    // Autre temps ?
    for (const other of allTenses) {
      if (other.id === tense) continue;
      const g = forms(verb, other.id);
      if (!g) continue;
      const j = g.findIndex((x) => x && answers(x).includes(user));
      if (j >= 0)
        return out("temps", `<i lang="es">${user}</i> est au ${other.fr.toLowerCase()} (${label(other.id, j)}). Ici on attend le ${t.fr.toLowerCase()} : <b lang="es">${display(f[i])}</b>.`);
    }
    // Verbe irrégulier conjugué comme un régulier ?
    const reg = lang.regularForm(verb.inf, tense, i);
    if (reg && normalize(reg) === user && !answers(f[i]).includes(normalize(reg)))
      return out("irregulier", `<i lang="es">${verb.inf}</i> ne suit pas la règle ici. ${verb.irr ? `${verb.irr}.` : ""} La bonne forme est <b lang="es">${display(f[i])}</b>.`);

    return out("autre", `La bonne forme est <b lang="es">${diffHtml(user, correct)}</b>. La partie surlignée est celle qui diffère de ta réponse.`);
  }

  function check(item, user) {
    const f = forms(item.verb, item.tense);
    const expected = f[item.i];
    const cmp = compare(user, expected, ignored);
    const res = { ok: cmp.ok, accentOnly: cmp.accentOnly, correct: display(expected), user: cmp.user };
    if (!cmp.ok) Object.assign(res, explain(item.verb, item.tense, item.i, cmp));
    return res;
  }

  // ---------- Fabrication des exercices ----------

  function phrasePrompt(verb, tense, slot, rnd) {
    if (tense === "imperativo") {
      const who = pack.persons.imperativeAddressees[slot.key];
      return { before: "¡", after: ` (${verb.inf}), por favor!`, context: `Tu parles ${who}.` };
    }
    const t = tenseById[tense];
    const subj = slot.label === "tú / vos" ? pick(["tú", "vos"], rnd) : pick(pack.persons.subjects[slot.key], rnd);
    const marker = pick(t.markers, rnd);
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    // « En tu lugar, yo… » : le marqueur ouvre la phrase.
    return { before: `${cap(marker)} ${subj} `, after: ` (${verb.inf}).`, context: null };
  }

  function qcmOptions(verb, tense, i, rnd) {
    const shown = forms(verb, tense)[i];
    const shownSet = answers(shown);
    const matches = (tid, j) => {
      const x = forms(verb, tid)?.[j];
      return x && answers(x).some((a) => shownSet.includes(a));
    };
    const pool = [];
    for (const t of tenses) {
      const f = forms(verb, t.id);
      if (!f) continue;
      f.forEach((x, j) => {
        if (x && !(t.id === tense && j === i) && !matches(t.id, j)) pool.push({ tense: t.id, i: j });
      });
    }
    const distractors = shuffle(pool, rnd).filter((o, k, arr) => arr.findIndex((p) => p.tense === o.tense && label(p.tense, p.i) === label(o.tense, o.i)) === k).slice(0, 3);
    const opts = shuffle([{ tense, i, ok: true }, ...distractors.map((d) => ({ ...d, ok: false }))], rnd);
    return opts.map((o) => ({ ...o, text: `${tenseById[o.tense].fr}, ${label(o.tense, o.i)}` }));
  }

  function makeItem(type, verb, tense, slot, rnd = Math.random) {
    const base = { type, verb, tense, i: slot.i, personLabel: slot.label };
    if (type === "phrase") return { ...base, ...phrasePrompt(verb, tense, slot, rnd) };
    if (type === "qcm") return { ...base, shown: display(forms(verb, tense)[slot.i]).split(" / ")[0], options: qcmOptions(verb, tense, slot.i, rnd) };
    return base;
  }

  /**
   * Session d'entraînement.
   * @param pairs liste de [infinitif, temps]
   * @param type "form" | "phrase" | "qcm" | "table" | "mix"
   */
  function buildSession({ pairs, type = "form", count = 10, prefs, rnd = Math.random }) {
    const items = [];
    const usable = pairs.filter(([inf, t]) => byInf[inf] && slots(byInf[inf], t, prefs).length);
    if (!usable.length) return items;
    if (type === "table") {
      for (const [inf, t] of shuffle(usable, rnd).slice(0, count))
        items.push({ type: "table", verb: byInf[inf], tense: t, slots: slots(byInf[inf], t, prefs) });
      return items;
    }
    const types = type === "mix" ? ["form", "phrase", "qcm"] : [type];
    let guard = 0;
    while (items.length < count && guard++ < count * 20) {
      const [inf, t] = pick(usable, rnd);
      const verb = byInf[inf];
      const slot = pick(slots(verb, t, prefs), rnd);
      const ty = pick(types, rnd);
      if (ty === "phrase" && t !== "imperativo" && !tenseById[t].markers.length) continue;
      const dup = items.some((x) => x.verb === verb && x.tense === t && x.i === slot.i);
      if (dup && guard < count * 10) continue;
      const it = makeItem(ty, verb, t, slot, rnd);
      if (ty === "qcm" && it.options.length < 2) continue;
      items.push(it);
    }
    return items;
  }

  /**
   * Test : 10 verbes différents si possible, tous temps confondus, pris parmi les couples révisés.
   * Les couples souvent ratés ou pas vus depuis longtemps sortent plus souvent.
   */
  function buildTest({ reviewed, stats = {}, prefs, n = 10, now = Date.now(), rnd = Math.random }) {
    const pairs = Object.keys(reviewed)
      .map((k) => k.split("|"))
      .filter(([inf, t]) => byInf[inf] && tenseById[t] && slots(byInf[inf], t, prefs).length);
    if (!pairs.length) return [];
    const weight = ([inf, t]) => {
      const s = stats[`${inf}|${t}`] || { ok: 0, ko: 0, last: 0 };
      const days = s.last ? (now - s.last) / 864e5 : 30;
      return Math.max(0.3, 1 + 2 * s.ko - 0.5 * s.ok) * (1 + Math.min(days, 30) / 10);
    };
    const byVerb = {};
    for (const p of pairs) (byVerb[p[0]] ||= []).push(p);
    const weightedPick = (list) => {
      const ws = list.map(weight);
      let r = rnd() * ws.reduce((a, b) => a + b, 0);
      for (let k = 0; k < list.length; k++) if ((r -= ws[k]) <= 0) return list[k];
      return list[list.length - 1];
    };
    const verbOrder = [];
    const remaining = Object.keys(byVerb);
    while (remaining.length && verbOrder.length < n) {
      const inf = weightedPick(remaining.map((v) => weightedPick(byVerb[v])))[0];
      verbOrder.push(inf);
      remaining.splice(remaining.indexOf(inf), 1);
    }
    const items = [];
    const used = new Set();
    let k = 0;
    while (items.length < n && k < n * 30) {
      const inf = verbOrder[k % verbOrder.length];
      k++;
      const [, t] = weightedPick(byVerb[inf]);
      const verb = byInf[inf];
      const slot = pick(slots(verb, t, prefs), rnd);
      const key = `${inf}|${t}|${slot.i}`;
      if (used.has(key) && k < n * 20) continue;
      used.add(key);
      const useful = t !== "imperativo" && tenseById[t].markers.length;
      items.push(makeItem(useful && rnd() < 0.5 ? "phrase" : "form", verb, t, slot, rnd));
    }
    return items;
  }

  function pairsForScope({ scope, tense, level, verb, reviewed }) {
    if (scope === "verb") return [[verb, tense]];
    if (scope === "reviewed") return Object.keys(reviewed).map((k) => k.split("|"));
    const ts = tense ? [tense] : tenses.filter((t) => !level || LEVELS.indexOf(t.level) <= LEVELS.indexOf(level)).map((t) => t.id);
    const vs = verbs.filter((v) => (scope === "level" ? v.lvl === level : verbLevelOk(v, level)));
    const out = [];
    for (const v of vs) for (const t of ts) if (v.t[t]) out.push([v.inf, t]);
    return out;
  }

  return { verbs, byInf, tenses, tenseById, label, forms, display, slots, check, explain, makeItem, buildSession, buildTest, pairsForScope, qcmOptions, verbLevelOk };
}
