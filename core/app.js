// Point d'entrée : charge le pack de langue, le stockage, puis les modules.

import * as store from "./store.js";
import * as audio from "./audio.js";
import * as timer from "./timer.js";
import { route, start, go } from "./router.js";
import { h, es, icon, topbar, toast } from "./ui.js";

const PACK_ID = "es-419";
const base = `./packs/${PACK_ID}/`;

const cache = {};
async function loadJSON(path) {
  if (!cache[path]) cache[path] = fetch(base + path).then((r) => {
    if (!r.ok) throw new Error(`${path} : ${r.status}`);
    return r.json();
  });
  return cache[path];
}
async function loadText(path) {
  if (!cache[path]) cache[path] = fetch(base + path).then((r) => r.text());
  return cache[path];
}

// Modules disponibles (les autres apparaissent « en préparation »).
const MODULES = {
  verbs: () => import("../modules/verbs/index.js"),
};

async function main() {
  await store.init();
  const pack = await (await fetch(base + "pack.json")).json();
  const lang = await import(`../packs/${PACK_ID}/lang.js`);
  await audio.init(base, pack.speechLangs);
  timer.start();

  const ctx = {
    pack, lang, store, audio, loadJSON, loadText,
    key: (k) => `${pack.id}/${k}`,
    prefs: () => ({ tu: store.get("settings/tu", true), vos: store.get("settings/vos", true) }),
  };

  const loaded = {};
  for (const [id, imp] of Object.entries(MODULES)) {
    loaded[id] = await imp();
    loaded[id].register({ ctx, route });
  }

  route("/", () => home(ctx, loaded));
  route("/reglages", () => settings(ctx));
  route("/bientot/:id", ({ id }) => comingSoon(ctx, id));

  await start(document.getElementById("app"));
  document.body.classList.add("ready");
  registerSW();
}

// ---------- Accueil : les modules en strates, comme le Cerro de los Siete Colores ----------

const RIDGE = "M0 70 L0 52 L38 30 L64 44 L112 6 L150 36 L178 24 L226 54 L262 40 L300 58 L300 70 Z";
const WAVES = [
  "M0 28 L0 14 C60 2 110 26 170 16 C220 8 260 4 300 12 L300 28 Z",
  "M0 28 L0 8 C50 18 120 22 180 10 C230 2 270 16 300 20 L300 28 Z",
  "M0 28 L0 18 C70 6 130 4 190 14 C240 22 270 12 300 6 L300 28 Z",
  "M0 28 L0 10 C40 4 100 20 160 18 C220 16 260 2 300 10 L300 28 Z",
  "M0 28 L0 16 C80 24 140 2 200 8 C250 13 280 20 300 16 L300 28 Z",
];

function greeting(pack) {
  const hr = new Date().getHours();
  return hr < 12 ? pack.greetings.morning : hr < 20 ? pack.greetings.afternoon : pack.greetings.night;
}

function home(ctx, loaded) {
  const { pack } = ctx;
  const mins = timer.minutesToday();
  const last = store.get("nav/last", null);
  const strata = h("nav", { class: "strata", "aria-label": "Modules" });
  pack.modules.forEach((m, i) => {
    const mod = loaded[m.id];
    const ready = m.ready && mod;
    const status = ready ? mod.summary?.(ctx) : "En préparation";
    const edge = h("span", {
      class: "stratum-edge",
      "aria-hidden": "true",
      html: `<svg class="${i === 0 ? "stratum-ridge" : "stratum-wave"}" viewBox="${i === 0 ? "0 0 300 70" : "0 0 300 28"}" preserveAspectRatio="none"><path d="${i === 0 ? RIDGE : WAVES[(i - 1) % WAVES.length]}" fill="${m.color}"/></svg>`,
    });
    strata.append(
      h(
        "a",
        {
          class: `stratum${ready ? "" : " is-soon"}`,
          href: ready ? `#/${m.id}` : `#/bientot/${m.id}`,
          style: { "--band": m.color, "--band-ink": m.ink, zIndex: String(10 + i) },
        },
        edge,
        h(
          "span",
          { class: "stratum-body" },
          h("span", { class: "stratum-text" }, es(m.title, "stratum-title"), h("span", { class: "stratum-sub" }, m.subtitle)),
          status ? h("span", { class: "stratum-status" }, status) : null
        )
      )
    );
  });

  return h(
    "main",
    { class: "home" },
    h(
      "header",
      { class: "home-head" },
      h("div", { class: "home-row" }, h("span"), h("a", { class: "icon-btn ghost", href: "#/reglages", "aria-label": "Réglages" }, icon("settings"))),
      h("h1", { class: "home-greet", lang: "es" }, greeting(pack)),
      h(
        "p",
        { class: "home-meta" },
        mins > 0 ? `${mins} min dans l'app aujourd'hui` : "Choisis un module pour commencer."
      ),
      last && last.path && last.path !== "/" ? h("a", { class: "resume", href: "#" + last.path }, `Reprendre : ${last.label}`) : null
    ),
    strata
  );
}

