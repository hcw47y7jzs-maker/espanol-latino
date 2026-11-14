// Compare ce que la personne devait dire avec ce que la reconnaissance vocale a entendu,
// et en déduit les sons à retravailler. Sans dépendance à l'écran : testable avec Node.
//
// Principe : on transforme chaque mot en « clé phonétique » de l'espagnol d'Amérique
// (b = v, s = z = c doux, ll = y, h muette…). Deux orthographes qui se prononcent pareil
// ont la même clé : ce n'est pas une faute de prononciation. Sinon, on regarde quels sons diffèrent.

const NUM = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte"];
const ACC = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u" };
const V = "aeiou";

export function words(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/\d+/g, (d) => (Number(d) <= 20 ? ` ${NUM[Number(d)]} ` : d))
    .replace(/[^a-záéíóúüñ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Clé phonétique d'un mot (sans accents écrits). Lettres capitales = sons spéciaux. */
export function key(w) {
  let s = w.toLowerCase().replace(/[áéíóúü]/g, (c) => ACC[c]);
  s = s.replace(/ch/g, "C").replace(/ll/g, "Y").replace(/rr/g, "R").replace(/ñ/g, "N");
  s = s.replace(/^r/, "R").replace(/([nls])r/g, "$1R");
  s = s.replace(/qu(?=[ei])/g, "k").replace(/gu(?=[ei])/g, "G");
  s = s.replace(/g(?=[ei])/g, "x").replace(/j/g, "x");
  s = s.replace(/c(?=[ei])/g, "s").replace(/c/g, "k").replace(/z/g, "s").replace(/v/g, "b").replace(/w/g, "u");
  s = s.replace(/y(?=[aeiou])/g, "Y").replace(/y/g, "i");
  s = s.replace(/h/g, "").replace(/x(?=[ptk])/g, "s").replace(/G/g, "g");
  return s;
}

/** Position de la voyelle accentuée (indice dans la clé), d'après l'accent écrit ou les règles. */
export function stressOf(w) {
  const w2 = w.replace(/(?<=[qg])u(?=[eiéí])/g, "");
  const m = w2.match(/[áéíóú]/);
  const plain = w2.replace(/[áéíóúü]/g, (c) => ACC[c]);
  const vowels = [...plain].map((c, i) => (V.includes(c) ? i : -1)).filter((i) => i >= 0);
  if (m) return [...plain.slice(0, m.index)].filter((c) => V.includes(c)).length;
  // sans accent écrit : avant-dernière voyelle « forte » si fin en voyelle, n, s ; sinon dernière
  const n = vowels.length;
  if (n <= 1) return 0;
  return /[aeiouns]$/.test(plain) ? n - 2 : n - 1;
}

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d;
}

/** Opérations d'édition entre deux clés : [{op:"sub"|"del"|"ins", t, h}] */
function ops(a, b) {
  const d = lev(a, b);
  const out = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) { i--; j--; continue; }
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) { out.push({ op: "sub", t: a[i - 1], h: b[j - 1], at: i - 1 }); i--; j--; continue; }
    if (i > 0 && d[i][j] === d[i - 1][j] + 1) { out.push({ op: "del", t: a[i - 1], h: "", at: i - 1 }); i--; continue; }
    out.push({ op: "ins", t: "", h: b[j - 1], at: i }); j--;
  }
  return out.reverse();
}

// Sons -> leçon et conseil.
export const TIPS = {
  rr: { lesson: "r-rr", label: "le r / rr", tip: "Le *rr* (et le *r* en début de mot) se roule : plusieurs battements du bout de la langue derrière les dents du haut." },
  r: { lesson: "r-rr", label: "le r simple", tip: "Le *r* simple, c'est un seul battement rapide du bout de la langue, jamais au fond de la gorge comme en français." },
  voyelle: { lesson: "vocales", label: "les voyelles", tip: "Chaque voyelle garde son son pur : *e* jamais muet, *u* toujours « ou », pas de voyelle nasale." },
  jota: { lesson: "j-g", label: "la jota", tip: "La *jota* (*j*, *ge*, *gi*) est un souffle raclé au fond de la bouche, comme le *ch* allemand de *Bach*." },
  enie: { lesson: "ch-n", label: "le ñ", tip: "Le *ñ* se dit comme « gn » dans *montagne* : *año* n'est pas *ano* !" },
  che: { lesson: "ch-n", label: "le ch", tip: "Le *ch* se dit « tch », comme dans *tchèque*." },
  sonore: { lesson: "b-v-d", label: "b, d, g / p, t, k", tip: "Fais vibrer la gorge sur *b, d, g*, et prononce *p, t, k* secs, sans souffle." },
  s: { lesson: "s-z-c", label: "le s", tip: "Fais bien entendre le *s* : il est toujours sourd (« ss »), jamais « z ». En Argentine il s'aspire parfois en fin de syllabe, mais pour apprendre, prononce-le." },
  y: { lesson: "ll-y", label: "le ll / y", tip: "*ll* et *y* devant une voyelle : un son frotté, le *j* de *jour* à l'argentine." },
  accent: { lesson: "acento", label: "l'accent tonique", tip: "Appuie sur la bonne syllabe : c'est elle qui porte le sens (*papa* / *papá*)." },
  mot: { lesson: null, label: "le mot", tip: "Le mot entendu est différent : réécoute le modèle et articule chaque syllabe." },
};

