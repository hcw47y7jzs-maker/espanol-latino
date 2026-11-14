"""Construit packs/es-419/expressions.json à partir de packs/es-419/expr_src/*.txt.

Format d'une ligne (voir l'en-tête des fichiers) :
  niveau | région | espagnol (« / » entre variantes) | français (« / » entre réponses acceptées)
        | exemple avec [l'expression entre crochets] | traduction de l'exemple | note (facultative)
Un groupe commence par « ## id | titre | description ». Les fichiers dont le nom contient
« latam » forment la moitié « Amérique latine », les autres la moitié « Argentine et Salta ».
Usage : python3 tools/build_expr.py
"""
import json, pathlib, re, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "packs" / "es-419"
SRC = PACK / "expr_src"
PROPER = {"Salta", "Chato", "Güemes"}
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
REGIONS = {
    "latam": "Toute l'Amérique latine",
    "ar": "Argentine",
    "noa": "Salta et le Nord-Ouest",
    "mx": "Mexique",
    "co": "Colombie",
    "cl": "Chili",
    "pe": "Pérou",
    "ve": "Venezuela",
    "cr": "Costa Rica",
    "car": "Caraïbes",
}
HALVES = [
    {"id": "latam", "title": "Toute l'Amérique latine", "text": "Les expressions comprises de Mexico à Buenos Aires, et quelques spécialités d'autres pays."},
    {"id": "ar", "title": "Argentine et Salta", "text": "L'espagnol d'Argentine, puis le parler de Salta et du Nord-Ouest : mots du quotidien, fêtes, cuisine et héritage quechua."},
]

errors = []


def fail(where, msg):
    errors.append(f"{where} : {msg}")


def slug(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40]


def variants(s):
    return [v.strip() for v in s.split(" / ") if v.strip()]


def plain_key(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9ñ ]+", " ", s).split()


groups, items, seen_ids, seen_es = [], [], set(), {}
for path in sorted(SRC.glob("*.txt")):
    half = "latam" if "latam" in path.name else "ar"
    group = None
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        where = f"{path.name}:{n}"
        if not line or (line.startswith("#") and not line.startswith("##")):
            continue
        if line.startswith("##"):
            gid, title, desc = [x.strip() for x in line[2:].split("|")]
            group = {"id": gid, "title": title, "text": desc, "half": half, "ids": []}
            groups.append(group)
            continue
        if group is None:
            fail(where, "ligne avant le premier groupe")
            continue
        f = [x.strip() for x in line.split("|")]
        if len(f) == 6:
            f.append("")
        if len(f) != 7:
            fail(where, f"{len(f)} champs au lieu de 7")
            continue
        lvl, reg, es, fr, ex, ex_fr, note = f
        if lvl not in LEVELS:
            fail(where, f"niveau inconnu {lvl}")
        if reg not in REGIONS:
            fail(where, f"région inconnue {reg}")
        spans = re.findall(r"\[([^\]]+)\]", ex)
        if len(spans) != 1:
            fail(where, f"l'exemple doit contenir une seule [expression] : {ex}")
            continue
        if not ex_fr:
            fail(where, "traduction de l'exemple manquante")
        es_all, fr_all = variants(es), variants(fr)
        main = es_all[0]
        key = " ".join(plain_key(main))
        if key in seen_es:
            fail(where, f"« {main} » déjà présent ({seen_es[key]})")
        seen_es[key] = where
        iid = slug(main)
        while iid in seen_ids:
            iid += "-2"
        seen_ids.add(iid)
        # Réponses françaises : chaque variante, et sa forme sans parenthèses (« Bonjour (le matin) » -> « Bonjour »).
        accepted = []
        for a in fr_all:
            for b in (a, re.sub(r"\s*\([^)]*\)", "", a).strip()):
                if b and b not in accepted:
                    accepted.append(b)
        # Formes espagnoles acceptées : variantes, sans la précision entre parenthèses.
        es_ok = []
        for a in es_all:
            for b in (a, re.sub(r"\s*\([^)]*\)", "", a).strip()):
                if b and b not in es_ok:
                    es_ok.append(b)
        # Trou : la ponctuation d'ouverture/fermeture reste dans la phrase, et la majuscule de début
        # de phrase ne doit pas trahir la réponse (sauf nom propre).
        m = re.match(r"^([¡¿]?)(.*?)([!?]?)$", spans[0])
        lead, core, tail = m.groups()
        blank = core if core.split()[0] in PROPER else core[:1].lower() + core[1:]
        ex_q = re.sub(r"\[[^\]]+\]", lambda _: f"{lead}___{tail}", ex)
        item = {
            "id": iid,
            "es": es,
            "main": re.sub(r"\s*\([^)]*\)", "", main).strip(),
            "esAll": es_ok,
            "fr": fr_all[0],
            "frText": fr,
            "frAll": accepted,
            "ex": ex.replace("[", "").replace("]", ""),
            "exQ": ex_q,
            "span": core,
            "blank": blank,
            "exFr": ex_fr,
            "lvl": lvl,
            "reg": reg,
            "group": group["id"],
        }
        if note:
            item["note"] = note
        if "…" in es or "+" in es:
            item["noWrite"] = True
        items.append(item)
        group["ids"].append(iid)

for g in groups:
    lv = sorted({it["lvl"] for it in items if it["group"] == g["id"]}, key=LEVELS.index)
    if not lv:
        fail(g["id"], "groupe vide")
        continue
    g["lvl"] = [lv[0], lv[-1]]
    g["n"] = len(g["ids"])

# Les trous d'un même groupe doivent se distinguer (sinon le QCM aurait deux bonnes réponses).
for g in groups:
    spans = {}
    for it in items:
        if it["group"] == g["id"]:
            k = " ".join(plain_key(it["span"]))
            if k in spans:
                fail(g["id"], f"même trou « {it['span']} » que {spans[k]}")
            spans[k] = it["id"]

if errors:
    print("\n".join(errors))
    sys.exit(1)

out = PACK / "expressions.json"
data = {"regions": REGIONS, "halves": HALVES, "groups": groups, "items": items}
out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
by_half = {h["id"]: sum(len(g["ids"]) for g in groups if g["half"] == h["id"]) for h in HALVES}
by_lvl = {l: sum(1 for it in items if it["lvl"] == l) for l in LEVELS}
noa = sum(1 for it in items if it["reg"] == "noa")
print(f"{len(items)} expressions, {len(groups)} groupes -> {out.relative_to(ROOT)}")
print("par moitié :", by_half, "| dont Salta/NOA :", noa)
print("par niveau :", by_lvl)
