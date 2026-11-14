// Exercices génériques, utilisables par tous les modules et toutes les langues :
//  T : phrase à trou (réponse tapée)      { t:"T", q:"Mi hermana ___ médica.", a:["es"], why, full }
//  Q : choix multiple                      { t:"Q", q:"Busco ___ mi hermano.", o:["a","de","en"], c:0, why, full }
//  O : remettre les mots dans l'ordre     { t:"O", a:["No lo sé."], fr:"Je ne le sais pas.", why }
//  V : vrai ou faux                        { t:"V", q:"…", v:true, why }
//  W : écrire une traduction               { t:"W", prompt:"voiture", lang:"es", a:["auto"], art:"el", why }
//      lang = langue de la réponse ; en français, accents et fautes de frappe légères sont tolérés,
//      en espagnol l'orthographe et le genre (article) sont exigés.
//  S : traduction libre, auto-évaluée     { t:"S", prompt:"phrase", lang:"fr", ref:"traduction proposée", why }
//      la personne compare sa traduction à celle proposée et dit si elle était juste.

import { h, es, icon, accentBar, answerInput, fill } from "./ui.js";
import { compare, diffHtml, normalize, shuffle, stripAccents } from "./check.js";

const FR_ARTICLES = ["le", "la", "les", "l'", "un", "une", "des", "se", "s'"];
const ES_ARTICLES = ["el", "la", "los", "las", "un", "una"];

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
    {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // inversion de deux lettres
    }
  return d[a.length][b.length];
}

/** Retire un article en tête (« le », « l'avion », « el auto »). Renvoie [article, reste]. */
function splitArticle(s, list) {
  for (const a of list) {
    if (a.endsWith("'") && s.startsWith(a)) return [a, s.slice(a.length).trim()];
    if (s.startsWith(a + " ")) return [a, s.slice(a.length + 1).trim()];
  }
  return [null, s];
}

function checkWord(item, answer) {
  const why = wrapWhy(item.why);
  const u0 = normalize(answer).replace(/[.!?¡¿]/g, "").trim();
  const correct = item.lang === "es" && item.art ? `${item.art} ${item.a[0]}` : item.a[0];
  if (!u0) return { ok: false, correct, html: why };
  if (item.lang === "fr") {
    const [, u] = splitArticle(u0, FR_ARTICLES);
    for (const a of item.a) {
      const [, t] = splitArticle(normalize(a), FR_ARTICLES);
      if (u === t || stripAccents(u) === stripAccents(t)) return { ok: true, correct, html: item.a.length > 1 ? `<p>Sens possibles : ${item.a.join(", ")}.</p>` : "" };
    }
    for (const a of item.a) {
      const [, t] = splitArticle(normalize(a), FR_ARTICLES);
      const tol = t.length >= 12 ? 2 : t.length >= 5 ? 1 : 0;
      if (tol && lev(stripAccents(u), stripAccents(t)) <= tol)
        return { ok: true, correct, html: `<p>Accepté, mais l'orthographe exacte est « ${a} ».</p>` };
    }
    return { ok: false, correct, html: `<p>Sens : ${item.a.join(", ")}.</p>${why}` };
  }
  // Réponse en espagnol
  const [art, u] = splitArticle(u0, ES_ARTICLES);
  const others = item.a.length > 1 ? `<p>Formes acceptées : ${item.a.map((x) => `<i lang="es">${x}</i>`).join(", ")}.</p>` : "";
  for (const a of item.a) {
    const t = normalize(a);
    const [, bare] = splitArticle(t, ES_ARTICLES);
    if (u0 === t || (!item.art && u === bare)) return { ok: true, correct, html: others };
    if (u === t) {
      if (art && item.art && art !== item.art)
        return { ok: false, accentOnly: true, correct, html: `<p>Presque : le mot est juste, mais l'article est <b lang="es">${item.art}</b>${item.g === "f" ? " (féminin)" : item.g === "m" ? " (masculin)" : ""}.</p>${why}` };
      return { ok: true, correct, html: "" };
    }
  }
  for (const a of item.a) {
    const t = stripAccents(normalize(a));
    if (stripAccents(u0) === t || stripAccents(u) === t)
      return { ok: false, accentOnly: true, correct, html: `<p>Presque : seul l'accent écrit manque ou est en trop.</p>${why}` };
  }
  return { ok: false, correct, html: `<p>Attendu : <b lang="es">${diffHtml(u, normalize(item.a[0]))}</b></p>${why}` };
}

