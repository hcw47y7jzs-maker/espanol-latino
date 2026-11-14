// Petits outils d'interface, sans framework.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object")
      for (const [prop, val] of Object.entries(v)) prop.startsWith("--") ? el.style.setProperty(prop, val) : (el.style[prop] = val);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Remplace le contenu d'un élément (ignore null/false, aplatit les tableaux). */
export function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  return el;
}

/** Texte dans la langue étudiée (police à empattements, attribut lang). */
export const es = (text, cls = "") => h("span", { lang: "es", class: `es ${cls}`.trim() }, text);

export const ICONS = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
};

export const icon = (name, cls = "icon") => h("span", { class: cls, html: ICONS[name] });

/** En-tête d'écran aux couleurs du module. */
export function topbar({ title, subtitle, color, ink = "#fff", back = "#/", right = null, lang = "es" }) {
  return h(
    "header",
    { class: "topbar", style: { "--band": color, "--band-ink": ink } },
    h(
      "div",
      { class: "topbar-row" },
      back ? h("a", { class: "icon-btn", href: back, "aria-label": "Retour" }, icon("back")) : h("span"),
      right || h("span")
    ),
    h("h1", { class: "topbar-title", lang }, title),
    subtitle ? h("p", { class: "topbar-sub" }, subtitle) : null
  );
}

/** Contrôle segmenté (onglets). */
export function segmented(options, current, onPick, { label = "Sections", scroll = false } = {}) {
  return h(
    "div",
    { class: `segmented${scroll ? " scroll" : ""}`, role: "tablist", "aria-label": label },
    options.map((o) =>
      h(
        "button",
        {
          class: "seg",
          role: "tab",
          type: "button",
          "aria-selected": String(o.id === current),
          onclick: () => onPick(o.id),
        },
        o.label
      )
    )
  );
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = h("div", { class: "toast", role: "status", "aria-live": "polite" });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/** Barre d'accents qui insère le caractère dans le champ actif. */
export function accentBar(input, keys) {
  return h(
    "div",
    { class: "accent-bar", "aria-label": "Lettres accentuées" },
    keys.map((k) =>
      h(
        "button",
        {
          type: "button",
          class: "accent-key",
          lang: "es",
          onpointerdown: (e) => e.preventDefault(),
          onclick: () => {
            const target = typeof input === "function" ? input() : input;
            if (!target) return;
            const s = target.selectionStart ?? target.value.length;
            const e = target.selectionEnd ?? s;
            target.value = target.value.slice(0, s) + k + target.value.slice(e);
            target.setSelectionRange(s + 1, s + 1);
            target.focus();
            target.dispatchEvent(new Event("input"));
          },
        },
        k
      )
    )
  );
}

export function answerInput(placeholder = "Ta réponse") {
  return h("input", {
    class: "answer",
    type: "text",
    lang: "es",
    autocomplete: "off",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    enterkeyhint: "done",
    placeholder,
  });
}

export const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
