// Tests du module Grammaire : contenu cohérent et correction des réponses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check } from "../core/exercise.js";

const g = JSON.parse(readFileSync(new URL("../packs/es-419/grammar/grammar.json", import.meta.url)));
const all = Object.values(g.ex).flat();

test("chaque point a une leçon et assez d'exercices", () => {
  for (const p of g.points) {
    assert.ok(readFileSync(new URL(`../packs/es-419/${p.lesson}`, import.meta.url), "utf8").length > 400, p.id);
    assert.ok(g.ex[p.id].length >= 12, `${p.id} : ${g.ex[p.id].length}`);
  }
});

test("exercices bien formés", () => {
  const ids = new Set();
  for (const it of all) {
    assert.ok(!ids.has(it.id), `doublon ${it.id}`);
    ids.add(it.id);
    if (it.t === "T") {
      assert.equal(it.q.split("___").length, 2, it.id);
      assert.ok(it.a.length && it.a.every((a) => a.trim()), it.id);
      assert.ok(!it.full.includes("___"), it.id);
    }
    if (it.t === "Q") {
      assert.ok(it.c >= 0 && it.c < it.o.length && it.o.length >= 2, it.id);
      assert.equal(new Set(it.o).size, it.o.length, `options en double ${it.id}`);
    }
    if (it.t === "O") assert.ok(it.a[0].split(" ").length >= 2, it.id);
    if (it.t === "V") assert.equal(typeof it.v, "boolean", it.id);
  }
});

test("la bonne réponse est acceptée, une mauvaise refusée", () => {
  for (const it of all) {
    if (it.t === "T") {
      assert.ok(check(it, it.a[0]).ok, it.id);
      assert.ok(!check(it, "zzz").ok, it.id);
    }
    if (it.t === "Q") {
      assert.ok(check(it, String(it.c)).ok, it.id);
      assert.ok(!check(it, String((it.c + 1) % it.o.length)).ok, it.id);
    }
    if (it.t === "O") assert.ok(check(it, it.a[0].toLowerCase().replace(/[.?!¿¡]/g, "")).ok, it.id);
    if (it.t === "V") assert.ok(check(it, String(it.v)).ok, it.id);
  }
});

test("accent oublié signalé comme « presque »", () => {
  const it = { t: "T", q: "Un examen, dos ___.", a: ["exámenes"], why: "" };
  const r = check(it, "examenes");
  assert.equal(r.ok, false);
  assert.equal(r.accentOnly, true);
});

test("nombre total d'exercices", () => {
  console.log("exercices de grammaire :", all.length);
  assert.ok(all.length > 300);
});