function category(o) {
  const t = o.t, h = o.h;
  const isV = (c) => V.includes(c);
  if ((t === "R" && (h === "r" || h === "")) || (t === "r" && h === "R")) return t === "R" ? "rr" : "r";
  if ((t === "r" || t === "R") && (h === "l" || h === "d" || h === "x" || h === "")) return "r";
  if (h === "R" && t !== "r") return "r";
  if ((t === "x" && (h === "k" || h === "g" || h === "")) || (h === "x" && t !== "")) return "jota";
  if ((t === "N" && h === "n") || (t === "n" && h === "N")) return "enie";
  if (t === "C" || h === "C") return "che";
  if (t === "Y" || h === "Y") return "y";
  const pairs = { b: "p", p: "b", d: "t", t: "d", g: "k", k: "g" };
  if (pairs[t] === h) return "sonore";
  if (t === "s" && h === "") return "s";
  if (isV(t) || isV(h)) return "voyelle";
  return "mot";
}

/** Aligne les mots de la cible et ceux entendus (programmation dynamique sur les clés). */
function alignWords(T, H) {
  const tk = T.map(key), hk = H.map(key);
  const cost = (i, j) => {
    const a = tk[i], b = hk[j];
    const d = lev(a, b)[a.length][b.length];
    return d / Math.max(a.length, b.length, 1);
  };
  const n = T.length, m = H.length;
  const D = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) D[i][0] = i;
  for (let j = 1; j <= m; j++) D[0][j] = j * 0.8;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 0.8, D[i - 1][j - 1] + cost(i - 1, j - 1) * 1.6);
  const pairs = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(D[i][j] - (D[i - 1][j - 1] + cost(i - 1, j - 1) * 1.6)) < 1e-9) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + 1)) < 1e-9) { pairs.push([i - 1, null]); i--; }
    else { pairs.push([null, j - 1]); j--; }
  }
  return pairs.reverse();
}

/**
 * @returns {{ok:boolean, score:number, heard:string, words:[{t,h,ok,cats:[]}], cats:{[cat]:n}}}
 */
export function diagnose(target, heardText) {
  const T = words(target), H = words(heardText);
  const out = [];
  const cats = {};
  if (!H.length) return { ok: false, empty: true, score: 0, heard: "", words: T.map((t) => ({ t, h: null, ok: false, cats: [] })), cats };
  for (const [i, j] of alignWords(T, H)) {
    if (i === null) continue; // mot en trop entendu : ignoré
    const t = T[i];
    const h = j === null ? null : H[j];
    if (h === null) { out.push({ t, h, ok: false, cats: ["mot"] }); cats.mot = (cats.mot || 0) + 1; continue; }
    const kt = key(t), kh = key(h);
    if (kt === kh) {
      // même sons : vérifie l'accent tonique (papa / papá) seulement si un accent écrit les distingue
      const nuclei = (kt.match(/[aeiou]+/g) || []).length;
      const differ = nuclei >= 2 && /[áéíóú]/.test(t + h) && stressOf(t) !== stressOf(h);
      if (differ) { out.push({ t, h, ok: false, cats: ["accent"] }); cats.accent = (cats.accent || 0) + 1; }
      else out.push({ t, h, ok: true, cats: [] });
      continue;
    }
    const cs = [...new Set(ops(kt, kh).map(category))];
    const tooFar = lev(kt, kh)[kt.length][kh.length] > Math.max(2, kt.length / 2);
    const list = tooFar ? ["mot"] : cs;
    list.forEach((c) => (cats[c] = (cats[c] || 0) + 1));
    out.push({ t, h, ok: false, cats: list });
  }
  const good = out.filter((w) => w.ok).length;
  return { ok: good === out.length, score: out.length ? good / out.length : 0, heard: H.join(" "), words: out, cats };
}
