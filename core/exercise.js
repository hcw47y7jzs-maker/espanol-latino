// Exercices génériques, utilisables par tous les modules et toutes les langues :
//  T : phrase à trou (réponse tapée)      { t:"T", q:"Mi hermana ___ médica.", a:["es"], why, full }
//  Q : choix multiple                      { t:"Q", q:"Busco ___ mi hermano.", o:["a","de","en"], c:0, why, full }
//  O : remettre les mots dans l'ordre     { t:"O", a:["No lo sé."], fr:"Je ne le sais pas.", why }
//  V : vrai ou faux                        { t:"V", q:"…", v:true, why }

import { h, es, icon, accentBar, answerInput } from "./ui.js";
import { compare, diffHtml, normalize, shuffle } from "./check.js";

const plain = (s) => normalize(s).replace(/[.,;:!?¡¿«»"()]/g, "").replace(/\s+/g, " ").trim();

/** Corrige une réponse. Renvoie { ok, accentOnly, correct, html }. */
export function check(item, answer, { lessonLink = "" } = {}) {
  const why = item.why ? `<p>${item.why}</p>` : "";
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

  if (item.t === "Q") {
    const sentence = item.q.includes("___") ? withBlank(item.q, h("span", { class: "blank" }, "…")) : [item.q];
    const opts2 = h(
      "div",
      { class: "options" },
      item.o.map((o, k) =>
        h(
          "button",
          {
            class: "option es-option",
            type: "button",
            lang: "es",
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
    add(item.fr ? h("p", { class: "item-context" }, item.fr) : null, h("p", { class: "phrase", lang: "es" }, sentence), opts2, out);
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
    h("p", { class: "feedback-title" }, res.ok ? "Correct" : res.accentOnly ? "Presque" : "Pas tout à fait"),
    full
      ? h("p", { class: "feedback-answer" }, es(full, "sentence"), speak ? h("button", { class: "icon-btn small", type: "button", "aria-label": "Écouter la phrase", onclick: () => speak(full) }, icon("speaker")) : null)
      : h("p", { class: "feedback-answer" }, h("b", {}, res.correct)),
    res.html ? h("div", { class: "feedback-text", html: res.html }) : null
  );
}
