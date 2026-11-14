// Enregistrement au micro, avec arrêt automatique quand on a fini de parler.
// Fonctionne sur iPhone (Safari, audio/mp4) et sur les navigateurs de bureau (audio/webm).
// À appeler depuis un geste (toucher un bouton) : iOS l'exige pour le micro et le son.

const TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export const supported = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

/**
 * Lance un enregistrement.
 * @param {object} o
 * @param {number} o.maxMs      durée maximale
 * @param {number} o.silenceMs  silence qui termine l'enregistrement une fois la parole détectée
 * @param {(level:number)=>void} o.onLevel  niveau sonore (0 à 1) en continu, pour l'affichage
 * @param {()=>void} o.onSpeech appelé quand la voix est détectée
 * @returns {{done: Promise<{blob:Blob, type:string, ms:number, speech:boolean}>, stop:()=>void}}
 */
export function record({ maxMs = 7000, silenceMs = 1000, onLevel = () => {}, onSpeech = () => {} } = {}) {
  let stopFn = () => {};
  const done = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    try { await ac.resume(); } catch {}
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const t0 = performance.now();
    let speech = false, floor = 0.01, lastLoud = 0, frames = 0, stopped = false, raf = 0;
    const buf = new Float32Array(an.fftSize);

    const finished = new Promise((resolve) => {
      mr.onstop = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        ac.close().catch(() => {});
        resolve({ blob: new Blob(chunks, { type: mr.mimeType || type || "audio/webm" }), type: mr.mimeType || type, ms: performance.now() - t0, speech });
      };
    });
    stopFn = () => {
      if (stopped) return;
      stopped = true;
      try { mr.state !== "inactive" && mr.stop(); } catch {}
    };
    mr.start(100);

    const tick = () => {
      if (stopped) return;
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now() - t0;
      frames++;
      if (now < 300) floor = Math.max(floor, rms); // bruit de fond du début
      const thr = Math.max(0.02, floor * 2.5);
      onLevel(Math.min(1, rms / 0.25));
      if (rms > thr) {
        lastLoud = now;
        if (!speech && now > 150) { speech = true; onSpeech(); }
      }
      if (speech && now - lastLoud > silenceMs) return stopFn();
      if (!speech && now > 5000) return stopFn();
      if (now > maxMs) return stopFn();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return finished;
  })();
  return { done, stop: () => stopFn() };
}

/** Extension de fichier attendue par l'API selon le type audio. */
export const extFor = (type) => (/mp4|m4a|aac/.test(type) ? "m4a" : /ogg/.test(type) ? "ogg" : "webm");
