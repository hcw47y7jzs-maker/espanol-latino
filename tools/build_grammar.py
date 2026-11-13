"""Compile le module Grammaire : packs/<pack>/grammar/src/*.md -> lessons/grammar/*.md + grammar/grammar.json

Chaque fichier source contient :
---
id: a1-articulos
level: A1
es: Los artículos
fr: Les articles
---
(leçon en Markdown)
=== exercices
T | Phrase avec ___ (indice). | réponse / autre réponse | explication | consigne (facultatif)
Q | Phrase avec ___. | bonne* / mauvaise / mauvaise | explication | consigne (facultatif)
O | Phrase à remettre dans l'ordre. // autre ordre accepté | traduction | explication
V | Affirmation à juger. | V ou F | explication
G | Quiero que {S} ___ ({inf}) temprano. | llegar, volver | tu, vos, el, nos, uds | subj_presente | explication

Les lignes G produisent un exercice T par verbe et par personne, avec les formes de verbs.json.
Usage : python3 tools/build_grammar.py
"""
import json, pathlib, re, sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "packs" / "es-419"
SRC = PACK / "grammar" / "src"
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
P = ["yo", "tu", "vos", "el", "nos", "uds"]
SUBJECTS = {"yo": ["yo"], "tu": ["tú"], "vos": ["vos"], "el": ["él", "ella", "usted"], "nos": ["nosotros", "nosotras"], "uds": ["ustedes", "ellos", "ellas"]}

verbs = {v["inf"]: v for v in json.loads((PACK / "verbs.json").read_text(encoding="utf-8"))["verbs"]}
errors: list[str] = []


def inline(s: str) -> str:
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    return re.sub(r"\*([^*]+)\*", r'<i lang="es">\1</i>', s)


def full_sentence(q: str, answer: str) -> str:
    if answer.startswith("—"):  # « — (rien) » : on retire simplement le trou
        answer = ""
    s = re.sub(r"___\s*\([^)]*\)", answer, q, count=1)
    s = s.replace("___", answer, 1)
    s = re.sub(r"\s+([,.?!])", r"\1", re.sub(r"\s{2,}", " ", s)).strip()
    return s[0].upper() + s[1:] if s and s[0].islower() and q.startswith("___") else s


ACCENT = {"a": "á", "e": "é", "i": "í", "o": "ó", "u": "ú"}


def vos_subjunctive(tu_form: str, nos_form: str) -> str | None:
    """« cantes » -> « cantés » (forme voseante, quand le radical ne change pas)."""
    m = re.match(r"^(.*)([ae])s$", tu_form)
    n = re.match(r"^(.*)([ae])mos$", nos_form or "")
    if not m or not n or m.group(1) != n.group(1):
        return None
    return m.group(1) + ACCENT[m.group(2)] + "s"


def expand_g(pid: str, ln: int, fields: list[str]) -> list[dict]:
    if len(fields) < 5:
        errors.append(f"{pid}:{ln} ligne G incomplète")
        return []
    tpl, vlist, plist, tense, why = fields[0], fields[1], fields[2], fields[3], fields[4] if len(fields) > 4 else ""
    out = []
    k = 0
    for inf in [x.strip() for x in vlist.split(",")]:
        v = verbs.get(inf)
        if not v or tense not in v["t"]:
            errors.append(f"{pid}:{ln} verbe ou temps inconnu : {inf} {tense}")
            continue
        for p in [x.strip() for x in plist.split(",")]:
            i = P.index(p)
            form = v["t"][tense][i]
            if not form:
                continue
            answers = form.split("|")
            if p == "vos" and tense == "subj_presente":
                alt = vos_subjunctive(v["t"][tense][1], v["t"][tense][4])
                if alt and alt not in answers:
                    answers.append(alt)
            subj = SUBJECTS[p][k % len(SUBJECTS[p])]
            k += 1
            q = tpl.replace("{S}", subj).replace("{inf}", inf)
            q = q[0].upper() + q[1:] if q.startswith(subj) else q
            out.append({
                "id": f"{pid}:g{ln}:{inf}:{p}", "t": "T", "q": q, "a": answers, "why": inline(why),
                "full": full_sentence(q, answers[0]),
            })
    return out


