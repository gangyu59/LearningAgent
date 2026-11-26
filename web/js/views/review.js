/* 间隔复习：显示词 → 回想 → 看答案 → 评分（重来/困难/良好/简单），下一次时间由服务端 SM-2 算。 */
import { h, header, spinner, empty, toast, iconBtn, ico } from "../ui.js";
import { api, errBox } from "../api.js";
import { bindSpeak, say, stopAll } from "../audio.js";
import { settings } from "../store.js";
import { showAnalyze } from "../analyze.js";

export async function mount(root) {
  const page = h("div.page"); root.append(page);
  let dead = false, onKey = null;
  const state = { queue: [], total: 0, done: 0, again: 0, good: 0, start: Date.now() };

  async function load() {
    page.textContent = ""; page.append(header("复习", { back: "#/words/book" }), spinner());
    let r;
    try { r = await api.get("api/cards/due?limit=20"); } catch (e) { page.lastChild.replaceWith(errBox(e, load)); return; }
    if (dead) return;
    Object.assign(state, { queue: r.items, total: r.items.length, done: 0, again: 0, good: 0, start: Date.now() });
    if (!r.items.length) { page.textContent = ""; page.append(header("复习", { back: "#/words/book" }), empty("🎉", "现在没有要复习的词", "新加入的词会马上出现在这里；答过的词会在合适的时间再回来", h("a.btn.primary", { href: "#/words/dict" }, "去词典找词"))); return; }
    next();
  }

  function next() {
    stopAll();
    if (!state.queue.length) return finish();
    const c = state.queue[0];
    let shown = false;
    page.textContent = "";
    const pct = Math.round(state.done / state.total * 100);
    page.append(header("复习", { back: "#/words/book", sub: `${state.done} / ${state.total}`, actions: [h("a.btn.sm.ghost", { href: "#/words/book" }, "结束")] }),
      h("div.bar", { style: { marginBottom: "16px" } }, h("i", { style: { width: pct + "%" } })));

    const front = h("div.flash.card");
    const back = h("div", { hidden: true });
    const answerBtn = h("button.btn.primary.lg.block", { onclick: () => reveal() }, "显示答案　", h("span.faint.tiny", { style: { opacity: .7 } }, "空格"));
    const grades = h("div.grades", { hidden: true }, ...[0, 1, 2, 3].map(g => h("button.g" + g, { onclick: () => grade(g) },
      ["重来", "困难", "良好", "简单"][g], h("small", {}, c.next[g]))));

    front.append(h("div.w.ja", {}, c.word), h("div.row", { style: { justifyContent: "center" } }, bindSpeak(iconBtn("speaker", "朗读", null), () => c.kana || c.word)));
    function reveal() {
      if (shown) return; shown = true;
      front.append(
        c.kana && c.kana !== c.word ? h("div.k", {}, c.kana) : null, c.romaji ? h("div.rm", {}, c.romaji) : null,
        h("div.mean", {}, c.meaning || "（没有释义，可在生词本里补充）"),
        c.example_ja ? h("div.exm", { style: { cursor: "pointer" }, onclick: () => showAnalyze(c.example_ja) }, h("div.ja", { style: { fontWeight: 600 } }, c.example_ja), c.example_zh ? h("div.muted.small", {}, c.example_zh) : null) : null,
        c.note ? h("div.muted.small", {}, c.note) : null);
      answerBtn.hidden = true; grades.hidden = false;
      if (settings.bool("autoplay")) say(c.kana || c.word).catch(() => {});
    }
    async function grade(g) {
      grades.querySelectorAll("button").forEach(b => (b.disabled = true));
      try { await api.post(`api/cards/${c.id}/review`, { grade: g }); } catch (e) { toast(e.message); grades.querySelectorAll("button").forEach(b => (b.disabled = false)); return; }
      state.queue.shift();
      if (g === 0) { state.again++; state.queue.push(c); } else { state.done++; if (g >= 2) state.good++; }
      next();
    }
    front.addEventListener("click", e => { if (!e.target.closest("button,.exm")) reveal(); });
    page.append(front, h("div", { style: { height: "14px" } }), answerBtn, grades);
    onKey = e => {
      if (e.target.matches("input,textarea")) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!shown) reveal(); }
      else if (shown && "1234".includes(e.key) && e.key) grade(+e.key - 1);
    };
  }
  const kd = e => onKey?.(e);
  document.addEventListener("keydown", kd);

  async function finish() {
    onKey = null;
    page.textContent = "";
    const mins = Math.max(1, Math.round((Date.now() - state.start) / 60000));
    let s = null; try { s = await api.get("api/stats"); } catch { /* */ }
    page.append(header("复习完成", { back: "#/home" }), h("div.card.stack", { style: { textAlign: "center", padding: "26px 16px" } },
      h("div", { style: { fontSize: "46px" } }, "🎉"), h("h2", {}, `这一组 ${state.total} 个词完成了`),
      h("div.muted", {}, `用时约 ${mins} 分钟 · 记得牢 ${state.good} 个 · 重来 ${state.again} 次`),
      s ? h("div.muted", {}, s.due ? `还有 ${s.due} 个词待复习` : "今天的复习全部完成", s.streak ? ` · 连续学习 ${s.streak} 天` : "") : null,
      h("div.row", { style: { justifyContent: "center" } }, s?.due ? h("button.btn.primary", { onclick: load }, "再来一组") : null, h("a.btn", { href: "#/home" }, "回首页"))));
  }
  load();
  return () => { dead = true; onKey = null; document.removeEventListener("keydown", kd); stopAll(); };
}
