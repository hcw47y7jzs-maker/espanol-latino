// Lecture audio.
// 1) enregistrement du pack s'il existe (packs/<id>/audio/index.json, généré par le workflow « Audios ») ;
// 2) sinon, voix de synthèse de l'appareil.

import * as store from "./store.js";

let manifest = {};
let packBase = "";
let langs = ["es"];
let current = null;
let queueToken = 0;

/** Même clé que tools/build_audio_texts.py et tools/synthesize_audio.py. */
export const speechKey = (text) => text.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

export async function init(base, speechLangs) {
  packBase = base;
  langs = speechLangs;
  try {
    const r = await fetch(`${base}audio/index.json`, { cache: "no-cache" });
    if (r.ok) manifest = await r.json();
  } catch {}
  if ("speechSynthesis" in window) {
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener?.("voiceschanged", () => speechSynthesis.getVoices());
  }
}

export const recordedCount = () => Object.keys(manifest).length;
export const isRecorded = (text) => !!manifest[speechKey(text)];

export function voices() {
  if (!("speechSynthesis" in window)) return [];
  const all = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("es"));
  const rank = (v) => {
    const i = langs.findIndex((l) => v.lang.toLowerCase().replace("_", "-").startsWith(l.toLowerCase()));
    return i < 0 ? 99 : i;
  };
  return all.sort((a, b) => rank(a) - rank(b));
}

function pickVoice() {
  const wanted = store.get("settings/voice", null);
  const list = voices();
  return list.find((v) => v.voiceURI === wanted) || list[0] || null;
}

function playFile(file, rate) {
  return new Promise((resolve) => {
    current = new Audio(packBase + "audio/" + file);
    current.preservesPitch = true;
    current.playbackRate = rate || store.get("settings/playbackRate", 0.9);
    current.onended = resolve;
    current.onerror = () => resolve("error");
    current.play().catch(() => resolve("error"));
  });
}

function synth(text, rate) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const second = /^\[b\]\s*/.test(text); // seconde voix des dialogues : voix plus grave
    const u = new SpeechSynthesisUtterance(text.replace(/^\[b\]\s*/, ""));
    if (second) u.pitch = 0.7;
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || langs[0];
    u.rate = rate || store.get("settings/rate", 0.9);
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

async function sayOne(text, rate) {
  const file = manifest[speechKey(text)];
  if (file && (await playFile(file, rate)) !== "error") return;
  await synth(text, rate);
}

/** Lit un texte ; rate (facultatif) remplace la vitesse des Réglages pour cette lecture. */
export function speak(text, { rate } = {}) {
  stop();
  sayOne(text, rate);
}

/** Lit plusieurs textes à la suite (un tableau de conjugaison, par exemple). */
export async function speakSequence(texts, pauseMs = 250) {
  stop();
  const token = ++queueToken;
  for (const t of texts) {
    if (token !== queueToken) return;
    await sayOne(t);
    await new Promise((r) => setTimeout(r, pauseMs));
  }
}

export function stop() {
  queueToken++;
  if (current) {
    current.pause();
    current = null;
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
