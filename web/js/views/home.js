/* 首页：今日复习、学习目标、快捷入口、下一课、近两周活动。 */
import { h, spinner } from "../ui.js";
import { api, errBox } from "../api.js";
import { settings, content, groupOf } from "../store.js";
import { icon } from "../icons.js";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export async function mount(root) {
  const page = h("div.page");
  root.append(page);
  const d = new Date();
  const top = h("div.page-head", {},
    h("h1", {}, "こんにちは", h("span.sub", {}, `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}曜日`)),
    h("a.badge", { href: "#/settings", title: "当前水平，点击修改", style: { padding: "5px 11px", fontSize: "13px", textDecoration: "none" } }, settings.level()),
    h("a.icon-btn", { href: "#/settings", "aria-label": "设置", html: icon("sliders") }));
  page.append(top, spinner());
  let s;
  try { s = await api.get("api/stats"); } catch (e) { page.lastChild.replaceWith(errBox(e, () => { root.textContent = ""; mount(root); })); return; }
  page.lastChild.remove();

  if (s.streak > 0) top.insertBefore(h("span.streak", { html: icon("flame") + s.streak + " 天" }), top.children[1]);

  /* 复习 */
  const hero = h("div.card.hero", {});
  if (s.due > 0) {
    hero.append(h("div.row", {}, h("div.grow", {}, h("div.small", { style: { opacity: .85 } }, "今日の復習"), h("div.big", {}, s.due, h("span", { style: { fontSize: "16px", fontWeight: 600 } }, " 张待复习"))),
      h("a.btn.lg", { href: "#/review" }, "开始复习")));
  } else if (s.total_cards === 0) {
    hero.append(h("div.row", {}, h("div.grow", {}, h("b", { style: { fontSize: "18px" } }, "还没有生词"), h("div.small", { style: { opacity: .85 } }, "从词典、对话、翻译里把不会的词加入生词本，这里就会按遗忘曲线安排复习")),
      h("a.btn", { href: "#/words/dict" }, "去添加")));
  } else {
    hero.append(h("div.row", {}, h("div.grow", {}, h("b", { style: { fontSize: "18px" } }, "今天的复习都完成了 🎉"), h("div.small", { style: { opacity: .85 } }, `生词本共 ${s.total_cards} 个词，已掌握 ${s.mastered} 个`)),
      h("a.btn", { href: "#/words/book" }, "生词本")));
  }
  page.append(hero);

  /* 今日目标 */
  const t = s.today, done = t.reviews + t.chat_turns + t.quiz_q + t.items, pct = Math.min(100, Math.round(done / s.goal * 100));
  page.append(h("div.card.flat", { style: { marginTop: "12px" } },
    h("div.row", { style: { marginBottom: "8px" } }, h("b.grow", {}, "今日目标"), h("span.muted.small", {}, `${done} / ${s.goal}　`, done >= s.goal ? "🎉 达成" : "复习·对话·做题·学习都算")),
    h("div.bar", {}, h("i", { style: { width: pct + "%" } }))));

  /* 入口 */
  const lc = s.last_chat;
  const tile = (ic, title, sub, href) => h("a.card.tile", { href }, h("div.ti", { html: icon(ic) }), h("b", {}, title), h("span", {}, sub));
  page.append(h("h2.sec", {}, "练习"), h("div.tiles", {},
    tile("chat", "日语对话", lc && !lc.review ? `继续「${lc.scenario}」` : "和さくら聊天，可语音", "#/chat"),
    tile("test", "AI 测验", s.mistakes_open ? `错题本 ${s.mistakes_open} 题待攻克` : "按水平出题，自动记错题", "#/test"),
    tile("search", "查词典", "605 词 + AI 查询任意词", "#/words/dict"),
    tile("translate", "翻译助手", "译文 + 语法 + 生词", "#/words/translate")));

  /* 下一课 */
  try {
    const g = groupOf(settings.level());
    const [lessons, prog] = await Promise.all([content(`lessons/${g}.json`), api.get("api/progress")]);
    const doneMap = prog.lessons || {};
    const next = lessons.find(l => doneMap[`${g}:${l.id}`] !== "done");
    if (next) page.append(h("h2.sec", {}, "继续学习"), h("a.card.item", { href: `#/learn/lessons/${g}/${next.id}` },
      h("div.no", {}, next.id), h("div.grow", {}, h("div.t", {}, next.title), h("div.d", {}, next.objective)), h("span.faint", { html: icon("right") })));
  } catch { /* 内容加载失败不影响首页 */ }

  /* 近两周 */
  const max = Math.max(1, ...s.week.map(x => x.n));
  page.append(h("h2.sec", {}, "近 14 天"), h("div.card", {},
    h("div.bars", {}, ...s.week.map((x, i) => h("div" + (i === s.week.length - 1 ? ".today" : ""), { title: `${x.day}：${x.n} 项` }, h("i" + (x.n ? ".has" : ""), { style: { height: Math.max(4, x.n / max * 56) + "px" } }), WEEK[new Date(x.day + "T00:00").getDay()]))),
    h("div.hr"),
    h("div.row", { style: { justifyContent: "space-around" } },
      stat(s.total_cards, "生词"), stat(s.mastered, "已掌握"), stat(s.progress.lessons || 0, "课程完成"),
      stat(s.quiz_recent.length ? Math.round(s.quiz_recent.reduce((a, q) => a + q.correct / q.total, 0) / s.quiz_recent.length * 100) + "%" : "–", "测验均分"))));
}
const stat = (n, label) => h("div.stat", {}, h("b", {}, n), h("span", {}, label));
