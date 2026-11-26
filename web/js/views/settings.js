/* 设置：水平、朗读、显示选项、每日目标、访问口令、服务状态。 */
import { h, header, toast, sheet } from "../ui.js";
import { api, LS } from "../api.js";
import { settings, LEVELS } from "../store.js";
import { say, stopAll } from "../audio.js";

export async function mount(root) {
  const page = h("div.page"); root.append(page);
  page.append(header("设置", { back: "#/home" }));
  const field = (label, control) => h("label.field", {}, h("span", {}, label), control);
  const save = (k, el) => el.addEventListener("change", () => settings.set(k, el.type === "checkbox" ? (el.checked ? "1" : "0") : el.value));

  const level = h("select", {}, ...LEVELS.map(l => h("option", { value: l }, { N5: "N5 · 入门", N4: "N4 · 初级", N3: "N3 · 中级", N2: "N2 · 中高级", N1: "N1 · 高级" }[l])));
  level.value = settings.level(); save("level", level);
  const rate = h("select", {}, ...[["-20", "慢"], ["-10", "稍慢"], ["0", "正常"], ["15", "快"]].map(([v, t]) => h("option", { value: v }, t)));
  rate.value = settings.get("rate"); save("rate", rate);
  const voice = h("select", {}, h("option", { value: "" }, "默认"));
  voice.addEventListener("change", () => { settings.set("voice", voice.value); stopAll(); say("こんにちは、よろしくお願いします。", { voice: voice.value }); });
  const goal = h("select", {}, ...[10, 20, 30, 50].map(n => h("option", { value: n }, n + " 项 / 天"))); goal.value = settings.get("daily_goal"); save("daily_goal", goal);
  const chk = (k, label) => { const c = h("input", { type: "checkbox" }); c.checked = settings.bool(k); save(k, c); return h("label.check", {}, c, label); };

  page.append(
    h("div.card.stack", {}, field("日语水平（课程推荐、对话难度、测验难度都会跟着变）", level), field("每日目标", goal)),
    h("h2.sec", {}, "朗读"),
    h("div.card.stack", {}, field("声音", voice), field("语速", rate), chk("autoplay", "对话里自动朗读 AI 的回复")),
    h("h2.sec", {}, "对话"),
    h("div.card.stack", {}, chk("open_zh", "默认展开中文翻译"), chk("show_fix", "显示纠错提示")));

  const status = h("div.card.stack.small");
  const codeBtn = h("button.btn.sm", { onclick: () => { LS.del("code"); toast("口令已清除，下次请求会重新询问"); } }, "清除已保存的访问口令");
  page.append(h("h2.sec", {}, "服务状态"), status, h("div", { style: { marginTop: "10px" } }, codeBtn));

  try {
    const [hl, vs] = await Promise.all([api.get("api/health"), api.get("api/voice/status")]);
    vs.voices.forEach(v => voice.append(h("option", { value: v.id }, v.name)));
    voice.value = settings.get("voice") || vs.tts.default_voice;
    const row = (name, ok, extra) => h("div.row", {}, h("span.badge" + (ok ? ".ok" : ".bad"), {}, ok ? "正常" : "不可用"), h("b", {}, name), h("span.muted", {}, extra || ""));
    status.append(
      row("Claude 订阅", hl.claude, hl.claude ? `模型 ${hl.model}` + (hl.last?.ok === false ? `；最近一次失败：${hl.last.err}` : "") : "找不到 claude 命令"),
      row("语音识别", vs.stt.available, vs.stt.available ? "Whisper " + ({ ready: "就绪", loading: "加载中…", idle: "待加载", error: "出错" }[vs.stt.status] || "") : "未安装，只能打字"),
      row("语音朗读", vs.tts.available, vs.tts.available ? "edge-tts" : "未安装，用浏览器朗读"),
      row("访问口令", true, hl.auth ? "已启用" : "未启用（仅本机/内网使用时无需）"));
  } catch (e) { status.append(h("div.err", {}, "连不上后端：" + e.message)); }
}
