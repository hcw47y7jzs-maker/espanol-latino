// Moteur de Práctica : vérifications de traduction, différences mot à mot et fabrication des
// exercices de lecture et d'écoute. Sans dépendance à l'écran : testable avec Node.

import { shuffle, stripAccents } from "../../core/check.js";

const LV = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Forme comparable d'une phrase : minuscules, sans ponctuation ni espaces superflus. */
export function plain(s) {
  return (s || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[¡!¿?.,;:«»"“”—–\-…()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Vérification locale d'une traduction.
 * ok:true  -> identique à une référence (ponctuation et majuscules libres) ;
 * accentOnly -> seuls des accents diffèrent ;
 * ok:null -> différente : il faut l'avis de l'IA (ou de la personne).
 */
export function checkTranslation(answer, refs, lang) {
  const a = plain(answer);
  if (!a) return { ok: false, empty: true };
  for (const r of refs) if (plain(r) === a) return { ok: true };
  for (const r of refs) {
    if (stripAccents(plain(r)) === stripAccents(a)) return lang === "fr" ? { ok: true, note: "accents" } : { ok: false, accentOnly: true, ref: r };
  }
  return { ok: null };
}

const esc = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

/** Différence mot à mot : <del> pour ce qui est retiré, <ins> pour ce qui est ajouté. */
export function wordDiff(before, after) {
  const A = before.split(/(\s+)/).filter((x) => x !== "");
  const B = after.split(/(\s+)/).filter((x) => x !== "");
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, out = "";
  const del = [], ins = [];
  const flush = () => {
    const d = del.join("").trim(), s = ins.join("").trim();
    if (d) out += `<del>${esc(d)}</del>`;
    if (s) out += `${d ? " " : ""}<ins>${esc(s)}</ins>`;
    if (d || s) out += " ";
    del.length = 0; ins.length = 0;
  };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { flush(); out += esc(A[i]); i++; j++; }
    else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { ins.push(B[j]); j++; }
    else { del.push(A[i]); i++; }
  }
  flush();
  return out.replace(/\s+/g, " ").trim();
}

export const countWords = (t) => (t.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}]+)*/gu) || []).length;

/** Remplit les variantes {a|b|c} d'un sujet d'écriture ; v = numéro de variante. */
export function promptVariant(text, v) {
  const groups = [...text.matchAll(/\{([^}]*)\}/g)].map((m) => m[1].split("|"));
  const total = groups.reduce((a, g) => a * g.length, 1);
  let k = ((v % total) + total) % total;
  let i = 0;
  return text.replace(/\{([^}]*)\}/g, () => {
    const g = groups[i++];
    const choice = g[k % g.length];
    k = Math.floor(k / g.length);
    return choice;
  });
}

