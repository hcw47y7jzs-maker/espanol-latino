// Stockage local (IndexedDB, avec repli sur localStorage). Tout reste sur le téléphone.
// Les valeurs sont gardées en mémoire : get() est synchrone, set() enregistre en arrière-plan.

const DB = "aprender";
const STORE = "kv";
let db = null;
const cache = new Map();

function req(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function init() {
  try {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    db = await req(open);
    const tx = db.transaction(STORE);
    const st = tx.objectStore(STORE);
    const [keys, values] = await Promise.all([req(st.getAllKeys()), req(st.getAll())]);
    keys.forEach((k, i) => cache.set(k, values[i]));
  } catch {
    db = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith("kv:")) cache.set(k.slice(3), JSON.parse(localStorage.getItem(k)));
    }
  }
  // Demande au navigateur de ne pas effacer les données.
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {}
}

export const get = (key, fallback) => (cache.has(key) ? cache.get(key) : fallback);

export function set(key, value) {
  cache.set(key, value);
  if (db) {
    try {
      db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
      return;
    } catch {}
  }
  localStorage.setItem("kv:" + key, JSON.stringify(value));
}

export function update(key, fallback, fn) {
  const v = fn(structuredClone(get(key, fallback)));
  set(key, v);
  return v;
}

export const dump = () => Object.fromEntries(cache);

export function restore(obj) {
  for (const [k, v] of Object.entries(obj)) set(k, v);
}

export async function isPersisted() {
  try {
    return (await navigator.storage?.persisted?.()) || false;
  } catch {
    return false;
  }
}
