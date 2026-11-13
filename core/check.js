// Comparaison de réponses tapées au clavier, indépendante de la langue.

export const stripAccents = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");

/** Minuscule, espaces normalisés, ponctuation de début/fin retirée. */
export function normalize(s) {
  return (s || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[¡!¿?.,;:«»"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Retire les pronoms tapés devant la forme (« yo tengo » -> « tengo »). */
export function dropLeadingWords(s, words) {
  const parts = s.split(" ");
  while (parts.length > 1 && words.includes(parts[0])) parts.shift();
  return parts.join(" ");
}

/** Réponses acceptées : « vamos|vayamos ». */
export const answers = (expected) => (expected || "").split("|").map((x) => normalize(x));

/**
 * @returns {{ok: boolean, accentOnly: boolean, matched: string}}
 */
export function compare(user, expected, ignoredWords = []) {
  const u = dropLeadingWords(normalize(user), ignoredWords);
  const list = answers(expected);
  for (const a of list) if (u === a) return { ok: true, accentOnly: false, matched: a, user: u };
  for (const a of list)
    if (stripAccents(u) === stripAccents(a)) return { ok: false, accentOnly: true, matched: a, user: u };
  return { ok: false, accentOnly: false, matched: list[0], user: u };
}

/** Met en évidence la partie de la bonne réponse qui diffère de la réponse donnée. */
export function diffHtml(user, correct) {
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  let a = 0;
  while (a < user.length && a < correct.length && user[a] === correct[a]) a++;
  let b = 0;
  while (
    b < user.length - a &&
    b < correct.length - a &&
    user[user.length - 1 - b] === correct[correct.length - 1 - b]
  )
    b++;
  const mid = correct.slice(a, correct.length - b);
  if (!mid) return esc(correct);
  return esc(correct.slice(0, a)) + "<mark>" + esc(mid) + "</mark>" + esc(correct.slice(correct.length - b));
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];