export function createPracticaEngine(data) {
  const byLevel = (list, lvl) => list.filter((x) => x.lvl === lvl);
  const lectura = Object.fromEntries(data.lecturas.map((t) => [t.id, t]));
  const escucha = Object.fromEntries(data.escuchas.map((t) => [t.id, t]));
  const grammar = Object.fromEntries(data.grammar.map((g) => [g.id, g]));
  const it = (s) => `<i lang="es">${esc(s)}</i>`;
  const voiced = (t, ln) => (ln.sp === "B" ? `[b] ${ln.es}` : ln.es);

  /** Questions d'un texte (lecture ou écoute) au format des exercices Q. */
  function questions(t, { listen = null } = {}) {
    return t.q.map((q, k) => {
      const o = q.vf ? q.o : shuffle(q.o);
      const lang = t.lvl < "B1" ? "fr" : "es";
      return { id: `${t.id}:q${k}`, type: "question", t: "Q", fr: q.vf ? (lang === "fr" ? "Vrai ou faux ?" : "¿Verdadero o falso?") : "", q: q.q, qLang: lang, o, oLang: lang, c: o.indexOf(q.o[q.c]), full: null, listen: listen || undefined, why: "" };
    });
  }

  /** Lecture : vocabulaire en contexte, sens des phrases, titre. */
  function lecturaItems(t) {
    const items = [];
    const sameLevel = byLevel(data.lecturas, t.lvl).filter((x) => x.id !== t.id);
    t.vocab.forEach((v, k) => {
      const others = shuffle(t.vocab.filter((x) => x.w !== v.w && x.fr !== v.fr).map((x) => x.fr)).slice(0, 3);
      if (others.length < 3) return;
      const o = shuffle([v.fr, ...others]);
      const line = t.lines[v.line].es.replace(new RegExp(`(^|[^\\p{L}])(${v.w})(?=[^\\p{L}]|$)`, "iu"), "$1<b>$2</b>");
      items.push({ id: `${t.id}:v${k}`, type: "vocab", t: "Q", fr: `Dans le texte, que veut dire « ${v.w} » ?`, q: "", o, oLang: "fr", c: o.indexOf(v.fr), full: null, why: `<p lang="es"><i>${line}</i></p>` });
    });
    t.lines.forEach((ln, k) => {
      const pool = shuffle([...t.lines.filter((_, j) => j !== k), ...sameLevel.flatMap((x) => x.lines)].map((x) => x.fr)).filter((f) => f !== ln.fr);
      const o = shuffle([ln.fr, ...pool.slice(0, 3)]);
      items.push({ id: `${t.id}:s${k}`, type: "sens", t: "Q", fr: "Que veut dire cette phrase du texte ?", q: ln.es, qLang: "es", say: ln.es, o, oLang: "fr", c: o.indexOf(ln.fr), full: ln.es, why: "" });
    });
    const titles = shuffle(sameLevel.map((x) => x.es)).slice(0, 3);
    const o = shuffle([t.es, ...titles]);
    items.push({ id: `${t.id}:titre`, type: "titre", t: "Q", fr: "Quel est le titre de ce texte ?", q: "", o, oLang: "es", c: o.indexOf(t.es), full: null, why: "" });
    return items;
  }

  /** Écoute : dictées, sens des répliques, suite logique. */
  function escuchaItems(t) {
    const items = [];
    const sameLevel = byLevel(data.escuchas, t.lvl).filter((x) => x.id !== t.id);
    t.lines.forEach((ln, k) => {
      const audio = voiced(t, ln);
      items.push({ id: `${t.id}:d${k}`, type: "dictee", t: "W", lang: "es", listen: audio, context: "Écris ce que tu entends :", a: [ln.es], full: ln.es, why: `<p>${esc(ln.fr)}</p>` });
      const pool = shuffle([...t.lines.filter((_, j) => j !== k), ...sameLevel.flatMap((x) => x.lines)].map((x) => x.fr)).filter((f) => f !== ln.fr);
      const o = shuffle([ln.fr, ...pool.slice(0, 3)]);
      items.push({ id: `${t.id}:m${k}`, type: "sens", t: "Q", listen: audio, fr: "Que veut dire cette réplique ?", q: "", o, oLang: "fr", c: o.indexOf(ln.fr), full: ln.es, why: "" });
      if (k + 1 < t.lines.length) {
        const nxt = t.lines[k + 1].es;
        const others = shuffle(sameLevel.flatMap((x) => x.lines).map((x) => x.es)).filter((x) => x !== nxt).slice(0, 2);
        const o2 = shuffle([nxt, ...others]);
        items.push({ id: `${t.id}:n${k}`, type: "suite", t: "Q", listen: audio, fr: "Qu'est-ce qui vient juste après ?", q: "", o: o2, oLang: "es", c: o2.indexOf(nxt), full: nxt, why: `<p>${esc(t.lines[k + 1].fr)}</p>` });
      }
    });
    return items;
  }

  /** Phrases à traduire. dir : "fr-es" (thème) ou "es-fr" (version). */
  function frasesPool({ lvl = null, points = null, withExpr = true } = {}) {
    return data.frases.filter((f) => (!lvl || f.lvl === lvl) && (!points || (f.point && points.includes(f.point))) && (withExpr || f.point));
  }
  function frase(f, dir) {
    return dir === "fr-es"
      ? { id: `${f.id}:fr-es`, type: "theme", t: "TR", from: "fr", to: "es", source: f.fr, refs: f.es, point: f.point, lvl: f.lvl, full: f.es[0] }
      : { id: `${f.id}:es-fr`, type: "version", t: "TR", from: "es", to: "fr", source: f.es[0], refs: [f.fr], point: f.point, lvl: f.lvl, full: f.es[0] };
  }
  function buildFrases({ lvl, points, dir = "both", n = 10, stats = {}, rnd = Math.random }) {
    const pool = shuffle(frasesPool({ lvl, points }), rnd);
    // On privilégie les phrases jamais vues ou ratées.
    const score = (f, d) => { const s = stats[`${f.id}:${d}`]; return s ? s.ko * 2 - s.ok + Math.min(30, (Date.now() - s.last) / 864e5) / 10 : 3; };
    const dirs = dir === "both" ? ["fr-es", "es-fr"] : [dir];
    const cands = pool.flatMap((f) => dirs.map((d) => [f, d, score(f, d) + rnd()]));
    cands.sort((a, b) => b[2] - a[2]);
    const used = new Set(), out = [];
    for (const [f, d] of cands) {
      if (used.has(f.id)) continue;
      used.add(f.id);
      out.push(frase(f, d));
      if (out.length >= n) break;
    }
    return out;
  }

  /** Points de grammaire du niveau et des niveaux voisins (pour guider les explications de l'IA). */
  function pointsNear(lvl) {
    const i = LV.indexOf(lvl);
    return data.grammar.filter((g) => Math.abs(LV.indexOf(g.lvl) - i) <= 1);
  }

  return { data, lectura, escucha, grammar, questions, lecturaItems, escuchaItems, frasesPool, frase, buildFrases, pointsNear, voiced };
}
