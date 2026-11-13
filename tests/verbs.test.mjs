// Tests du moteur Verbes : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createVerbEngine } from "../modules/verbs/engine.js";
import * as lang from "../packs/es-419/lang.js";

const pack = JSON.parse(readFileSync(new URL("../packs/es-419/pack.json", import.meta.url)));
const data = JSON.parse(readFileSync(new URL("../packs/es-419/verbs.json", import.meta.url)));
const E = createVerbEngine({ pack, data, lang });
const item = (inf, tense, i) => ({ verb: E.byInf[inf], tense, i });

test("formes correctes acceptées, pronom et majuscules tolérés", () => {
  assert.equal(E.check(item("tener", "presente", 2), "tenés").ok, true);
  assert.equal(E.check(item("tener", "presente", 2), "Vos tenés").ok, true);
  assert.equal(E.check(item("ir", "imperativo", 4), "vayamos").ok, true);
  assert.equal(E.check(item("ir", "imperativo", 4), "vamos").ok, true);
});

test("accent oublié", () => {
  const r = E.check(item("hablar", "preterito", 3), "hablo");
  assert.equal(r.ok, false);
  assert.equal(r.kind, "accent");
});

test("diphtongue fautive avec vos", () => {
  assert.equal(E.check(item("poder", "presente", 2), "puedés").kind, "radical");
  assert.equal(E.check(item("dormir", "presente", 4), "duermimos").kind, "radical");
});

test("forme de tú donnée pour vos", () => {
  assert.equal(E.check(item("tener", "presente", 2), "tienes").kind, "tu-vos");
});

test("mauvaise personne / mauvais temps / régularisation", () => {
  assert.equal(E.check(item("tener", "preterito", 0), "tuvo").kind, "personne");
  assert.equal(E.check(item("hablar", "imperfecto", 0), "hablé").kind, "temps");
  assert.equal(E.check(item("tener", "preterito", 0), "tení").kind, "irregulier");
  assert.equal(E.check(item("tener", "futuro", 0), "teneré").kind, "irregulier");
});

test("formes régulières générées = données Anki pour les verbes réguliers", () => {
  let n = 0;
  for (const v of E.verbs.filter((v) => v.reg)) {
    for (const t of ["presente", "preterito", "imperfecto", "futuro", "condicional", "imperativo"]) {
      v.t[t]?.forEach((f, i) => {
        if (!f) return;
        assert.equal(lang.regularForm(v.inf, t, i), f, `${v.inf} ${t} ${i}`);
        n++;
      });
    }
  }
  assert.ok(n > 5000);
});

test("tú et vos identiques fusionnés hors présent / impératif", () => {
  const s = E.slots(E.byInf.tener, "preterito", { tu: true, vos: true });
  assert.equal(s.length, 5);
  assert.equal(s[1].label, "tú / vos");
  assert.equal(E.slots(E.byInf.tener, "presente", { tu: true, vos: true }).length, 6);
  assert.equal(E.slots(E.byInf.tener, "presente", { tu: false, vos: true }).length, 5);
  assert.equal(E.slots(E.byInf.tener, "preterito", { tu: false, vos: true })[1].label, "vos");
  assert.equal(E.slots(E.byInf.llover, "presente", { tu: true, vos: true }).length, 1);
});

test("test : 10 verbes différents pris parmi les révisés", () => {
  const reviewed = {};
  for (const v of E.verbs.slice(0, 30)) reviewed[`${v.inf}|preterito`] = 1, reviewed[`${v.inf}|presente`] = 1;
  const items = E.buildTest({ reviewed, prefs: { tu: true, vos: true } });
  assert.equal(items.length, 10);
  assert.equal(new Set(items.map((x) => x.verb.inf)).size, 10);
  for (const it of items) assert.ok(reviewed[`${it.verb.inf}|${it.tense}`]);
});

test("test avec peu de couples révisés : 10 questions quand même", () => {
  const items = E.buildTest({ reviewed: { "tener|presente": 1, "ser|preterito": 1 }, prefs: { tu: true, vos: true } });
  assert.equal(items.length, 10);
});

test("QCM : une seule bonne réponse, aucune option ambiguë", () => {
  for (const v of E.verbs.slice(0, 80)) {
    for (const t of E.tenses) {
      if (!v.t[t.id]) continue;
      const slots = E.slots(v, t.id);
      for (const s of slots) {
        const opts = E.qcmOptions(v, t.id, s.i);
        assert.equal(opts.filter((o) => o.ok).length, 1);
        const shown = v.t[t.id][s.i].split("|");
        for (const o of opts.filter((o) => !o.ok)) {
          const f = v.t[o.tense][o.i].split("|");
          assert.ok(!f.some((x) => shown.includes(x)), `${v.inf} ${t.id} ${s.i} vs ${o.tense} ${o.i}`);
        }
      }
    }
  }
});

test("nombre d'exercices distincts (≥ 1000)", () => {
  let n = 0;
  for (const v of E.verbs) for (const t of E.tenses) n += E.slots(v, t.id).length;
  assert.ok(n >= 1000, String(n));
  console.log("formes à conjuguer :", n);
});

test("session mixte complète", () => {
  const pairs = E.pairsForScope({ scope: "level", level: "A1" });
  const items = E.buildSession({ pairs, type: "mix", count: 30, prefs: { tu: true, vos: true } });
  assert.equal(items.length, 30);
  for (const it of items) if (it.type === "phrase") assert.ok(it.before && it.after);
});
