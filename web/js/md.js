/* 轻量富文本渲染：课程正文与 AI 讲解（标题、列表、表格、粗体、「▶ 日语｜中文」例句行）。全部用 textContent，不拼 HTML。 */
import { h, iconBtn } from "./ui.js";
import { bindSpeak } from "./audio.js";
import { showAnalyze } from "./analyze.js";

const JA_SENT = /^([぀-ヿ一-鿿々ー、。！？!?「」『』\s0-9A-Za-z～〜・]+[。！？!?」])\s*[（(]([^）)]+)[）)]\s*$/;

function inline(text) {
  const frag = document.createDocumentFragment();
  text.split(/(\*\*[^*]+\*\*)/).forEach(p => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) frag.append(h("strong", {}, p.slice(2, -2)));
    else if (p) frag.append(p);
  });
  return frag;
}
function example(ja, kana, zh) {
  const sp = bindSpeak(iconBtn("speaker", "朗读", null), () => ja);
  return h("div.ex", {}, sp,
    h("div.grow", { style: { cursor: "pointer" }, onclick: () => showAnalyze(ja) },
      h("div.ja-t", {}, ja), kana ? h("div.kana", {}, kana) : null, zh ? h("div.zh", {}, zh) : null));
}

export function render(text, root = h("div.rich")) {
  root.textContent = "";
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  let ul = null, i = 0;
  const endList = () => { ul = null; };
  while (i < lines.length) {
    const raw = lines[i], line = raw.trim();
    if (!line) { endList(); i++; continue; }
    if (line.startsWith("|")) { // 表格
      endList();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(lines[i].trim()); i++; }
      const cells = r => r.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const body = rows.filter(r => !/^\|?[\s:|-]+\|?$/.test(r)).map(cells);
      if (body.length) {
        const tb = h("table", {}, h("thead", {}, h("tr", {}, ...body[0].map(c => h("th", {}, c)))), h("tbody", {}, ...body.slice(1).map(r => h("tr", {}, ...r.map(c => h("td", {}, c))))));
        root.append(h("div.tbl", {}, tb));
      }
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { endList(); root.append(h(m[1].length === 1 ? "h3" : "h4", {}, inline(m[2]))); }
    else if ((m = line.match(/^▶\s*(.+)$/))) { // 例句行：日语（读音）｜中文
      endList();
      const [left, ...rest] = m[1].split(/[｜|]/);
      const km = left.match(/^(.*?)[（(]([^）)]+)[）)]\s*$/);
      root.append(example((km ? km[1] : left).trim(), km ? km[2] : "", rest.join("｜").trim()));
    } else if ((m = line.match(/^(?:[•\-*·]|\d+[.、])\s*(.*)$/))) {
      if (!ul) { ul = h("ul"); root.append(ul); }
      const ex = m[1].match(JA_SENT);
      if (ex) { endList(); root.append(example(ex[1].trim(), "", ex[2])); }
      else ul.append(h("li", { class: /^\s{2,}/.test(raw) ? "l2" : "" }, inline(m[1])));
    } else {
      endList();
      const ex = line.match(JA_SENT);
      root.append(ex ? example(ex[1].trim(), "", ex[2]) : h("p", {}, inline(line)));
    }
    i++;
  }
  return root;
}