function comingSoon(ctx, id) {
  const m = ctx.pack.modules.find((x) => x.id === id) || ctx.pack.modules[0];
  return h(
    "main",
    { class: "screen" },
    topbar({ title: m.title, subtitle: m.subtitle, color: m.color, ink: m.ink }),
    h(
      "section",
      { class: "sheet" },
      h("p", { class: "lead" }, "Ce module est en préparation. Les verbes sont prêts : commence par là, tes réglages et ta progression seront repris quand ce module arrivera."),
      h("a", { class: "btn", href: "#/verbs" }, "Aller aux verbes")
    )
  );
}

// ---------- Réglages ----------

function settings(ctx) {
  const { store: s } = ctx;
  const toggle = (key, label, hint) => {
    const input = h("input", { type: "checkbox", checked: s.get(key, true) });
    input.addEventListener("change", () => {
      const other = key === "settings/tu" ? "settings/vos" : "settings/tu";
      if (!input.checked && !s.get(other, true)) {
        input.checked = true;
        toast("Garde au moins tú ou vos.");
        return;
      }
      s.set(key, input.checked);
    });
    return h("label", { class: "row toggle" }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, label), h("span", { class: "row-sub" }, hint)), input);
  };

  const voiceList = audio.voices();
  const voiceSel = h(
    "select",
    { class: "select", "aria-label": "Voix" },
    voiceList.length ? voiceList.map((v) => h("option", { value: v.voiceURI, selected: v.voiceURI === s.get("settings/voice") }, `${v.name} (${v.lang})`)) : h("option", {}, "Voix par défaut de l'appareil")
  );
  voiceSel.addEventListener("change", () => {
    s.set("settings/voice", voiceSel.value);
    audio.speak("Hola, ¿cómo andás?");
  });

  const fileInput = h("input", { type: "file", accept: "application/json", class: "visually-hidden", id: "import-file" });
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.app || data.app !== "aprender") throw new Error();
      s.restore(data.data);
      toast("Sauvegarde restaurée.");
      setTimeout(() => location.reload(), 600);
    } catch {
      toast("Ce fichier n'est pas une sauvegarde de l'app.");
    }
  });

  const persisted = h("span", { class: "row-sub" }, "Vérification…");
  s.isPersisted().then((p) => (persisted.textContent = p ? "Protégées : l'appareil ne les effacera pas." : "Pense à exporter une sauvegarde de temps en temps."));

  return h(
    "main",
    { class: "screen", style: { "--band": "#1F2347" } },
    topbar({ title: "Réglages", color: "#1F2347", lang: "fr" }),
    h(
      "section",
      { class: "sheet" },
      h("h2", { class: "section-title" }, "Tutoiement"),
      h("div", { class: "rows" },
        toggle("settings/vos", "Travailler le vos", "La forme argentine : vos tenés, vos sos."),
        toggle("settings/tu", "Travailler le tú", "La forme du Mexique, du Pérou, de la Colombie : tú tienes.")
      ),
      h("h2", { class: "section-title" }, "Voix"),
      h("div", { class: "rows" },
        h("div", { class: "row" }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, "Voix de lecture"), h("span", { class: "row-sub" }, "En attendant les audios enregistrés, l'app lit avec une voix de ton iPhone.")), ),
        h("div", { class: "row" }, voiceSel)
      ),
      h("h2", { class: "section-title" }, "Mes données"),
      h("div", { class: "rows" },
        h("div", { class: "row" }, h("span", { class: "row-text" }, h("span", { class: "row-title" }, "Stockées sur ce téléphone"), persisted)),
        h("button", {
          class: "row row-btn", type: "button",
          onclick: () => {
            const blob = new Blob([JSON.stringify({ app: "aprender", date: new Date().toISOString(), data: s.dump() })], { type: "application/json" });
            const a = h("a", { href: URL.createObjectURL(blob), download: `aprender-sauvegarde-${new Date().toLocaleDateString("sv-SE")}.json` });
            document.body.append(a); a.click(); a.remove();
          },
        }, "Exporter une sauvegarde"),
        h("label", { class: "row row-btn", for: "import-file" }, "Restaurer une sauvegarde"),
        fileInput
      ),
      h("p", { class: "fineprint" }, `Version ${window.APP_VERSION || "dev"}. Polices Alegreya et Alegreya Sans (Huerta Tipográfica, Argentine), licence SIL OFL.`)
    )
  );
}

// ---------- Mises à jour (service worker) ----------

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    const offer = (w) => {
      const bar = h(
        "div",
        { class: "update-bar", role: "status" },
        h("span", {}, "Une nouvelle version de l'app est prête."),
        h("button", { class: "btn small", type: "button", onclick: () => w.postMessage("skipWaiting") }, "Mettre à jour")
      );
      document.body.append(bar);
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) offer(w);
      });
    });
    setInterval(() => reg.update(), 60 * 60 * 1000);
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

main().catch((e) => {
  console.error(e);
  document.getElementById("app").innerHTML = `<main class="screen"><section class="sheet"><p class="lead">L'app n'a pas pu démarrer : ${e.message}. Recharge la page ; si le problème continue, note ce message.</p></section></main>`;
});
