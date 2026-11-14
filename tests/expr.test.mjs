// Tests du module Expressions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExprEngine, TYPES } from "../modules/expr/engine.js";
import { check } from "../core/exercise.js";

const data = JSON.parse(readFileSync(new URL("../packs/es-419/expressions.json", import.meta.url)));
const E = createExprEngine(data);
const find = (main) => E.items.find((x) => x.main === main);

test("contenu : 400 expressions et plus, A1 à C2, deux moitiés, le Nord-Ouest bien représenté", () => {
  assert.ok(E.items.length >= 400, String(E.items.length));
  for (const l of ["A1", "A2", "B1", "B2", "C1", "C2"]) assert.ok(E.items.some((x) => x.lvl === l), l);
  const half = (h) => E.items.filter((x) => E.groupOf[x.group].half === h).length;
  assert.ok(half("latam") >= 180 && half("ar") >= 180);
  assert.ok(E.items.filter((x) => x.reg === "noa").length >= 80);
});

test("plus de 1 000 exercices différents", () => {
  let n = 0;
  for (const e of E.items) for (const t of TYPES) if (!(t === "wes" && e.noWrite)) n++;
  console.log(`exercices d'expressions : ${n}`);
  assert.ok(n >= 1000);
});

test("QCM et phrases à trou : 4 choix distincts, la bonne réponse est acceptée", () => {
  for (const e of E.items) {
    for (const t of ["qes", "qfr", "trou"]) {
      const it = E.item(e, t);
      assert.equal(it.o.length, 4, `${e.main} ${t}`);
      assert.equal(new Set(it.o.map((o) => o.toLowerCase())).size, 4, `${e.main} ${t} ${it.o}`);
      assert.ok(check(it, String(it.c)).ok);
      if (t === "trou") {
        assert.ok(it.q.includes("___"));
        // Ni majuscule ni ¡¿ en tête qui trahiraient la bonne réponse.
        for (const o of it.o) assert.ok(!/^[¡¿]/.test(o) && (o[0] === o[0].toLowerCase() || /^(Salta|Chato|Güemes)/.test(o)), `${e.main} : ${o}`);
      }
    }
    const v = E.item(e, "vf");
    assert.ok(check(v, String(v.v)).ok);
  }
});

test("traduire en espagnol : toutes les formes acceptées, ponctuation libre, accents exigés", () => {
  for (const e of E.items) {
    const it = E.item(e, "wes");
    for (const a of e.esAll) assert.ok(check(it, a).ok, `${e.main} : ${a}`);
    assert.ok(check(it, e.main.replace(/[¡!¿?,.]/g, "")).ok, e.main);
  }
  const r = check(E.item(find("¿Cómo andás?"), "wes"), "como andas");
  assert.equal(r.ok, false);
  assert.ok(r.accentOnly);
  assert.ok(check(E.item(find("La cuenta, por favor"), "wes"), "la cuenta por favor").ok);
  assert.ok(check(E.item(find("El cerro"), "wes"), "cerro").ok);
});

test("traduire en français : réponses acceptées, fautes de frappe légères tolérées", () => {
  for (const e of E.items) {
    const it = E.item(e, "wfr");
    for (const a of e.frAll) assert.ok(check(it, a).ok, `${e.main} : ${a}`);
  }
  assert.ok(check(E.item(find("Meter la pata"), "wfr"), "faire une gafe").ok);
  assert.ok(check(E.item(find("Más vale tarde que nunca"), "wfr"), "mieux vaut tard que jamias").ok);
  assert.equal(check(E.item(find("Meter la pata"), "wfr"), "avoir peur").ok, false);
});

test("test : 20 questions, 4 phrases à traduire, expressions toutes différentes", () => {
  const ids = E.items.slice(0, 60).map((x) => x.id);
  const t = E.buildTest({ ids });
  assert.equal(t.length, 20);
  assert.equal(t.filter((x) => x.t === "S").length, 4);
  assert.equal(new Set(t.map((x) => x.eid)).size, 20);
});

test("série sur un petit groupe : pas plus de questions que d'expressions × types", () => {
  const g = E.groupOf["noa-gramatica"];
  const s = E.build({ ids: g.ids, n: 20 });
  assert.ok(s.length > 0 && s.length <= 20);
});
