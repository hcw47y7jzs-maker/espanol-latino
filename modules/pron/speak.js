// Carte « Répéter au micro » : écouter le modèle, parler, recevoir la correction.
// Avec une clé Groq : Whisper transcrit, diagnose() repère les sons à retravailler, puis un modèle
// de langage explique l'erreur en français. Sans clé : on se réécoute et on s'évalue soi-même.

import { h, icon, fill, es } from "../../core/ui.js";
import * as REC from "../../core/recorder.js";
import { diagnose, TIPS } from "./diagnose.js";

const md = (s) => s.replace(/\*([^*]+)\*/g, '<i lang="es">$1</i>');

/**
 * @param item  { target, kind:"mot"|"phrase", syl?, st?, fr? }
 * @param o     { C, lessonTitle(id), onResult({ok, score, self}), compact }
 */
export function renderSpeak(item, { C, lessonTitle = () => "", onResult = () => {} }) {
  const wrap = h("div", { class: "speak" });
  const aiOn = C.ai.hasKey();
  let lastRec = null, lastUrl = null, busy = false, controller = null, attempts = 0;

  const targetView =
    item.kind === "mot" && item.syl
      ? h("p", { class: "speak-target", lang: "es" }, item.syl.map((s, i) => h("span", { class: i === item.st ? "syl stress" : "syl" }, s)).reduce((a, x, i) => (i ? [...a, h("span", { class: "syl-dot" }, "·"), x] : [x]), []))
      : h("p", { class: "speak-target phrase-target", lang: "es" }, item.target);

  const listen = (rate) => C.audio.speak(item.target, rate ? { rate } : {});

  const meter = h("span", { class: "mic-meter" });
  const micLabel = h("span", { class: "mic-label" }, "Touche et parle");
  const mic = h("button", { class: "mic-btn", type: "button", "aria-label": "Parler au micro" }, icon("mic"), meter);
  const result = h("div", { class: "speak-result", "aria-live": "polite" });

  mic.addEventListener("click", async () => {
    if (busy && controller) { controller.stop(); return; }
    if (busy) return;
    if (!REC.supported()) return fill(result, h("p", { class: "speak-msg" }, "Ce navigateur ne permet pas d'enregistrer le micro."));
    busy = true;
    C.audio.stop();
    mic.classList.add("on");
    micLabel.textContent = "Je t'écoute… (touche pour arrêter)";
    fill(result);
    try {
      controller = REC.record({
        maxMs: item.kind === "mot" ? 4000 : 12000,
        silenceMs: item.kind === "mot" ? 800 : 1200,
        onLevel: (l) => meter.style.setProperty("--lvl", l.toFixed(2)),
      });
      const rec = await controller.done;
      controller = null;
      mic.classList.remove("on");
      meter.style.setProperty("--lvl", 0);
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastRec = rec;
      lastUrl = URL.createObjectURL(rec.blob);
      if (!rec.speech) {
        micLabel.textContent = "Touche et parle";
        fill(result, h("p", { class: "speak-msg" }, "Je n'ai rien entendu. Parle un peu plus fort, près du téléphone."));
        busy = false;
        return;
      }
      attempts++;
      if (aiOn) await evaluate(rec);
      else selfCheck();
    } catch (e) {
      mic.classList.remove("on");
      const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
      fill(result, h("p", { class: "speak-msg" }, denied ? "L'accès au micro est refusé. Autorise-le quand l'iPhone le demande (ou dans Réglages › Safari › Micro), puis réessaie." : `Le micro n'a pas pu démarrer (${e?.message || e}).`));
    }
    micLabel.textContent = "Touche pour réessayer";
    busy = false;
  });

  const playMine = () => {
    if (!lastUrl) return;
    C.audio.stop();
    new Audio(lastUrl).play().catch(() => {});
  };
  const compareBtns = () =>
    h("div", { class: "speak-compare" },
      h("button", { class: "btn secondary", type: "button", onclick: playMine }, icon("play"), " Ma voix"),
      h("button", { class: "btn secondary", type: "button", onclick: () => listen() }, icon("speaker"), " Le modèle")
    );

  function selfCheck() {
    fill(
      result,
      h("p", { class: "speak-msg" }, "Écoute-toi, puis le modèle. Ta prononciation est-elle proche ?"),
      compareBtns(),
      h("div", { class: "actions" },
        h("button", { class: "btn secondary", type: "button", onclick: () => grade(false) }, "À retravailler"),
        h("button", { class: "btn", type: "button", onclick: () => grade(true) }, "Bien prononcé")
      ),
      h("p", { class: "small muted" }, "Pour une correction automatique, ajoute ta clé Groq gratuite dans les Réglages.")
    );
    const grade = (ok) => {
      fill(result, h("p", { class: `speak-verdict ${ok ? "ok" : "ko"}` }, ok ? "Noté : bien prononcé." : "Noté : à retravailler."), compareBtns());
      onResult({ ok, score: ok ? 1 : 0, self: true });
    };
  }

  async function evaluate(rec) {
    fill(result, h("p", { class: "speak-msg" }, h("span", { class: "spinner" }), " Analyse de ta prononciation…"));
    let tr;
    try {
      tr = await C.ai.transcribe(rec, { prompt: item.kind === "mot" ? "Una palabra en español." : "" });
    } catch (e) {
      fill(result, h("p", { class: "speak-msg" }, e.message), compareBtns());
      return;
    }
    if (!tr.text || tr.noSpeech > 0.7) {
      fill(result, h("p", { class: "speak-msg" }, "Je n'ai pas compris de mot. Réessaie en articulant, sans bruit autour."), compareBtns());
      return;
    }
    const d = diagnose(item.target, tr.text);
    const verdict = d.ok ? "Bien prononcé !" : d.score >= 0.75 ? "Presque !" : "À retravailler";
    const cls = d.ok ? "ok" : d.score >= 0.75 ? "almost" : "ko";
    const cats = Object.keys(d.cats);
    const explain = h("div", { class: "speak-ai" });
    fill(
      result,
      h("p", { class: `speak-verdict ${cls}` }, verdict),
      h("p", { class: "speak-heard" }, h("span", { class: "small muted" }, "J'ai entendu : "), h("span", { lang: "es", class: "es" }, `« ${tr.text} »`)),
      item.kind === "phrase" ? h("p", { class: "speak-words", lang: "es" }, d.words.map((w) => h("span", { class: `sw ${w.ok ? "ok" : "ko"}`, title: w.h ? `entendu : ${w.h}` : "non entendu" }, w.t))) : null,
      cats.length
        ? h("div", { class: "speak-tips" }, cats.map((c) => {
            const t = TIPS[c];
            return h("div", { class: "speak-tip" }, h("p", { html: `<b>${t.label[0].toUpperCase() + t.label.slice(1)}</b> : ${md(t.tip)}` }), t.lesson ? h("a", { class: "small", href: `#/pronunciation/lecon/${t.lesson}` }, `Revoir la leçon : ${lessonTitle(t.lesson)}`) : null);
          }))
        : null,
      explain,
      compareBtns()
    );
    onResult({ ok: d.ok, score: d.score, attempts });
    if (!d.ok) explainWithAI(d, tr.text, explain);
  }

  async function explainWithAI(d, heard, box) {
    fill(box, h("p", { class: "small muted" }, h("span", { class: "spinner" }), " Le professeur IA regarde ton erreur…"));
    const labels = Object.keys(d.cats).map((c) => TIPS[c].label).join(", ");
    const wrong = d.words.filter((w) => !w.ok).map((w) => `« ${w.t} » entendu « ${w.h ?? "rien"} »`).join(" ; ");
    try {
      const text = await C.ai.chat([
        { role: "system", content: "Tu es un professeur de phonétique espagnole qui aide un francophone à prononcer l'espagnol d'Argentine (région de Salta). Réponds en français, en 2 ou 3 phrases courtes, sans titre ni liste, sans markdown. Explique quelle erreur de prononciation a probablement été faite et donne un conseil articulatoire concret (position de la langue, des lèvres, du souffle). Si l'écart vient sans doute de la reconnaissance vocale et non de la prononciation, dis-le simplement. Ne corrige jamais l'orthographe." },
        { role: "user", content: `À dire : « ${item.target} ». La reconnaissance vocale a entendu : « ${heard} ». Mots différents : ${wrong}. Sons concernés selon l'analyse : ${labels}.` },
      ]);
      fill(box, h("div", { class: "speak-ai-box" }, h("p", { class: "note-title" }, "Le professeur IA"), h("p", {}, text.replace(/\*\*/g, ""))));
    } catch (e) {
      fill(box, e.code === "rate" ? h("p", { class: "small muted" }, e.message) : null);
    }
  }

  fill(
    wrap,
    h("p", { class: "item-context" }, item.kind === "mot" ? "Écoute, puis répète le mot :" : "Écoute, puis répète la phrase :"),
    targetView,
    item.fr ? h("p", { class: "small muted" }, item.fr) : null,
    h("div", { class: "speak-listen" },
      h("button", { class: "btn secondary", type: "button", onclick: () => listen() }, icon("speaker"), " Écouter"),
      h("button", { class: "btn ghost", type: "button", onclick: () => listen(0.75) }, "Plus lentement")
    ),
    h("div", { class: "mic-zone" }, mic, micLabel),
    !aiOn ? h("p", { class: "small muted center" }, "Sans clé Groq, tu t'évalues toi-même en comparant ta voix au modèle.") : null,
    result
  );
  return wrap;
}
