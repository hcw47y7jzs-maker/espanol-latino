// Tests du module Práctica.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPracticaEngine, checkTranslation, wordDiff, promptVariant, countWords, plain } from "../modules/practica/engine.js";
import { check } from "../core/exercise.js";
import { parseJSON } from "../core/ai.js";

const D = JSON.parse(readFileSync(new URL("../packs/es-419/practica.json", import.meta.url)));
const E = createPracticaEngine(D);
const LV = ["A1", "A2", "B1", "B2", "C1", "C2"];

test("chaque sous-module dépasse 1 000 exercices", () => {
  const lines = (l) => l.reduce((a, t) => a + t.lines.length, 0);
  const counts = {
    frases: 2 * D.frases.length,
    textos: 2 * lines(D.lecturas) + 2 * D.lecturas.length + 2 * lines(D.escuchas),
    lectura: D.lecturas.reduce((a, t) => a + E.questions(t).length + E.lecturaItems(t).length, 0),
    escucha: D.escuchas.reduce((a, t) => a + E.questions(t).length + E.escuchaItems(t).length, 0),
    escritura: D.escritura.prompts.reduce((a, p) => a + p.combos * (1 + D.escritura.defis[p.lvl].length), 0),
  };
  console.log("exercices Práctica :", JSON.stringify(counts));
  for (const [k, v] of Object.entries(counts)) assert.ok(v >= 1000, `${k} : ${v}`);
});

test("tous les niveaux sont couverts dans chaque sous-module", () => {
  for (const l of LV) {
    assert.ok(D.frases.some((f) => f.lvl === l), `frases ${l}`);
    assert.ok(D.lecturas.filter((t) => t.lvl === l).length >= 7, `lecturas ${l}`);
    assert.ok(D.escuchas.filter((t) => t.lvl === l).length >= 7, `escuchas ${l}`);
    assert.ok(D.escritura.prompts.filter((p) => p.lvl === l).length >= 20, `escritura ${l}`);
  }
});

test("questions, vocabulaire, sens, suite, dictée : réponses cohérentes", () => {
  for (const t of [...D.lecturas, ...D.escuchas]) {
    const items = [...E.questions(t), ...(t.speakers ? E.escuchaItems(t) : E.lecturaItems(t))];
    for (const it of items) {
      if (it.t === "Q") {
        assert.ok(it.c >= 0 && it.c < it.o.length, `${it.id}`);
        assert.equal(new Set(it.o).size, it.o.length, `${it.id} : choix en double`);
        assert.ok(check(it, String(it.c)).ok);
      } else {
        assert.ok(check(it, it.a[0]).ok, it.id);
      }
    }
  }
});

test("dialogues : la seconde voix est marquée [b]", () => {
  const t = D.escuchas.find((x) => x.lines.some((l) => l.sp === "B"));
  const ln = t.lines.find((l) => l.sp === "B");
  assert.ok(E.voiced(t, ln).startsWith("[b] "));
});

test("vérification locale des traductions", () => {
  assert.equal(checkTranslation("¿Cómo te llamás?", ["¿Cómo te llamás?"], "es").ok, true);
  assert.equal(checkTranslation("como te llamas", ["¿Cómo te llamás?"], "es").accentOnly, true);
  assert.equal(checkTranslation("Je m'appelle Mateo", ["Je m'appelle Mateo."], "fr").ok, true);
  assert.equal(checkTranslation("Je suis Mateo", ["Je m'appelle Mateo."], "fr").ok, null);
  assert.equal(plain("— Hola, ¿qué tal?"), "hola qué tal");
});

test("différence mot à mot", () => {
  const d = wordDiff("Yo soy cansado hoy", "Yo estoy cansado hoy");
  assert.match(d, /<del>soy<\/del>/);
  assert.match(d, /<ins>estoy<\/ins>/);
  assert.ok(!d.includes("<del>Yo"));
});

test("sujets d'écriture : variantes toutes différentes, sans accolades", () => {
  for (const p of D.escritura.prompts) {
    const seen = new Set();
    for (let v = 0; v < p.combos; v++) {
      const s = promptVariant(p.text, v);
      assert.ok(!/[{}|]/.test(s), s);
      seen.add(s);
    }
    assert.equal(seen.size, p.combos, p.id);
  }
  assert.equal(countWords("Hola, ¿cómo andás? Todo bien."), 5);
});

test("série de phrases : 10 phrases distinctes, références présentes", () => {
  const s = E.buildFrases({ lvl: "B1", n: 10 });
  assert.equal(s.length, 10);
  assert.equal(new Set(s.map((x) => x.id.split(":").slice(0, -1).join(":"))).size, 10);
  for (const it of s) assert.ok(it.refs.length && it.source);
});

test("lecture de la réponse JSON de l'IA", () => {
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSON('Voici : {"a":2} fin'), { a: 2 });
});