def parse(path: pathlib.Path) -> tuple[dict, str, list[dict]]:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        errors.append(f"{path.name} : en-tête manquant")
        return {}, "", []
    meta = dict(line.split(": ", 1) for line in m.group(1).splitlines() if ": " in line)
    body = m.group(2)
    lesson, _, ex_block = body.partition("\n=== exercices\n")
    pid = meta["id"]
    items: list[dict] = []
    for ln, raw in enumerate(ex_block.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        kind, *fields = [f.strip() for f in line.split(" | ")]
        iid = f"{pid}:{ln}"
        try:
            if kind == "T":
                q, ans, why, *rest = fields + [""] * 2
                if q.count("___") != 1:
                    errors.append(f"{pid}:{ln} il faut exactement un ___ : {q}")
                answers = [a.strip() for a in ans.split(" / ") if a.strip()]
                item = {"id": iid, "t": "T", "q": q, "a": answers, "why": inline(why), "full": full_sentence(q, answers[0])}
                if rest and rest[0]:
                    item["fr"] = rest[0]
                items.append(item)
            elif kind == "Q":
                q, opts, why, *rest = fields + [""] * 2
                options = [o.strip() for o in opts.split(" / ")]
                correct = [k for k, o in enumerate(options) if o.endswith("*")]
                if len(correct) != 1:
                    errors.append(f"{pid}:{ln} il faut exactement une bonne réponse (*) : {opts}")
                    continue
                options = [o.rstrip("*").strip() for o in options]
                item = {"id": iid, "t": "Q", "q": q, "o": options, "c": correct[0], "why": inline(why)}
                if "___" in q:
                    item["full"] = full_sentence(q, options[correct[0]])
                if rest and rest[0]:
                    item["fr"] = rest[0]
                items.append(item)
            elif kind == "O":
                sentences, fr, why = (fields + ["", ""])[:3]
                accepted = [s.strip() for s in sentences.split(" // ")]
                if len(accepted[0].split(" ")) < 2:
                    errors.append(f"{pid}:{ln} phrase trop courte")
                items.append({"id": iid, "t": "O", "a": accepted, "fr": fr, "why": inline(why)})
            elif kind == "V":
                q, val, why = (fields + ["", ""])[:3]
                if val not in ("V", "F"):
                    errors.append(f"{pid}:{ln} V ou F attendu : {val}")
                items.append({"id": iid, "t": "V", "q": inline(q), "v": val == "V", "why": inline(why)})
            elif kind == "G":
                items += expand_g(pid, ln, fields)
            else:
                errors.append(f"{pid}:{ln} type inconnu : {kind}")
        except Exception as e:  # noqa: BLE001
            errors.append(f"{pid}:{ln} {e}")
    return meta, lesson.strip() + "\n", items


points, ex = [], {}
for path in sorted(SRC.glob("*.md")):
    meta, lesson, items = parse(path)
    if not meta:
        continue
    pid = meta["id"]
    if meta.get("level") not in LEVELS:
        errors.append(f"{pid} : niveau inconnu {meta.get('level')}")
    out_lesson = PACK / "lessons" / "grammar" / f"{pid}.md"
    out_lesson.parent.mkdir(parents=True, exist_ok=True)
    out_lesson.write_text(lesson, encoding="utf-8")
    points.append({"id": pid, "level": meta["level"], "order": int(meta.get("order", 0)), "es": meta["es"], "fr": meta["fr"], "lesson": f"lessons/grammar/{pid}.md", "n": len(items)})
    ex[pid] = items

points.sort(key=lambda p: (LEVELS.index(p["level"]), p["order"], p["id"]))
ids = [i["id"] for items in ex.values() for i in items]
dups = [k for k, n in Counter(ids).items() if n > 1]
if dups:
    errors.append(f"identifiants en double : {dups[:5]}")

(PACK / "grammar" / "grammar.json").write_text(json.dumps({"points": points, "ex": ex}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
total = sum(len(v) for v in ex.values())
per_level = Counter()
for p in points:
    per_level[p["level"]] += p["n"]
print(f"{len(points)} points, {total} exercices", dict(per_level))
for p in points:
    if p["n"] < 12:
        print(f"  attention : {p['id']} n'a que {p['n']} exercices")
if errors:
    print("ERREURS :")
    for e in errors:
        print("  -", e)
    sys.exit(1)
