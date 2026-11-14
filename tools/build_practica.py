"""Construit packs/es-419/practica.json à partir de packs/es-419/practica_src/.

- frases-*.txt     : point | français | espagnol (variantes après « || »)
- lecturas-*.txt   : textes à lire et à traduire (## en-tête, > phrase | traduction, ? questions)
- escuchas-*.txt   : dialogues à écouter (> A: réplique | traduction), voix A = Daniela, B = voix grave
- escritura.txt    : sujets d'expression écrite et défis
Usage : python3 tools/build_practica.py
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "packs" / "es-419"
SRC = PACK / "practica_src"
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
errors = []


def fail(where, msg):
    errors.append(f"{where} : {msg}")


grammar = json.loads((PACK / "grammar" / "grammar.json").read_text(encoding="utf-8"))["points"]
gids = {p["id"]: p for p in grammar}

# ---------------------------------------------------------------- phrases
frases = []
for path in sorted(SRC.glob("frases-*.txt")):
    count = {}
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        f = [x.strip() for x in line.split(" | ")]
        where = f"{path.name}:{n}"
        if len(f) != 3:
            fail(where, f"{len(f)} champs"); continue
        point, fr, es = f
        if point not in gids:
            fail(where, f"point inconnu {point}"); continue
        count[point] = count.get(point, 0) + 1
        frases.append({"id": f"{point}:{count[point]}", "point": point, "lvl": gids[point]["level"], "fr": fr, "es": [x.strip() for x in es.split(" || ")]})

# Phrases d'exemple des expressions : elles servent aussi à la traduction.
expr = json.loads((PACK / "expressions.json").read_text(encoding="utf-8"))["items"]
for e in expr:
    frases.append({"id": f"expr:{e['id']}", "point": None, "lvl": e["lvl"], "fr": e["exFr"], "es": [e["ex"]], "expr": e["main"]})


# ---------------------------------------------------------------- textes (lectures et écoutes)
def parse_texts(pattern, dialog):
    out = []
    for path in sorted(SRC.glob(pattern)):
        cur = None
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            where = f"{path.name}:{n}"
            if not line.strip() or (line.startswith("#") and not line.startswith("##")):
                continue
            if line.startswith("## "):
                f = [x.strip() for x in line[3:].split(" | ")]
                if len(f) < 4:
                    fail(where, "en-tête incomplet"); continue
                cur = {"id": f[0], "lvl": f[0][:2].upper(), "es": f[1], "fr": f[2], "kind": f[3], "lines": [], "q": []}
                if dialog:
                    sp = {}
                    for part in (f[4] if len(f) > 4 else "").split(","):
                        if "=" in part:
                            k, v = part.split("=", 1)
                            sp[k.strip()] = v.strip()
                    cur["speakers"] = sp
                if cur["lvl"] not in LEVELS:
                    fail(where, f"niveau {cur['lvl']}")
                out.append(cur)
                continue
            if cur is None:
                fail(where, "ligne hors texte"); continue
            if line.startswith("> "):
                body = line[2:]
                sp = None
                if dialog:
                    m = re.match(r"^([AB]):\s*(.*)$", body)
                    if not m:
                        fail(where, "réplique sans A: ni B:"); continue
                    sp, body = m.groups()
                parts = [x.strip() for x in body.split(" | ")]
                if len(parts) != 2:
                    fail(where, "réplique sans traduction"); continue
                ln = {"es": parts[0], "fr": parts[1]}
                if sp:
                    ln["sp"] = sp
                cur["lines"].append(ln)
            elif line.startswith("?v "):
                stmt, _, ans = line[3:].rpartition(" | ")
                if ans not in ("V", "F"):
                    fail(where, "vrai/faux sans V ou F"); continue
                cur["q"].append({"q": stmt.strip(), "o": ["Vrai", "Faux"] if cur["lvl"] in ("A1", "A2") else ["Verdadero", "Falso"], "c": 0 if ans == "V" else 1, "vf": True})
            elif line.startswith("? "):
                f = [x.strip() for x in line[2:].split(" | ")]
                if len(f) < 3:
                    fail(where, "question avec moins de deux choix"); continue
                if len(set(f[1:])) != len(f[1:]):
                    fail(where, "choix en double")
                cur["q"].append({"q": f[0], "o": f[1:], "c": 0})
            else:
                fail(where, f"ligne non reconnue : {line[:40]}")
    for t in out:
        if len(t["lines"]) < 4:
            fail(t["id"], "texte trop court")
        if len(t["q"]) < 4:
            fail(t["id"], "moins de 4 questions")
    ids = [t["id"] for t in out]
    if len(ids) != len(set(ids)):
        fail(pattern, "identifiants en double")
    return out


lecturas = parse_texts("lecturas-*.txt", False)
escuchas = parse_texts("escuchas-*.txt", True)
for t in escuchas:
    for ln in t["lines"]:
        if ln["sp"] not in t["speakers"]:
            fail(t["id"], f"locuteur {ln['sp']} non déclaré")

# Vocabulaire en contexte : mots du texte présents dans la banque de vocabulaire.
vocab = json.loads((PACK / "vocab.json").read_text(encoding="utf-8"))["words"]
vmap = {}
for w in vocab:
    if re.fullmatch(r"[a-záéíóúñü]+", w["es"]) and (w.get("rank") or 9999) > 120:  # on évite les mots-outils
        vmap.setdefault(w["es"], w)
for t in lecturas:
    seen, picks = set(), []
    for i, ln in enumerate(t["lines"]):
        for tok in re.findall(r"[a-záéíóúñü]+", ln["es"].lower()):
            w = vmap.get(tok)
            if w and tok not in seen and len(tok) > 3:
                seen.add(tok)
                picks.append({"w": tok, "fr": w["fr"], "line": i, "rank": w.get("rank") or 9999})
    picks.sort(key=lambda p: -p["rank"])  # les moins fréquents d'abord : plus utiles
    t["vocab"] = picks[:10]

# ---------------------------------------------------------------- écriture
prompts, defis = [], {l: [] for l in LEVELS}
for n, line in enumerate((SRC / "escritura.txt").read_text(encoding="utf-8").splitlines(), 1):
    where = f"escritura.txt:{n}"
    if not line.strip() or line.startswith("#"):
        continue
    if line.startswith("@défi "):
        lvl, _, txt = line[6:].partition(" | ")
        defis[lvl.strip()].append(txt.strip())
        continue
    f = [x.strip() for x in line.split(" | ")]
    if len(f) == 4:
        f.append("")
    if len(f) != 5:
        fail(where, f"{len(f)} champs"); continue
    lvl, text, rng, genre, pts = f
    m = re.fullmatch(r"(\d+)-(\d+)", rng)
    if lvl not in LEVELS or not m:
        fail(where, "niveau ou nombre de mots"); continue
    points = [p for p in pts.split(",") if p]
    for p in points:
        if p not in gids:
            fail(where, f"point inconnu {p}")
    slots = [g.split("|") for g in re.findall(r"\{([^}]*)\}", text)]
    combos = 1
    for s in slots:
        combos *= len(s)
    prompts.append({"id": f"{lvl.lower()}-{len([p for p in prompts if p['lvl'] == lvl]) + 1}", "lvl": lvl, "text": text, "min": int(m[1]), "max": int(m[2]), "genre": genre, "points": points, "combos": combos})

if errors:
    print("\n".join(errors)); sys.exit(1)

data = {
    "grammar": [{"id": p["id"], "lvl": p["level"], "fr": p["fr"]} for p in grammar],
    "frases": frases,
    "lecturas": lecturas,
    "escuchas": escuchas,
    "escritura": {"prompts": prompts, "defis": defis},
}
(PACK / "practica.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

# ---------------------------------------------------------------- bilan
nl = sum(len(t["lines"]) for t in lecturas)
ne = sum(len(t["lines"]) for t in escuchas)
counts = {
    "Phrases (2 sens)": 2 * len(frases),
    "Textes (phrases 2 sens + textes entiers 2 sens)": 2 * nl + 2 * len(lecturas) + 2 * ne,
    "Lecture (questions + vocabulaire + sens des phrases + titre)": sum(len(t["q"]) + len(t["vocab"]) + len(t["lines"]) + 1 for t in lecturas),
    "Écoute (questions + dictées + sens + suite logique + thème)": sum(len(t["q"]) + 3 * len(t["lines"]) for t in escuchas),
    "Écriture (sujets × défis)": sum(p["combos"] * (1 + len(defis[p["lvl"]])) for p in prompts),
}
print(f"{len(frases)} phrases, {len(lecturas)} lectures ({nl} phrases), {len(escuchas)} écoutes ({ne} répliques), {len(prompts)} sujets d'écriture")
for k, v in counts.items():
    print(f"  {k} : {v}")
