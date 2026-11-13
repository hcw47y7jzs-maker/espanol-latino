// Lecture audio.
// 1) fichier pré-généré s'il existe (packs/<id>/audio/index.json) ;
// 2) sinon, voix de synthèse de l'appareil.

import * as store from "./store.js";

let manifest = null;
let packBase = "";
let langs = ["es"];
let current = null;

export async function init(base, speechLangs) {
  packBase = base;
  langs = speechLangs;
  try {
    const r = await fetch(`${base}audio/index.json`);
    if (r.ok) manifest = await r.json();
  } catch {}
  if ("speechSynthesis" in window) {
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener?.("voiceschanged", () => speechSynthesis.getVoices());
  }
}

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

const key = (text) => text.toLowerCase().normalize("NFC").trim();

export function speak(text, { rate } = {}) {
  stop();
  const file = manifest?.[key(text)];
  if (file) {
    current = new Audio(packBase + "audio/" + file);
    current.play().catch(() => speakSynth(text, rate));
    return;
  }
  speakSynth(text, rate);
}

function speakSynth(text, rate) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = v?.lang || langs[0];
  u.rate = rate ?? store.get("settings/rate", 0.9);
  speechSynthesis.speak(u);
}

export function stop() {
  if (current) {
    current.pause();
    current = null;
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

export const available = () => !!manifest || ("speechSynthesis" in window);
