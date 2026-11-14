// Correction par l'IA (Groq) : traductions et expressions écrites.
// Les consignes sont en français ; le modèle répond en JSON, analysé par core/ai.js.

const BASE_RULES = `Tu es un professeur d'espagnol expérimenté et bienveillant. Ton élève est francophone et apprend l'espagnol d'Argentine (région de Salta).
Règles :
- Accepte le voseo (vos tenés) et le tuteo (tú tienes) ; ustedes pour le pluriel. Si l'élève utilise vosotros, ce n'est pas une faute, mais signale gentiment qu'en Argentine on dit ustedes.
- Accepte toute formulation correcte et naturelle, même si elle diffère de la référence. Ne pénalise ni la ponctuation ni les majuscules.
- Le lexique argentin (auto, celular, colectivo, plata…) et le lexique général sont tous deux acceptés.
- Tes explications sont en français, brèves, concrètes, avec la règle et un exemple. Ne réécris pas tout : corrige seulement ce qui est faux ou maladroit.
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.`;

const pointsList = (points) => points.map((p) => `${p.id} : ${p.fr}`).join("\n");

/**
 * Corrige une traduction.
 * @returns {{verdict:"correct"|"presque"|"incorrect", note:number, correction:string, erreurs:Array, lecon:object|null, point:string|null, remarque:string}}
 */
export async function correctTranslation(ai, { source, from, to, answer, refs, level, point, points }) {
  const dir = from === "fr" ? "du français vers l'espagnol" : "de l'espagnol vers le français";
  const schema = `{
  "verdict": "correct" | "presque" | "incorrect",
  "note": nombre de 0 à 10,
  "correction": "la traduction de l'élève corrigée, en gardant ses choix quand ils sont justes",
  "remarque": "une phrase d'appréciation en français",
  "erreurs": [ { "extrait": "passage fautif de l'élève", "correction": "forme correcte", "explication": "pourquoi, en une ou deux phrases" } ],
  "lecon": { "titre": "...", "explication": "mini-leçon de 2 à 4 phrases sur l'erreur principale", "exemples": ["exemple en espagnol — traduction", "..."] } ou null si aucune erreur,
  "point": "identifiant du point de grammaire le plus lié à l'erreur principale, choisi dans la liste, ou null"
}`;
  const user = `Exercice de traduction ${dir}, niveau ${level}.
Texte source : « ${source} »
Traduction(s) de référence : ${refs.map((r) => `« ${r} »`).join(" ou ")}
Traduction de l'élève : « ${answer} »
${point ? `Point de grammaire travaillé : ${point}\n` : ""}Points de grammaire possibles :
${pointsList(points)}

« presque » = le sens est juste mais il reste une petite faute (accent, accord, préposition). « incorrect » = le sens ou la grammaire est faux.
Schéma de la réponse :
${schema}`;
  const r = await ai.chat([{ role: "system", content: BASE_RULES }, { role: "user", content: user }], { json: true, maxTokens: 1400, temperature: 0.2 });
  return normalizeResult(r);
}

/**
 * Corrige une expression écrite.
 */
export async function correctWriting(ai, { prompt, defi, level, min, max, text, points }) {
  const schema = `{
  "appreciation": "2 ou 3 phrases en français : ce qui est réussi, ce qui est à travailler",
  "niveau_estime": "A1 | A2 | B1 | B2 | C1 | C2",
  "note": nombre de 0 à 20 (exigence adaptée au niveau ${level}),
  "consigne_respectee": true ou false,
  "defi_reussi": true, false, ou null s'il n'y a pas de défi,
  "texte_corrige": "le texte de l'élève corrigé (orthographe, grammaire, vocabulaire), sans en changer le style ni le contenu",
  "erreurs": [ { "extrait": "passage fautif", "correction": "forme correcte", "type": "grammaire | conjugaison | accord | vocabulaire | orthographe | style", "explication": "pourquoi, en une ou deux phrases", "point": "identifiant de point de grammaire de la liste, ou null" } ],
  "points_forts": ["…", "…"],
  "lecon": { "titre": "...", "explication": "mini-leçon de 3 à 5 phrases sur l'erreur la plus importante ou la plus fréquente", "exemples": ["exemple en espagnol — traduction", "..."] }
}`;
  const user = `Expression écrite, niveau visé ${level}.
Sujet : ${prompt}
${defi ? `Défi supplémentaire : ${defi}\n` : ""}Longueur demandée : ${min} à ${max} mots.
Texte de l'élève :
"""
${text}
"""
Liste au plus 12 erreurs, les plus utiles d'abord. Points de grammaire possibles :
${pointsList(points)}
Schéma de la réponse :
${schema}`;
  const r = await ai.chat([{ role: "system", content: BASE_RULES }, { role: "user", content: user }], { json: true, maxTokens: 3500, temperature: 0.2 });
  return {
    appreciation: String(r.appreciation || ""),
    niveau: String(r.niveau_estime || ""),
    note: clamp(Number(r.note), 0, 20),
    consigne: r.consigne_respectee !== false,
    defi: r.defi_reussi ?? null,
    corrige: String(r.texte_corrige || text),
    erreurs: Array.isArray(r.erreurs) ? r.erreurs.slice(0, 12).map(cleanErr) : [],
    forts: Array.isArray(r.points_forts) ? r.points_forts.map(String).slice(0, 4) : [],
    lecon: cleanLesson(r.lecon),
  };
}

const clamp = (n, a, b) => (Number.isFinite(n) ? Math.max(a, Math.min(b, Math.round(n))) : null);
const cleanErr = (e) => ({ extrait: String(e.extrait || ""), correction: String(e.correction || ""), type: String(e.type || ""), explication: String(e.explication || ""), point: e.point || null });
const cleanLesson = (l) => (l && l.titre ? { titre: String(l.titre), explication: String(l.explication || ""), exemples: Array.isArray(l.exemples) ? l.exemples.map(String).slice(0, 4) : [] } : null);

function normalizeResult(r) {
  const v = ["correct", "presque", "incorrect"].includes(r.verdict) ? r.verdict : "incorrect";
  return {
    verdict: v,
    note: clamp(Number(r.note), 0, 10),
    correction: String(r.correction || ""),
    remarque: String(r.remarque || ""),
    erreurs: Array.isArray(r.erreurs) ? r.erreurs.slice(0, 8).map(cleanErr) : [],
    lecon: v === "correct" ? null : cleanLesson(r.lecon),
    point: r.point || null,
  };
}
