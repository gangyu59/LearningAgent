/* 句子解析弹层：逐词读音/释义、整句翻译、语法点；点词可加入生词本。可从任何地方调用。 */
import { h, sheet, spinner, iconBtn, ico } from "./ui.js";
import { api, errBox } from "./api.js";
import { wordbook } from "./store.js";
import { bindSpeak } from "./audio.js";

const FUNC = /助词|助动词|接续|连体/;

export function showAnalyze(text) {
  text = (text || "").trim();
  if (!text) return;
  sheet("句子解析", body => {
    const head = h("div.row", {}, h("div.grow.ja", { style: { fontSize: "18px", fontWeight: 600, lineHeight: 1.5 } }, text), bindSpeak(iconBtn("speaker", "朗读", null), () => text));
    const out = h("div");
    body.append(head, out);
    const run = async () => {
      out.textContent = ""; out.append(spinner("AI 正在拆解…"));
      try { fill(out, text, await api.post("api/ai/analyze", { text })); }
      catch (e) { out.textContent = ""; out.append(errBox(e, run)); }
    };
    run();
  });
}

function fill(out, text, d) {
  out.textContent = "";
  const detail = h("div.card.flat", { hidden: true, style: { marginTop: "6px" } });
  const grid = h("div.tok-grid");
  (d.tokens || []).forEach(t => {
    const showR = t.r && t.r !== t.s;
    const el = h("button.tok" + (FUNC.test(t.p || "") ? ".func" : ""), { onclick: () => pick(t, el) },
      h("div.r", {}, showR ? t.r : " "), h("div.s", {}, t.s), h("div.m", {}, t.m || ""));
    if (wordbook.has(t.base || t.s)) el.classList.add("added");
    grid.append(el);
  });
  function pick(t, el) {
    detail.hidden = false; detail.textContent = "";
    const word = t.base || t.s;
    const add = h("button.btn.sm.primary", {}, wordbook.has(word) ? "已在生词本" : "加入生词本");
    add.disabled = wordbook.has(word);
    add.onclick = async () => {
      add.disabled = true;
      try {
        await wordbook.add({ word, kana: t.r && t.r !== word ? t.r : "", meaning: t.m || "", pos: t.p || "", example_ja: text, example_zh: d.translation || "", source: "analyze" });
        add.textContent = "已加入"; el.classList.add("added");
      } catch (e) { add.disabled = false; add.textContent = e.message; }
    };
    detail.append(h("div.row", {},
      h("div.grow", {}, h("b", { style: { fontSize: "18px" } }, word), t.base && t.base !== t.s ? h("span.faint.small", {}, "  （原形，句中：" + t.s + "）") : null,
        h("div.muted.small", {}, [t.r, t.p].filter(Boolean).join(" · ")), h("div", {}, t.m || "")),
      bindSpeak(iconBtn("speaker", "朗读", null), () => word), add));
  }
  out.append(h("div.note-box", { style: { margin: "10px 0" } }, d.translation || ""), h("div.faint.tiny", {}, "点击词语查看详情、加入生词本"), grid, detail);
  if (d.grammar?.length) {
    out.append(h("h2.sec", {}, "语法点"), ...d.grammar.map(g => h("div", { style: { margin: "6px 0" } }, h("b", {}, g.point), h("span.muted", {}, "　" + g.note))));
  }
}
