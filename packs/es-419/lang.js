// Règles propres à l'espagnol, utilisées par le moteur générique pour expliquer les erreurs.
// Un autre pack de langue fournira son propre lang.js avec les mêmes fonctions.

const P = ["yo", "tu", "vos", "el", "nos", "uds"];

function split(inf) {
  const base = inf.normalize("NFC");
  const end = base.slice(-2).replace("í", "i");
  return { stem: base.slice(0, -2), end, inf: base.replace(/ír$/, "ir") };
}

// Terminaisons régulières (ordre : yo, tú, vos, él, nosotros, ustedes).
const ENDINGS = {
  presente: {
    ar: ["o", "as", "ás", "a", "amos", "an"],
    er: ["o", "es", "és", "e", "emos", "en"],
    ir: ["o", "es", "ís", "e", "imos", "en"],
  },
  preterito: {
    ar: ["é", "aste", "aste", "ó", "amos", "aron"],
    er: ["í", "iste", "iste", "ió", "imos", "ieron"],
    ir: ["í", "iste", "iste", "ió", "imos", "ieron"],
  },
  imperfecto: {
    ar: ["aba", "abas", "abas", "aba", "ábamos", "aban"],
    er: ["ía", "ías", "ías", "ía", "íamos", "ían"],
    ir: ["ía", "ías", "ías", "ía", "íamos", "ían"],
  },
  imperativo: {
    ar: [null, "a", "á", "e", "emos", "en"],
    er: [null, "e", "é", "a", "amos", "an"],
    ir: [null, "e", "í", "a", "amos", "an"],
  },
  subj_presente: {
    ar: ["e", "es", "es", "e", "emos", "en"],
    er: ["a", "as", "as", "a", "amos", "an"],
    ir: ["a", "as", "as", "a", "amos", "an"],
  },
};
const ON_INFINITIVE = {
  futuro: ["é", "ás", "ás", "á", "emos", "án"],
  condicional: ["ía", "ías", "ías", "ía", "íamos", "ían"],
};

/** Forme qu'aurait le verbe s'il était parfaitement régulier. */
export function regularForm(inf, tense, p) {
  const i = typeof p === "number" ? p : P.indexOf(p);
  const { stem, end, inf: full } = split(inf);
  if (ON_INFINITIVE[tense]) return full + ON_INFINITIVE[tense][i];
  const table = ENDINGS[tense]?.[end];
  if (!table || table[i] == null) return null;
  return stem + table[i];
}

const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");

/** Explication courte quand seule l'accentuation est fausse. */
export function accentHint(tense, p, correct, user) {
  const i = typeof p === "number" ? p : P.indexOf(p);
  const hasAccent = correct !== strip(correct);
  if (!hasAccent) {
    if (tense === "preterito")
      return "Les passés simples irréguliers (<i lang=\"es\">tuve, hizo, pude, dije, fui</i>) ne prennent jamais d'accent écrit.";
    return "Cette forme ne prend pas d'accent écrit : l'accent tonique tombe là où la règle générale le prévoit.";
  }
  if (tense === "presente" && i === 2)
    return "Les formes du <i lang=\"es\">vos</i> sont accentuées sur la dernière syllabe et portent un accent écrit : <i lang=\"es\">hablás, comés, vivís</i>.";
  if (tense === "imperativo" && i === 2)
    return "L'impératif du <i lang=\"es\">vos</i> se forme avec l'infinitif sans le <i lang=\"es\">-r</i>, accentué à la fin : <i lang=\"es\">hablá, comé, viví</i>.";
  if (tense === "preterito" && (i === 0 || i === 3))
    return "Au passé simple, <i lang=\"es\">yo</i> et <i lang=\"es\">él</i> portent l'accent : <i lang=\"es\">hablé, habló</i>. Sans accent, <i lang=\"es\">hablo</i> est un présent.";
  if (tense === "imperfecto" && i === 4)
    return "À l'imparfait, la forme <i lang=\"es\">nosotros</i> porte toujours un accent : <i lang=\"es\">hablábamos, comíamos</i>.";
  if (tense === "imperfecto")
    return "À l'imparfait des verbes en <i lang=\"es\">-er/-ir</i>, le <i lang=\"es\">í</i> porte toujours l'accent : <i lang=\"es\">comía, vivías</i>.";
  if (tense === "futuro")
    return "Au futur, toutes les personnes sauf <i lang=\"es\">nosotros</i> portent l'accent sur la terminaison : <i lang=\"es\">hablaré, hablarás, hablará, hablarán</i>.";
  if (tense === "condicional")
    return "Au conditionnel, le <i lang=\"es\">í</i> de la terminaison porte toujours l'accent : <i lang=\"es\">hablaría, comeríamos</i>.";
  return "Attention à l'accent écrit : il indique la syllabe accentuée et change parfois le sens du mot.";
}

/** Erreur typique de diphtongue (puedés au lieu de podés, etc.). */
export function stemHint(tense, p, correct, user) {
  const i = typeof p === "number" ? p : P.indexOf(p);
  if (tense !== "presente" || (i !== 2 && i !== 4)) return null;
  const undo = [user.replace("ie", "e"), user.replace("ue", "o"), user.replace("ue", "u"), user.replace("i", "e")];
  if (undo.includes(correct))
    return "Avec <i lang=\"es\">vos</i> et <i lang=\"es\">nosotros</i>, la voyelle du radical ne change pas : <i lang=\"es\">vos podés, vos querés, nosotros dormimos</i>. Le changement ne touche que <i lang=\"es\">yo, tú, él, ellos</i>.";
  return null;
}
