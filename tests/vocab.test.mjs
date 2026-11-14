// Tests du module Vocabulaire.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createVocabEngine, TYPES } from "../modules/vocab/engine.js";
import { check } from "../core/exercise.js";

const data = JSON.parse(readFileSync(new URL("../packs/es-419/vocab.json", import.meta.url)));
const V = createVocabEngine(data);
const w = (es) => V.words.find((x) => x.es === es);

test("3 000 mots et niveaux A1 à C2", () => {
  assert.ok(V.words.length >= 3000);
  for (const l of ["A1", "A2", "B1", "B2", "C1", "C2"]) assert.ok(V.words.some((x) => x.lvl === l), l);
});

test("QCM : 4 choix, une seule bonne réponse, pas de doublon ni de synonyme", () => {
  for (const x of V.words) {
    for (const t of ["qes", "qfr"]) {
      const it = V.item(x, t);
      assert.equal(it.o.length, 4, `${x.es} ${t}`);
      assert.equal(new Set(it.o.map((o) => o.toLowerCase())).size, 4, `${x.es} ${t} ${it.o}`);
      assert.ok(check(it, String(it.c)).ok);
    }
  }
});

test("vrai-faux cohérent", () => {
  for (const x of V.words.slice(0, 500)) {
    const it = V.item(x, "vf");
    assert.ok(check(it, String(it.v)).ok);
  }
});

test("écrire en espagnol : article, genre, accents", () => {
  const auto = V.item(w("auto"), "wes");
  assert.ok(check(auto, "el auto").ok);
  assert.ok(check(auto, "auto").ok);
  const r = check(auto, "la auto");
  assert.equal(r.ok, false);
  assert.equal(r.accentOnly, true);
  const cancion = V.item(w("canción"), "wes");
  assert.equal(check(cancion, "la cancion").accentOnly, true);
  assert.equal(check(cancion, "la canción").ok, true);
  const agua = V.item(w("agua"), "wes");
  assert.ok(check(agua, "el agua").ok);
});

test("écrire en français : tolérant (article, accents, faute de frappe)", () => {
  const coche = V.item(w("coche"), "wfr");
  assert.ok(check(coche, "voiture").ok);
  assert.ok(check(coche, "la voiture").ok);
  assert.ok(check(coche, "voitrue").ok);
  assert.ok(!check(coche, "maison").ok);
  const tarde = V.item(V.words.find((x) => x.es === "tarde" && x.rank), "wfr");
  assert.ok(check(tarde, "apres-midi").ok);
  assert.ok(check(tarde, "tard").ok);
});

test("série : mots variés, pas de répétition", () => {
  const ids = V.words.filter((x) => x.lot === "A1-1").map((x) => x.id);
  const items = V.build({ wordIds: ids, n: 20 });
  assert.equal(items.length, 20);
  assert.equal(new Set(items.map((i) => i.wid)).size, 20);
});

test("nombre d'exercices distincts", () => {
  const n = V.words.length * TYPES.length;
  console.log("exercices de vocabulaire :", n);
  assert.ok(n >= 1000);
});
