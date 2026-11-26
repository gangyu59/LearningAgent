/* 测验：AI 按水平/题型出题（也可按某篇课程或听力材料出题），错题自动进错题本，可直接重做或让 AI 针对弱点出新题。 */
import { h, header, chips, spinner, empty, toast, iconBtn, ico, fmtDate } from "../ui.js";
import { api, errBox } from "../api.js";
import { settings, LEVELS, pending } from "../store.js";
import { icon } from "../icons.js";
import { showAnalyze } from "../analyze.js";

const MODES = [["mixed", "综合"], ["vocab", "词汇"], ["grammar", "语法"], ["reading", "阅读"], ["review", "弱点强化"]];
const MODE_NAME = { mixed: "综合", vocab: "词汇", grammar: "语法", reading: "阅读", listening: "听力理解", review: "弱点强化", mistakes: "错题重做" };
const cfg = { level: null, mode: "mixed", n: 8 };

export async function mount(root, parts) {
  const page = h("div.page"); root.append(page);
  let dead = false, onKey = null;
  const kd = e => onKey?.(e);
  document.addEventListener("keydown", kd);

  if (parts[0] === "run") {
    const p = pending.quiz; pending.quiz = null;
    if (!p) { location.replace("#/test"); return; }
    run({ level: settings.level(), mode: p.mode, n: 6, context: p.context, title: p.title });
  } else setup();

  /* ───── 设置页 ───── */
  async function setup() {
    cfg.level ||= settings.level();
    page.textContent = "";
    page.append(header("测验", { sub: "AI 出题 · 错题自动收集" }));
    const stats = h("div"), form = h("div.card.stack");
    page.append(stats, form);
    const draw = () => {
      form.textContent = "";
      form.append(
        h("div", {}, h("div.small.muted", { style: { marginBottom: "6px" } }, "水平"), chips(LEVELS.map(l => [l, l]), cfg.level, v => { cfg.level = v; draw(); })),
        h("div", {}, h("div.small.muted", { style: { marginBottom: "6px" } }, "题型"), chips(MODES, cfg.mode, v => { cfg.mode = v; draw(); })),
        h("div", {}, h("div.small.muted", { style: { marginBottom: "6px" } }, "题数"), chips([5, 8, 10, 15].map(n => [n, n + " 题"]), cfg.n, v => { cfg.n = v; draw(); })),
        cfg.mode === "review" ? h("div.note-box", {}, "根据你的错题和总是忘记的词，出全新的题目来针对性练习") : null,
        h("button.btn.primary.lg.block", { onclick: () => run({ ...cfg }) }, ico("zap"), " 开始出题"));
    };
    draw();
    try {
      const [s, hist, mk] = await Promise.all([api.get("api/stats"), api.get("api/quiz/history?limit=5"), api.get("api/quiz/mistakes?limit=1")]);
      if (dead) return;
      if (s.mistakes_open) stats.append(h("div.card.row", { style: { marginBottom: "12px" } }, h("div.grow", {}, h("b", {}, `错题本 ${s.mistakes_open} 题`), h("div.small.muted", {}, "不用等 AI，直接重做；答对后移出错题本")),
        h("button.btn.primary", { onclick: () => run({ level: "", mode: "mistakes", n: 10 }) }, "重做")));
      if (hist.items.length) page.append(h("h2.sec", {}, "最近成绩"), h("div.list", {}, ...hist.items.map(q => h("div.card.flat.row", {},
        h("div.grow", {}, h("b", {}, `${q.correct} / ${q.total}`), h("span.muted.small", {}, `　${q.level} · ${MODE_NAME[q.mode] || q.mode}`)), h("span.faint.small", {}, fmtDate(q.ts)),
        h("span.badge" + (q.correct / q.total >= .8 ? ".ok" : q.correct / q.total < .5 ? ".bad" : ""), {}, Math.round(q.correct / q.total * 100) + "%")))));
    } catch { /* 统计失败不挡出题 */ }
  }

  /* ───── 出题与作答 ───── */
  async function run(c) {
    page.textContent = "";
    const back = c.context ? undefined : "#/test";
    page.append(header(c.title ? "测验 · " + c.title : "测验", { back: back || "#/learn" }), spinner(c.mode === "mistakes" ? "取出错题…" : `AI 正在出 ${c.n} 道题，约 10–20 秒…`));
    let qs;
    try {
      if (c.mode === "mistakes") {
        const r = await api.get(`api/quiz/mistakes?limit=${c.n}`);
        qs = r.items.map(m => ({ ...m.question, mistake_id: m.id }));
        if (!qs.length) { page.textContent = ""; page.append(header("测验", { back: "#/test" }), empty("🎉", "错题本是空的")); return; }
        c.level ||= r.items[0].level;
      } else qs = (await api.post("api/ai/quiz", { level: c.level, mode: c.mode, n: c.n, context: c.context || "", topic: "" })).questions;
    } catch (e) { if (dead) return; page.textContent = ""; page.append(header("测验", { back: "#/test" }), errBox(e, () => run(c))); return; }
    if (dead) return;
    const res = [];
    question(c, qs, 0, res);
  }

  function question(c, qs, i, res) {
    const q = qs[i];
    let picked = -1;
    page.textContent = "";
    page.append(header(c.title ? "测验 · " + c.title : "测验", { back: "#/test", sub: `第 ${i + 1} / ${qs.length} 题` }),
      h("div.bar", { style: { marginBottom: "16px" } }, h("i", { style: { width: (i / qs.length * 100) + "%" } })));
    const opts = h("div.stack");
    const box = h("div.card.stack", {}, h("div.row", { style: { alignItems: "flex-start" } }, h("div.q-text.grow.ja", {}, q.q), iconBtn("search", "解析题干", () => showAnalyze(q.q.split("\n").slice(0, 3).join("\n").slice(0, 280)))), opts);
    const fb = h("div", { hidden: true });
    const nextBtn = h("button.btn.primary.lg.block", { onclick: () => go() }, i + 1 < qs.length ? "下一题" : "看结果");
    const btns = q.options.map((o, k) => h("button.opt", { onclick: () => pick(k) }, h("span.k", {}, "ABCD"[k]), h("span.ja", {}, o)));
    opts.append(...btns);
    function pick(k) {
      if (picked >= 0) return;
      picked = k;
      btns.forEach((b, j) => { b.disabled = true; if (j === q.answer) b.classList.add("right"); else if (j === k) b.classList.add("wrong"); });
      const ok = k === q.answer;
      res.push({ q: { type: q.type, q: q.q, options: q.options, answer: q.answer, explain: q.explain }, picked: k, correct: ok, mistake_id: q.mistake_id || null });
      fb.hidden = false; fb.append(h("div.card.flat", { style: { background: ok ? "var(--ok-soft)" : "var(--bad-soft)" } },
        h("b", { style: { color: ok ? "var(--ok)" : "var(--bad)" } }, ok ? "✅ 答对了" : `❌ 正确答案是 ${"ABCD"[q.answer]}`), h("div", { style: { marginTop: "4px" } }, q.explain || "")));
      nextBtn.hidden = false; nextBtn.focus();
    }
    nextBtn.hidden = true;
    function go() { if (i + 1 < qs.length) question(c, qs, i + 1, res); else finish(c, qs, res); }
    page.append(box, h("div", { style: { height: "12px" } }), fb, h("div", { style: { height: "12px" } }), nextBtn);
    onKey = e => {
      if (e.target.matches("input,textarea")) return;
      if ("1234".includes(e.key) && e.key && picked < 0) pick(+e.key - 1);
      else if ((e.key === "Enter" || e.key === " ") && picked >= 0) { e.preventDefault(); go(); }
    };
  }

  async function finish(c, qs, res) {
    onKey = null;
    const right = res.filter(r => r.correct).length, pct = Math.round(right / res.length * 100);
    page.textContent = "";
    page.append(header("测验结果", { back: "#/test" }),
      h("div.card.stack", { style: { textAlign: "center", padding: "22px 16px" } },
        h("div.ring", { style: { "--p": pct } }, h("b", {}, pct + "%")),
        h("h2", {}, `${right} / ${res.length} 题正确`), h("div.muted", {}, pct >= 80 ? "很棒，继续保持 🎉" : pct >= 50 ? "不错，错的题已经进了错题本" : "别灰心，错题我帮你记着了，过会儿再来一组"),
        h("div.row", { style: { justifyContent: "center" } }, h("button.btn.primary", { onclick: () => run({ ...c }) }, ico("refresh"), " 再来一组"), h("a.btn", { href: "#/test" }, "返回"))));
    const wrong = res.filter(r => !r.correct);
    if (wrong.length) page.append(h("h2.sec", {}, "本次错题"), ...wrong.map(r => h("div.card.flat", { style: { marginBottom: "10px" } },
      h("div.ja", { style: { fontWeight: 600, whiteSpace: "pre-wrap" } }, r.q.q),
      h("div.small", { style: { marginTop: "6px" } }, h("span.badge.bad", {}, "你选"), " " + (r.picked >= 0 ? r.q.options[r.picked] : "—"), h("span", { style: { margin: "0 6px" } }), h("span.badge.ok", {}, "正确"), " " + r.q.options[r.q.answer]),
      r.q.explain ? h("div.muted.small", { style: { marginTop: "6px" } }, r.q.explain) : null)));
    try { await api.post("api/quiz/result", { level: c.level || "N4", mode: c.mode, items: res }); }
    catch (e) { toast("成绩没有保存：" + e.message); }
  }

  return () => { dead = true; document.removeEventListener("keydown", kd); };
}
