// Cartes de Práctica corrigées par l'IA : traduction (phrase ou texte) et expression écrite.

import { h, icon, fill } from "../../core/ui.js";
import { checkTranslation, wordDiff, countWords } from "./engine.js";
import { correctTranslation, correctWriting } from "./correct.js";

const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const LABEL = { es: "espagnol", fr: "français" };

function lessonBox(C, E, lecon, pointId) {
  const g = pointId && E.grammar[pointId];
  if (!lecon && !g) return null;
  return h(
    "div",
    { class: "mini-lesson" },
    h("p", { class: "note-title" }, lecon ? `Mini-leçon : ${lecon.titre}` : "Pour revoir la règle"),
    lecon ? h("p", {}, lecon.explication) : null,
    lecon && lecon.exemples.length ? h("ul", {}, lecon.exemples.map((x) => h("li", { lang: "es" }, x))) : null,
    g ? h("a", { class: "lesson-link", href: `#/grammar/lecon/${g.id}` }, `Leçon de grammaire : ${g.fr}`) : null
  );
}

function errorList(errs) {
  if (!errs.length) return null;
  return h("ul", { class: "err-list" }, errs.map((e) =>
    h("li", {},
      h("p", { class: "err-pair" }, h("del", { lang: "es" }, e.extrait), " → ", h("ins", { lang: "es" }, e.correction), e.type ? h("span", { class: "err-type" }, e.type) : null),
      e.explication ? h("p", { class: "err-why" }, e.explication) : null
    )
  ));
}

const spinner = (txt) => h("p", { class: "speak-msg" }, h("span", { class: "spinner" }), ` ${txt}`);

/**
 * Carte de traduction.
 * item : { from, to, source, refs, point, lvl, context? }
 * onResult({ ok, half, note, verdict, answer })
 */
export function renderTranslate(item, { C, E, onResult, test = false }) {
  const wrap = h("div", { class: "tr-card" });
  const area = h("textarea", { class: "answer area", rows: item.source.length > 140 ? 7 : 3, lang: item.to, autocapitalize: "sentences", spellcheck: "false", placeholder: `Ta traduction en ${LABEL[item.to]}` });
  const out = h("div", { class: "tr-out", "aria-live": "polite" });
  const btn = h("button", { class: "btn", type: "button" }, "Corriger");
  let done = false;

  const finish = (res) => {
    if (done) return;
    done = true;
    area.readOnly = true;
    btn.remove();
    onResult(res);
  };

  btn.addEventListener("click", async () => {
    const answer = area.value.trim();
    if (!answer) return area.focus();
    const local = checkTranslation(answer, item.refs, item.to);
    if (local.ok) {
      fill(out, h("p", { class: "speak-verdict ok" }, "Parfait !"), item.refs.length > 1 ? h("p", { class: "small muted" }, "Autres traductions possibles : ", item.refs.filter((r) => r !== answer).join(" / ")) : null);
      return finish({ ok: true, note: 10, verdict: "correct", answer });
    }
    if (!C.ai.hasKey()) {
      fill(
        out,
        h("p", { class: "self-ref" }, h("span", { class: "small muted" }, "Traduction proposée"), h("span", { class: "self-text", lang: item.to }, item.refs.join(" / "))),
        local.accentOnly ? h("p", { class: "small" }, "Seuls des accents diffèrent.") : null,
        h("p", { class: "small muted" }, "Sans clé Groq, compare toi-même : le sens est-il le même ?"),
        h("div", { class: "actions" },
          h("button", { class: "btn secondary", type: "button", onclick: () => finish({ ok: false, answer, self: true }) }, "À revoir"),
          h("button", { class: "btn", type: "button", onclick: () => finish({ ok: true, answer, self: true }) }, "C'était juste"))
      );
      btn.disabled = true;
      return;
    }
    btn.disabled = true;
    fill(out, spinner("Le professeur IA corrige ta traduction…"));
    try {
      const r = await correctTranslation(C.ai, { source: item.source, from: item.from, to: item.to, answer, refs: item.refs, level: item.lvl, point: item.point, points: E.pointsNear(item.lvl) });
      const cls = r.verdict === "correct" ? "ok" : r.verdict === "presque" ? "almost" : "ko";
      const title = r.verdict === "correct" ? "Correct !" : r.verdict === "presque" ? "Presque !" : "À revoir";
      fill(
        out,
        h("p", { class: `speak-verdict ${cls}` }, title, r.note !== null ? h("span", { class: "note-chip" }, `${r.note}/10`) : null),
        r.remarque ? h("p", {}, r.remarque) : null,
        r.correction && r.verdict !== "correct" ? h("div", { class: "tr-diff" }, h("p", { class: "small muted" }, "Ta traduction corrigée"), h("p", { class: "diff-text", lang: item.to, html: wordDiff(answer, r.correction) })) : null,
        errorList(r.erreurs),
        lessonBox(C, E, r.lecon, r.point || (r.verdict !== "correct" ? item.point : null)),
        h("p", { class: "small muted" }, `Traduction de référence : ${item.refs[0]}`)
      );
      finish({ ok: r.verdict === "correct", half: r.verdict === "presque", note: r.note, verdict: r.verdict, answer });
    } catch (e) {
      btn.disabled = false;
      fill(out, h("p", { class: "speak-msg" }, e.message), h("p", { class: "small muted" }, `Traduction proposée : ${item.refs.join(" / ")}`));
    }
  });

  fill(
    wrap,
    item.context ? h("div", { class: "tr-context" }, item.context) : null,
    h("p", { class: "item-context" }, `Traduis en ${LABEL[item.to]} :`),
    h("p", { class: item.from === "es" ? "phrase" : "phrase fr-prompt", lang: item.from }, item.source, item.from === "es" ? h("button", { class: "icon-btn small", type: "button", "aria-label": "Écouter", onclick: () => C.audio.speak(item.source) }, icon("speaker")) : null),
    area,
    h("div", { class: "actions" }, btn),
    out
  );
  setTimeout(() => area.focus({ preventScroll: true }), 50);
  return wrap;
}

