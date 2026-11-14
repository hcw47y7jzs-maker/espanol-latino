// Accès à l'IA gratuite de Groq : Whisper pour la reconnaissance vocale, un modèle ouvert pour
// les explications. La clé est saisie dans les Réglages et reste sur le téléphone
// (clé « secret/groqKey », exclue des sauvegardes exportées).

import { extFor } from "./recorder.js";

const BASE = "https://api.groq.com/openai/v1";
const KEY = "secret/groqKey";
const MODELS = "ai/models";
const WHISPER = ["whisper-large-v3", "whisper-large-v3-turbo"];
// Préférences pour les explications ; la liste réelle est lue sur le compte (les modèles changent).
const CHAT = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "meta-llama/llama-4-maverick-17b-128e-instruct", "qwen/qwen3-32b", "llama-3.1-8b-instant"];

let store = null;
export const init = (s) => (store = s);
export const getKey = () => (store?.get(KEY, "") || "").trim();
export const setKey = (k) => store.set(KEY, (k || "").trim());
export const hasKey = () => !!getKey();

export class AIError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function call(path, init = {}, key = getKey()) {
  if (!key) throw new AIError("Ajoute ta clé Groq dans les Réglages pour activer la correction.", "nokey");
  let r;
  try {
    r = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${key}`, ...(init.headers || {}) } });
  } catch {
    throw new AIError("Pas de connexion : la correction par l'IA a besoin d'internet.", "network");
  }
  if (r.status === 401) throw new AIError("La clé Groq est refusée. Vérifie-la dans les Réglages.", "auth");
  if (r.status === 429) {
    const s = Number(r.headers.get("retry-after")) || 20;
    throw new AIError(`Limite gratuite atteinte pour le moment : réessaie dans ${s} secondes.`, "rate");
  }
  if (!r.ok) {
    let msg = "";
    try { msg = (await r.json()).error?.message || ""; } catch {}
    throw new AIError(`L'IA n'a pas pu répondre (${r.status}). ${msg}`.trim(), "http");
  }
  return r.json();
}

/** Liste des modèles du compte, gardée un jour. */
export async function models({ force = false, key } = {}) {
  const cached = store.get(MODELS);
  if (!force && !key && cached && Date.now() - cached.ts < 864e5) return cached.ids;
  const j = await call("/models", {}, key || getKey());
  const ids = (j.data || []).map((m) => m.id);
  if (!key) store.set(MODELS, { ts: Date.now(), ids });
  return ids;
}

/** Vérifie une clé : renvoie les modèles disponibles ou lève une AIError. */
export async function checkKey(key) {
  const ids = await models({ key, force: true });
  return { whisper: WHISPER.find((m) => ids.includes(m)) || null, chat: CHAT.find((m) => ids.includes(m)) || null, count: ids.length };
}

async function pick(list, fallback) {
  try {
    const ids = await models();
    return list.find((m) => ids.includes(m)) || fallback(ids) || list[0];
  } catch (e) {
    if (e.code === "auth" || e.code === "nokey") throw e;
    return list[0];
  }
}

/**
 * Transcrit un enregistrement en espagnol.
 * @returns {{text:string, noSpeech:number, logprob:number}}
 */
export async function transcribe(rec, { language = "es", prompt = "" } = {}) {
  const model = await pick(WHISPER, (ids) => ids.find((m) => m.includes("whisper")));
  const fd = new FormData();
  fd.append("file", rec.blob, `voix.${extFor(rec.type)}`);
  fd.append("model", model);
  fd.append("language", language);
  fd.append("response_format", "verbose_json");
  fd.append("temperature", "0");
  if (prompt) fd.append("prompt", prompt);
  const j = await call("/audio/transcriptions", { method: "POST", body: fd });
  const segs = j.segments || [];
  const noSpeech = segs.length ? Math.max(...segs.map((s) => s.no_speech_prob ?? 0)) : 0;
  const logprob = segs.length ? Math.min(...segs.map((s) => s.avg_logprob ?? 0)) : 0;
  return { text: (j.text || "").trim(), noSpeech, logprob };
}

/** Réponse courte d'un modèle de langage. */
export async function chat(messages, { maxTokens = 350, temperature = 0.3 } = {}) {
  const model = await pick(CHAT, (ids) => ids.find((m) => !/whisper|guard|tts|orpheus|playai|compound/.test(m)));
  const body = { model, messages, temperature, max_completion_tokens: maxTokens };
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  const j = await call("/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (j.choices?.[0]?.message?.content || "").trim();
}
