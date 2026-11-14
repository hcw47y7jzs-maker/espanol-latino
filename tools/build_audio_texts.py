"""Liste tous les textes que l'app peut lire à voix haute -> packs/<pack>/audio/texts.json.

Le workflow GitHub « Audios » lit ce fichier et enregistre les textes manquants avec la voix Piper.
Usage : python3 tools/build_audio_texts.py [es-419]

La clé d'un texte (speech_key) doit rester identique à celle de core/audio.js.
"""
import json, pathlib, re, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK_ID = sys.argv[1] if len(sys.argv) > 1 else "es-419"
PACK = ROOT / "packs" / PACK_ID


def speech_key(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text).strip().lower())


pack = json.loads((PACK / "pack.json").read_text(encoding="utf-8"))
texts: dict[str, str] = {}


def add(text: str, source: str) -> None:
    text = text.strip()
    if not text or text.startswith("-") or not re.search(r"[a-záéíóúñü]", text, re.I):
        return  # les terminaisons seules (« -ar ») restent lues par la voix de l'appareil
    texts.setdefault(speech_key(text), text)


# ---- Verbes : infinitif, chaque forme seule, et « pronom + forme » des tableaux ----
speech = pack["persons"]["speech"]
order = pack["persons"]["order"]
main_tenses = [t["id"] for t in pack["verbs"]["tenses"]]
verbs = json.loads((PACK / pack["verbs"]["data"]).read_text(encoding="utf-8"))["verbs"]
for v in verbs:
    add(v["inf"], "verbe")
    for t in main_tenses:
        row = v["t"].get(t)
        if not row:
            continue
        for i, form in enumerate(row):
            if not form:
                continue
            first = form.split("|")[0]
            add(first, "forme")
            if t != "imperativo":
                add(f"{speech[order[i]]} {first}", "tableau")

# ---- Leçons : tous les passages en espagnol (*…*) ----
for md in sorted((PACK / "lessons").rglob("*.md")):
    body = md.read_text(encoding="utf-8")
    body = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", body)
    for m in re.finditer(r"\*\*\*([^*]+)\*\*\*|(?<!\*)\*([^*]+)\*(?!\*)", body):
        add(m.group(1) or m.group(2), md.name)

# ---- Grammaire : phrases complètes des exercices ----
gpath = PACK / "grammar" / "grammar.json"
if gpath.exists():
    g = json.loads(gpath.read_text(encoding="utf-8"))
    for items in g["ex"].values():
        for it in items:
            if it.get("full"):
                add(it["full"], "grammaire")
            if it["t"] == "O":
                add(it["a"][0], "grammaire")

# ---- Vocabulaire : chaque mot, avec son article pour les noms ----
vpath = PACK / "vocab.json"
if vpath.exists():
    for wd in json.loads(vpath.read_text(encoding="utf-8"))["words"]:
        add(f"{wd['art']} {wd['es']}" if wd["art"] else wd["es"], "vocabulaire")

# ---- Expressions : chaque forme et chaque phrase d'exemple ----
epath = PACK / "expressions.json"
if epath.exists():
    for e in json.loads(epath.read_text(encoding="utf-8"))["items"]:
        add(e["main"], "expression")
        for v in e["esAll"]:
            add(v, "expression")
        add(e["ex"], "expression")

# ---- Prononciation : chaque mot de la banque (sans article), les paires, les phrases ----
ppath = PACK / "pron.json"
if ppath.exists():
    pr = json.loads(ppath.read_text(encoding="utf-8"))
    for w in pr["words"]:
        add(w["w"], "prononciation")
    for s in pr["sentences"]:
        add(s["s"], "prononciation")
    for les in pr["lessons"]:
        for g in les["pairs"] + les["same"]:
            for x in g:
                add(x, "prononciation")

# ---- Phrases fixes de l'interface ----
for phrase in pack.get("speechExtras", []):
    add(phrase, "interface")

out = PACK / "audio" / "texts.json"
out.parent.mkdir(parents=True, exist_ok=True)
items = [texts[k] for k in sorted(texts)]
out.write_text(json.dumps(items, ensure_ascii=False, indent=0), encoding="utf-8")
print(f"{len(items)} textes -> {out.relative_to(ROOT)}")
