// Petit convertisseur Markdown -> HTML pour les leçons.
// Conventions : *italique* = texte en langue étudiée (affiché en police à empattements),
// **gras**, [lien](url), tableaux |…|, listes « - », encadrés « > [!argentine] », « > [!astuce] », « > [!piege] ».

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const NOTE_TITLES = { argentine: "En Argentine", astuce: "Astuce", piege: "Piège" };

export function inline(text, lang) {
  let s = esc(text);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith("#") ? "" : ' target="_blank" rel="noopener"'}>${t}</a>`);
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, `<b><i lang="${lang}">$1</i></b>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/\*([^*]+)\*/g, `<i lang="${lang}">$1</i>`);
  return s;
}

export function render(md, lang = "es") {
  const lines = md.replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("## ")) { out.push(`<h2>${inline(line.slice(3), lang)}</h2>`); i++; continue; }
    if (line.startsWith("### ")) { out.push(`<h3>${inline(line.slice(4), lang)}</h3>`); i++; continue; }
    if (line.startsWith(">")) {
      const block = [];
      while (i < lines.length && lines[i].startsWith(">")) block.push(lines[i++].replace(/^>\s?/, ""));
      const m = block[0].match(/^\[!(\w+)\]\s*$/);
      const kind = m ? m[1] : "note";
      const lines2 = m ? block.slice(1) : block;
      const parts = [];
      for (const l of lines2) {
        if (/^- /.test(l)) {
          if (parts.length && parts[parts.length - 1].list) parts[parts.length - 1].items.push(l.slice(2));
          else parts.push({ list: true, items: [l.slice(2)] });
        } else if (parts.length && !parts[parts.length - 1].list) parts[parts.length - 1].text += " " + l;
        else parts.push({ list: false, text: l });
      }
      const inner = parts.map((x) => (x.list ? `<ul>${x.items.map((i) => `<li>${inline(i, lang)}</li>`).join("")}</ul>` : `<p>${inline(x.text, lang)}</p>`)).join("");
      out.push(`<aside class="note note-${kind}">${NOTE_TITLES[kind] ? `<p class="note-title">${NOTE_TITLES[kind]}</p>` : ""}${inner}</aside>`);
      continue;
    }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c, lang)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c, lang)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`
      );
      continue;
    }
    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
      out.push(`<ul>${items.map((t) => `<li>${inline(t, lang)}</li>`).join("")}</ul>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(## |### |>|\||- )/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(" "), lang)}</p>`);
  }
  return out.join("\n");
}