const wrapWhy = (w) => (!w ? "" : w.startsWith("<") ? w : `<p>${w}</p>`);
const plain = (s) => normalize(s).replace(/[.,;:!?¡¿«»"()]/g, "").replace(/\s+/g, " ").trim();

/** Corrige une réponse. Renvoie { ok, accentOnly, correct, html }. */
export function check(item, answer, { lessonLink = "" } = {}) {
  const why = wrapWhy(item.why);
  const link = lessonLink ? `<p>${lessonLink}</p>` : "";
  if (item.t === "T") {
    const cmp = compare(answer, item.a.join("|"));
    const correct = item.a[0];
    if (cmp.ok) return { ok: true, correct, html: item.a.length > 1 ? `<p>Autres réponses possibles : ${item.a.slice(1).map((x) => `<i lang="es">${x}</i>`).join(", ")}.</p>` : "" };
    if (cmp.accentOnly) return { ok: false, accentOnly: true, correct, html: `<p>Presque : seule l'accentuation est fausse.</p>${why}${link}` };
    const shown = cmp.user ? `<p>Attendu : <b lang="es">${diffHtml(cmp.user, cmp.matched)}</b></p>` : "";
    return { ok: false, correct, html: shown + why + link };
  }
  if (item.t === "Q") {
    const ok = Number(answer) === item.c;
    return { ok, correct: item.o[item.c], html: ok ? "" : why + link };
  }
  if (item.t === "O") {
    const u = plain(answer);
    const ok = item.a.some((s) => plain(s) === u);
    return { ok, correct: item.a[0], html: ok ? (item.a.length > 1 ? `<p>Aussi possible : <i lang="es">${item.a.slice(1).join(" / ")}</i></p>` : "") : why + link };
  }
  if (item.t === "W") {
    const r = checkWord(item, answer);
    if (!r.ok && lessonLink) r.html += `<p>${lessonLink}</p>`;
    return r;
  }
  if (item.t === "V") {
    const ok = (answer === "true") === item.v;
    return { ok, correct: item.v ? "Vrai" : "Faux", html: (ok ? "" : "") + why + (ok ? "" : link) };
  }
  return { ok: false, correct: "", html: "" };
}

/** Phrase à afficher dans le titre de l'exercice, avec le trou remplacé par un champ. */
function withBlank(q, field) {
  const [before, after = ""] = q.split("___");
  return [before, field, after];
}

/**
 * Affiche un exercice.
 * @param opts.onAnswer(answer, res) appelé une fois la réponse donnée
 * @param opts.test si vrai, pas de correction immédiate
 */
export function render(item, opts) {
  const { accentKeys = [], speak, test = false, lessonLink = "", onAnswer } = opts;
  const wrap = h("div", { class: "exercise" });
  const add = (...kids) => wrap.append(...kids.flat().filter((k) => k != null && k !== false));
  const out = h("div");
  let answered = false;

  const finish = (answer) => {
    if (answered) return;
    answered = true;
    const res = check(item, answer, { lessonLink });
    onAnswer(answer, res, out);
  };

  if (item.t === "T") {
    const input = answerInput();
    input.classList.add("inline");
    const submit = h("button", { class: "btn", type: "button" }, test ? "Valider" : "Vérifier");
    const go = () => {
      if (answered) return;
      input.readOnly = true;
      const res = check(item, input.value, { lessonLink });
      input.classList.add(res.ok ? "is-ok" : "is-ko");
      submit.remove();
      answered = true;
      onAnswer(input.value, res, out);
    };
    submit.addEventListener("click", go);
    input.addEventListener("keydown", (e) => e.key === "Enter" && go());
    add(
      item.fr ? h("p", { class: "item-context" }, item.fr) : null,
      h("p", { class: "phrase", lang: "es" }, withBlank(item.q, input)),
      accentBar(input, accentKeys),
      h("div", { class: "actions" }, submit),
      out
    );
    setTimeout(() => input.focus({ preventScroll: true }), 30);
    return wrap;
  }

  if (item.t === "W") {
    const input = answerInput(item.lang === "es" ? "En espagnol" : "En français");
    input.setAttribute("lang", item.lang);
    const submit = h("button", { class: "btn", type: "button" }, test ? "Valider" : "Vérifier");
    const go = () => {
      if (answered) return;
      input.readOnly = true;
      const res = check(item, input.value, { lessonLink });
      input.classList.add(res.ok ? "is-ok" : "is-ko");
      submit.remove();
      answered = true;
      onAnswer(input.value, res, out);
    };
    submit.addEventListener("click", go);
    input.addEventListener("keydown", (e) => e.key === "Enter" && go());
    add(
      h("p", { class: "item-context" }, item.context || (item.lang === "es" ? "Écris en espagnol (avec l'article pour un nom) :" : "Écris en français :")),
      h("p", { class: "item-verb" }, h("span", { class: item.lang === "es" ? "big" : "big es", lang: item.lang === "es" ? "fr" : "es" }, item.prompt), item.lang === "fr" && speak ? h("button", { class: "icon-btn small", type: "button", "aria-label": "Écouter", onclick: () => speak(item.prompt) }, icon("speaker")) : null),
      item.hint ? h("p", { class: "small muted" }, item.hint) : null,
      input,
      item.lang === "es" ? accentBar(input, accentKeys) : null,
      h("div", { class: "actions" }, submit),
      out
    );
    setTimeout(() => input.focus({ preventScroll: true }), 30);
    return wrap;
  }

  if (item.t === "S") {
    const area = h("textarea", { class: "answer area", rows: 3, lang: item.lang, autocomplete: "off", autocapitalize: "sentences", spellcheck: "true", placeholder: item.lang === "fr" ? "Ta traduction en français" : "Tu traducción" });
    const reveal = h("button", { class: "btn", type: "button" }, "Voir la traduction proposée");
    const zone = h("div");
    reveal.addEventListener("click", () => {
      if (answered) return;
      area.readOnly = true;
      reveal.remove();
      const grade = (ok) => {
        if (answered) return;
        answered = true;
        fill(zone, h("p", { class: "self-ref" }, h("span", { class: "small muted" }, "Traduction proposée"), h("span", { class: "self-text", lang: item.lang }, item.ref)));
        onAnswer(area.value, { ok, self: true, correct: item.ref, html: "" }, out);
      };
      fill(
        zone,
        h("p", { class: "self-ref" }, h("span", { class: "small muted" }, "Traduction proposée"), h("span", { class: "self-text", lang: item.lang }, item.ref)),
        h("p", { class: "small muted" }, "Le sens est-il le même que dans ta traduction ? Les tournures peuvent différer."),
        h("div", { class: "actions" }, h("button", { class: "btn secondary", type: "button", onclick: () => grade(false) }, "À revoir"), h("button", { class: "btn", type: "button", onclick: () => grade(true) }, "C'était juste"))
      );
    });
    add(
      h("p", { class: "item-context" }, item.context || "Traduis la phrase en français :"),
      h("p", { class: "phrase", lang: "es" }, item.prompt, speak ? h("button", { class: "icon-btn small", type: "button", "aria-label": "Écouter", onclick: () => speak(item.prompt) }, icon("speaker")) : null),
      area,
      h("div", { class: "actions" }, reveal),
      zone,
      out
    );
    setTimeout(() => area.focus({ preventScroll: true }), 30);
    return wrap;
  }

  if (item.t === "Q") {
    const qLang = item.qLang || "es";
    const sentence = item.q.includes("___") ? withBlank(item.q, h("span", { class: "blank" }, "…")) : [item.q];
    const opts2 = h(
      "div",
      { class: "options" },
      item.o.map((o, k) =>
        h(
          "button",
          {
            class: `option${(item.oLang || "es") === "es" ? " es-option" : ""}`,
            type: "button",
            lang: item.oLang || "es",
            onclick: (e) => {
              if (answered) return;
              opts2.querySelectorAll(".option").forEach((b, j) => {
                if (!test && j === item.c) b.classList.add("is-ok");
              });
              if (test) e.currentTarget.classList.add("picked");
              else if (k !== item.c) e.currentTarget.classList.add("is-ko");
              finish(String(k));
            },
          },
          o
        )
      )
    );
    add(
      item.fr ? h("p", { class: "item-context" }, item.fr) : null,
      h("p", { class: qLang === "es" ? "phrase" : "phrase fr-prompt", lang: qLang }, sentence, qLang === "es" && speak && item.say ? h("button", { class: "icon-btn small", type: "button", "aria-label": "Écouter", onclick: () => speak(item.say) }, icon("speaker")) : null),
      opts2,
      out
    );
    return wrap;
  }

  if (item.t === "O") {
    // Étiquettes sans ponctuation ; minuscule en début de phrase (les noms propres gardent leur majuscule).
    let start = true;
    const tokens = item.a[0].split(" ").map((raw) => {
      const w = raw.replace(/[¿¡?!.,;:«»"]/g, "");
      const shown = start ? w.charAt(0).toLowerCase() + w.slice(1) : w;
      start = /[.?!]$/.test(raw);
      return shown;
    }).filter(Boolean);
    const tiles = shuffle(tokens.map((w, i) => ({ w, i })));
    if (tiles.every((t, k) => t.i === k) && tiles.length > 1) tiles.reverse();
    const line = h("div", { class: "order-line", "aria-label": "Ta phrase" });
    const bank = h("div", { class: "order-bank" });
    const picked = [];
    const draw = () => {
      line.replaceChildren(...picked.map((t, k) => h("button", { class: "tile on", type: "button", lang: "es", onclick: () => { if (answered) return; picked.splice(k, 1); draw(); } }, t.w)));
      if (!picked.length) line.append(h("span", { class: "order-hint" }, "Touche les mots dans l'ordre."));
      bank.replaceChildren(
        ...tiles.map((t) =>
          h("button", { class: "tile", type: "button", lang: "es", disabled: picked.includes(t), onclick: () => { if (answered) return; picked.push(t); draw(); } }, t.w)
        )
      );
    };
    draw();
    const submit = h("button", { class: "btn", type: "button" }, test ? "Valider" : "Vérifier");
    submit.addEventListener("click", () => {
      if (answered || !picked.length) return;
      const ans = picked.map((t) => t.w).join(" ");
      const res = check(item, ans, { lessonLink });
      line.classList.add(res.ok ? "is-ok" : "is-ko");
      submit.remove();
      answered = true;
      onAnswer(ans, res, out);
    });
    add(h("p", { class: "item-context" }, "Remets les mots dans l'ordre :"), item.fr ? h("p", { class: "lead" }, `« ${item.fr} »`) : null, line, bank, h("div", { class: "actions" }, submit), out);
    return wrap;
  }

  if (item.t === "V") {
    const b = (val, label) =>
      h(
        "button",
        {
          class: "option", type: "button",
          onclick: (e) => {
            if (answered) return;
            if (!test) e.currentTarget.classList.add(String(item.v) === val ? "is-ok" : "is-ko");
            else e.currentTarget.classList.add("picked");
            finish(val);
          },
        },
        label
      );
    add(h("p", { class: "item-context" }, "Vrai ou faux ?"), h("p", { class: "statement", html: item.q }), h("div", { class: "options two" }, b("true", "Vrai"), b("false", "Faux")), out);
    return wrap;
  }
  return wrap;
}

/** Bloc de correction affiché après la réponse (hors test). */
export function feedback(item, res, speak) {
  const full = item.full || (item.t === "O" ? item.a[0] : null);
  return h(
    "div",
    { class: `feedback ${res.ok ? "ok" : "ko"}`, role: "status" },
    h("p", { class: "feedback-title" }, res.self ? (res.ok ? "Bien vu" : "À revoir") : res.ok ? "Correct" : res.accentOnly ? "Presque" : "Pas tout à fait"),
    full
      ? h("p", { class: "feedback-answer" }, es(full, "sentence"), speak ? h("button", { class: "icon-btn small", type: "button", "aria-label": "Écouter la phrase", onclick: () => speak(full) }, icon("speaker")) : null)
      : h("p", { class: "feedback-answer" }, h("b", {}, res.correct)),
    res.html ? h("div", { class: "feedback-text", html: res.html }) : null
  );
}
