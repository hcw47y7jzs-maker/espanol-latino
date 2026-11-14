// Tests du module Prononciation : diagnostic et données.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diagnose, key } from "../modules/pron/diagnose.js";

const cats = (t, h) => Object.keys(diagnose(t, h).cats).sort().join(",");

test("homophones de l'espagnol d'Amérique : pas de faute", () => {
  for (const [t, h] of [["vaca", "baca"], ["casa", "caza"], ["calle", "caye"], ["hola", "ola"], ["cien", "sien"], ["tuvo", "tubo"], ["Hola, ¿qué tal?", "hola que tal"], ["tres perros", "3 perros"]])
    assert.ok(diagnose(t, h).ok, `${t} / ${h}`);
});

test("sons confondus : la bonne leçon", () => {
  assert.equal(cats("perro", "pero"), "rr");
  assert.equal(cats("pero", "perro"), "r");
  assert.equal(cats("mesa", "misa"), "voyelle");
  assert.equal(cats("año", "ano"), "enie");
  assert.equal(cats("hijo", "higo"), "jota");
  assert.equal(cats("papá", "papa"), "accent");
  assert.equal(cats("beso", "peso"), "sonore");
  assert.equal(cats("mucho", "musho"), "che");
});

test("phrase : un mot mal prononcé sur cinq", () => {
  const d = diagnose("El perro de Rosa corre", "el pero de rosa corre");
  assert.equal(d.ok, false);
  assert.equal(d.words.filter((w) => !w.ok).length, 1);
  assert.equal(d.words[1].cats[0], "rr");
  assert.ok(d.score > 0.7);
});

test("rien entendu", () => {
  assert.ok(diagnose("perro", "").empty);
});

test("clé phonétique", () => {
  assert.equal(key("guitarra"), "gitaRa");
  assert.equal(key("gente"), "xente");
  assert.equal(key("queso"), "keso");
  assert.equal(key("rojo"), "Roxo");
});

const P = JSON.parse(readFileSync(new URL("../packs/es-419/pron.json", import.meta.url)));
test("données : 15 leçons A1–C2, plus de 3 000 mots, des paires", () => {
  assert.ok(P.lessons.length >= 15);
  for (const l of ["A1", "A2", "B1", "B2", "C1", "C2"]) assert.ok(P.lessons.some((x) => x.level === l), l);
  assert.ok(P.words.length >= 3000);
  assert.ok(P.lessons.reduce((a, l) => a + l.pairs.length + l.same.length, 0) >= 40);
});

import { createPronEngine, TYPES, ruleText } from "../modules/pron/engine.js";
import { check } from "../core/exercise.js";
const E = createPronEngine(P);

test("plus de 1 000 exercices, tous les types présents", () => {
  const n = E.count({ scope: "lessons", lessonIds: E.lessons.map((l) => l.id) });
  const total = Object.values(n).reduce((a, b) => a + b, 0);
  console.log("exercices de prononciation :", JSON.stringify(n), total);
  for (const t of TYPES) assert.ok(n[t] > 20, t);
  assert.ok(total >= 1000);
});

test("chaque leçon produit une série, réponses cohérentes", () => {
  for (const l of E.lessons) {
    const s = E.build({ lessonIds: [l.id], types: TYPES, n: 30 });
    assert.ok(s.length >= 10, l.id);
    for (const it of s) {
      if (it.t === "Q") {
        assert.ok(it.c >= 0 && it.c < it.o.length, `${l.id} ${it.id}`);
        assert.equal(new Set(it.o).size, it.o.length, `${it.id} ${it.o}`);
        assert.ok(check(it, String(it.c)).ok);
      }
      if (it.t === "W") assert.ok(check(it, it.full).ok, it.id);
    }
  }
});

test("dictée : les homophones sont acceptés", () => {
  const it = E.build({ lessonIds: ["s-z-c"], types: ["dictee"], n: 500 }).find((x) => x.full === "casa" || x.full === "caza");
  if (it) assert.ok(check(it, "casa").ok && check(it, "caza").ok);
});

test("règle d'accent expliquée", () => {
  assert.match(ruleText(E.byW["camión"]), /obligatoire/);
  assert.match(ruleText(E.byW["casa"]), /pas d'accent écrit/);
  assert.match(ruleText(E.byW["música"]), /toujours/);
});