/**
 * Carte d'expression écrite.
 * task : { lvl, prompt, defi, min, max, points, pid, v }
 * onResult(result, text) ; draft : texte déjà commencé
 */
export function renderWriting(task, { C, E, onResult, draft = "", onDraft = () => {} }) {
  const wrap = h("div", { class: "write-card" });
  const area = h("textarea", { class: "answer area write-area", rows: 12, lang: "es", autocapitalize: "sentences", spellcheck: "false", placeholder: "Escribí acá tu texto…" });
  area.value = draft;
  const counter = h("p", { class: "word-count" });
  const out = h("div", { class: "tr-out", "aria-live": "polite" });
  const btn = h("button", { class: "btn", type: "button" }, C.ai.hasKey() ? "Faire corriger" : "Terminer");
  const upd = () => {
    const n = countWords(area.value);
    counter.textContent = `${n} mot${n > 1 ? "s" : ""} (demandé : ${task.min} à ${task.max})`;
    counter.className = `word-count ${n < task.min ? "under" : n > task.max * 1.25 ? "over" : "good"}`;
    onDraft(area.value);
  };
  area.addEventListener("input", upd);
  upd();

  btn.addEventListener("click", async () => {
    const text = area.value.trim();
    if (countWords(text) < Math.min(10, task.min)) return fill(out, h("p", { class: "speak-msg" }, "Écris un peu plus avant de faire corriger."));
    if (!C.ai.hasKey()) {
      fill(out, h("div", { class: "mini-lesson" }, h("p", { class: "note-title" }, "Relis-toi avec cette grille"), h("ul", {}, ["La consigne est-elle entièrement traitée ?", "Les verbes sont-ils bien conjugués et au bon temps ?", "Les accords (genre, nombre) sont-ils corrects ?", "As-tu relié tes idées avec des connecteurs ?", task.defi ? `Défi : ${task.defi}` : null].filter(Boolean).map((x) => h("li", {}, x))), h("p", { class: "small muted" }, "Ajoute ta clé Groq dans les Réglages pour une correction détaillée.")));
      return onResult(null, text);
    }
    btn.disabled = true;
    area.readOnly = true;
    fill(out, spinner("Le professeur IA lit ton texte… (environ 10 à 30 secondes)"));
    try {
      const r = await correctWriting(C.ai, { prompt: task.prompt, defi: task.defi, level: task.lvl, min: task.min, max: task.max, text, points: E.pointsNear(task.lvl) });
      fill(out, writingResult(C, E, r, text));
      btn.remove();
      onResult(r, text);
    } catch (e) {
      btn.disabled = false;
      area.readOnly = false;
      fill(out, h("p", { class: "speak-msg" }, e.message));
    }
  });

  fill(
    wrap,
    h("div", { class: "write-task" }, h("p", { class: "write-prompt" }, task.prompt), task.defi ? h("p", { class: "write-defi" }, h("b", {}, "Défi : "), task.defi) : null, h("p", { class: "small muted" }, `Niveau ${task.lvl}, ${task.min} à ${task.max} mots.`)),
    area,
    counter,
    h("div", { class: "actions" }, btn),
    out
  );
  return wrap;
}

/** Affichage d'une correction d'expression écrite (aussi utilisé pour relire l'historique). */
export function writingResult(C, E, r, text) {
  const firstPoint = r.erreurs.find((e) => e.point)?.point;
  return h(
    "div",
    { class: "write-result" },
    h("p", { class: "speak-verdict" }, "Correction", r.note !== null ? h("span", { class: "note-chip" }, `${r.note}/20`) : null, r.niveau ? h("span", { class: "chip lvl-" + r.niveau.toLowerCase() }, `niveau estimé ${r.niveau}`) : null),
    h("p", {}, r.appreciation),
    !r.consigne ? h("p", { class: "small warn" }, "La consigne n'est pas entièrement respectée.") : null,
    r.defi === true ? h("p", { class: "small good" }, "Défi réussi.") : r.defi === false ? h("p", { class: "small warn" }, "Défi pas encore réussi.") : null,
    r.forts.length ? h("div", { class: "forts" }, h("p", { class: "note-title" }, "Points forts"), h("ul", {}, r.forts.map((x) => h("li", {}, x)))) : null,
    h("div", { class: "tr-diff" }, h("p", { class: "small muted" }, "Ton texte corrigé"), h("p", { class: "diff-text", lang: "es", html: wordDiff(text, r.corrige) })),
    r.erreurs.length ? [h("p", { class: "note-title" }, "Les erreurs expliquées"), errorList(r.erreurs)] : null,
    lessonBox(C, E, r.lecon, firstPoint)
  );
}
