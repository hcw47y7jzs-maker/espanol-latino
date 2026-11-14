"""Enregistre les textes de packs/<pack>/audio/texts.json avec une voix Piper (MP3).

Utilisé par le workflow GitHub « Audios » (8 parties en parallèle, puis fusion) ;
on peut aussi le lancer à la main :
  pip install piper-tts lameenc
  python3 tools/synthesize_audio.py --pack packs/es-419 --voice chemin/vers/voix.onnx

Seuls les textes absents de audio/index.json sont enregistrés.
Avec --shard/--shards, seule une partie des textes est traitée et les nouvelles entrées
sont écrites dans --index-out (fusionnées ensuite par --merge).
"""
import argparse, array, hashlib, io, json, pathlib, re, sys, time, unicodedata, wave


def speech_key(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text).strip().lower())


def spoken(text: str) -> str:
    """Texte réellement prononcé : flèches et barres deviennent de petites pauses."""
    return re.sub(r"\s*(→|/)\s*", ", ", text)


def file_for(key: str) -> str:
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    return f"{h[:2]}/{h}.mp3"


def shard_of(key: str, shards: int) -> int:
    return int(hashlib.sha1(key.encode("utf-8")).hexdigest()[:8], 16) % shards


def trim(samples: array.array, rate: int, threshold: int = 400, pad_ms: int = 90) -> array.array:
    """Retire les silences en début et en fin (audio 16 bits mono)."""
    loud = [i for i in range(0, len(samples), 64) if max(abs(x) for x in samples[i:i + 64]) > threshold]
    if not loud:
        return samples
    pad = rate * pad_ms // 1000
    return samples[max(0, loud[0] - pad): min(len(samples), loud[-1] + 64 + pad)]


VOICE_B = "[b] "  # préfixe : seconde voix (Daniela transformée, plus grave) pour les dialogues
PITCH_B = 1.2      # 1,2 = environ trois demi-tons plus grave


def lower_pitch(samples: array.array, factor: float) -> array.array:
    """Abaisse la hauteur (et les formants) en étirant le signal ; la durée est compensée en amont."""
    import numpy as np

    x = np.frombuffer(samples.tobytes(), dtype=np.int16).astype(np.float32)
    n = int(len(x) * factor)
    y = np.interp(np.arange(n) / factor, np.arange(len(x)), x)
    return array.array("h", np.clip(y, -32768, 32767).astype(np.int16).tobytes())


def synth(voice, text, cfg):
    second = text.startswith(VOICE_B)
    if second:
        from piper import SynthesisConfig

        text = text[len(VOICE_B):]
        cfg = SynthesisConfig(length_scale=cfg.length_scale / PITCH_B, noise_scale=cfg.noise_scale, noise_w_scale=cfg.noise_w_scale)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        voice.synthesize_wav(spoken(text), wf, syn_config=cfg)
    with wave.open(io.BytesIO(buf.getvalue())) as w:
        rate = w.getframerate()
        samples = array.array("h", w.readframes(w.getnframes()))
    if second:
        samples = lower_pitch(samples, PITCH_B)
    return trim(samples, rate), rate


def to_mp3(samples: array.array, rate: int, bitrate: int) -> bytes:
    import lameenc

    enc = lameenc.Encoder()
    enc.set_bit_rate(bitrate)
    enc.set_in_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode(samples.tobytes()) + enc.flush()


def save_index(path: pathlib.Path, index: dict) -> None:
    path.write_text(json.dumps(index, ensure_ascii=False, sort_keys=True, separators=(",", ":")), encoding="utf-8")


def merge(audio_dir: pathlib.Path, parts: list[str]) -> int:
    index_path = audio_dir / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
    report = {"nouveaux": 0, "longs": []}
    for p in parts:
        part = json.loads(pathlib.Path(p).read_text(encoding="utf-8"))
        index.update(part["index"])
        report["nouveaux"] += len(part["index"])
        report["longs"] += part["longs"]
    save_index(index_path, index)
    texts = json.loads((audio_dir / "texts.json").read_text(encoding="utf-8"))
    report["total"] = len(index)
    report["reste"] = sum(1 for t in texts if speech_key(t) not in index)
    (audio_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"fusion : {report['nouveaux']} nouveaux, {len(index)} au total, reste {report['reste']}")
    return report["reste"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack", required=True)
    ap.add_argument("--voice")
    ap.add_argument("--length-scale", type=float, default=1.08, help=">1 = un peu plus lent, plus clair pour apprendre")
    ap.add_argument("--bitrate", type=int, default=32)
    ap.add_argument("--max-minutes", type=float, default=300)
    ap.add_argument("--limit", type=int, default=0, help="nombre maximum de textes (tests)")
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--shards", type=int, default=1)
    ap.add_argument("--index-out", help="écrit seulement les nouvelles entrées dans ce fichier")
    ap.add_argument("--merge", nargs="*", help="fusionne des fichiers --index-out dans index.json")
    args = ap.parse_args()

    audio_dir = pathlib.Path(args.pack) / "audio"
    if args.merge is not None:
        merge(audio_dir, args.merge)
        return 0

    from piper import PiperVoice, SynthesisConfig

    texts = json.loads((audio_dir / "texts.json").read_text(encoding="utf-8"))
    index_path = audio_dir / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
    todo = [t for t in texts if speech_key(t) not in index and shard_of(speech_key(t), args.shards) == args.shard]
    if args.limit:
        todo = todo[: args.limit]
    print(f"partie {args.shard + 1}/{args.shards} : {len(todo)} textes à enregistrer", flush=True)

    voice = PiperVoice.load(args.voice)
    configs = [
        SynthesisConfig(length_scale=args.length_scale),
        SynthesisConfig(length_scale=args.length_scale, noise_scale=0.45, noise_w_scale=0.5),
        SynthesisConfig(length_scale=1.0, noise_scale=0.3, noise_w_scale=0.3),
    ]
    new, longs = {}, []
    start = time.time()
    for n, text in enumerate(todo, 1):
        if time.time() - start > args.max_minutes * 60:
            print("Temps imparti écoulé, la suite sera faite au prochain passage.", flush=True)
            break
        key = speech_key(text)
        limit_s = 1.2 + 0.17 * len(text.removeprefix(VOICE_B))  # durée raisonnable pour ce texte
        best = None
        for cfg in configs:
            try:
                samples, rate = synth(voice, text, cfg)
            except Exception as e:  # un texte problématique ne bloque pas les autres
                print(f"  erreur sur {text!r} : {e}", flush=True)
                continue
            dur = len(samples) / rate
            if best is None or dur < best[2]:
                best = (samples, rate, dur)
            if dur <= limit_s:
                break
        if best is None:
            continue
        samples, rate, dur = best
        if dur > limit_s:
            longs.append({"texte": text, "secondes": round(dur, 2)})
        rel = file_for(key)
        dest = audio_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(to_mp3(samples, rate, args.bitrate))
        new[key] = rel
        if n % 250 == 0:
            print(f"  {n}/{len(todo)} ({time.time() - start:.0f} s)", flush=True)

    if args.index_out:
        pathlib.Path(args.index_out).write_text(json.dumps({"index": new, "longs": longs}, ensure_ascii=False), encoding="utf-8")
    else:
        index.update(new)
        save_index(index_path, index)
    print(f"{len(new)} enregistrés en {time.time() - start:.0f} s ; {len(longs)} anormalement longs", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
