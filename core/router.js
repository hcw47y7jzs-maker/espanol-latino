// Routeur à base de « #/chemin ».

const routes = [];

export function route(pattern, handler) {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
  routes.push({ re, keys, handler });
}

function match(full) {
  const [path, qs = ""] = full.split("?");
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params = { q: Object.fromEntries(new URLSearchParams(qs)) };
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
  }
  return null;
}

export const go = (path) => (location.hash = "#" + path);
export const current = () => location.hash.slice(1) || "/";

export function start(root) {
  const scrollMemory = {};
  let last = null;
  const render = async () => {
    if (last) scrollMemory[last] = window.scrollY;
    const path = current();
    const found = match(path) || match("/");
    const view = await found.handler(found.params);
    root.replaceChildren(view);
    last = path;
    window.scrollTo(0, scrollMemory[path] || 0);
    const h1 = root.querySelector("h1");
    if (h1) document.title = h1.textContent + " · Aprender";
  };
  addEventListener("hashchange", render);
  return render();
}

/** Réaffiche l'écran courant (après un changement de données). */
export const refresh = () => dispatchEvent(new HashChangeEvent("hashchange"));
