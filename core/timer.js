// Temps passé dans l'app aujourd'hui (information simple, sans récompense).
// On ne compte que le temps où l'app est visible et utilisée (interaction dans les 2 dernières minutes).

import * as store from "./store.js";

const TICK = 15;
let lastInteraction = Date.now();

const today = () => new Date().toLocaleDateString("sv-SE");

export function start() {
  for (const ev of ["pointerdown", "keydown", "scroll"]) addEventListener(ev, () => (lastInteraction = Date.now()), { passive: true });
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastInteraction > 120000) return;
    store.update("time/days", {}, (d) => {
      d[today()] = (d[today()] || 0) + TICK;
      return d;
    });
  }, TICK * 1000);
}

export const minutesToday = () => Math.floor((store.get("time/days", {})[today()] || 0) / 60);
