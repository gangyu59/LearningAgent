/* 全局状态：设置（存服务端 SQLite，本机留一份兜底）、静态内容加载、生词本词集、等级映射。 */
import { api, LS } from "./api.js";
import { toast } from "./ui.js";

export const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
export const GROUPS = [["beginner", "初级"], ["intermediate", "中级"], ["advanced", "高级"]];
/** N5/N4 → 初级，N3 → 中级，N2/N1 → 高级 */
export const groupOf = lv => (lv === "N5" || lv === "N4" ? "beginner" : lv === "N3" ? "intermediate" : "advanced");

const DEFAULTS = { level: "N4", voice: "", rate: "0", autoplay: "1", open_zh: "0", show_fix: "1", daily_goal: "20" };
let S = { ...DEFAULTS, ...JSON.parse(LS.get("settings", "{}") || "{}") };

export const settings = {
  get: k => S[k],
  level: () => (LEVELS.includes(S.level) ? S.level : "N4"),
  bool: k => S[k] === "1",
  all: () => ({ ...S }),
  async load() {
    try { S = { ...DEFAULTS, ...(await api.get("api/settings")) }; LS.set("settings", JSON.stringify(S)); }
    catch { /* 离线/未登录：用本机缓存 */ }
    return S;
  },
  async set(k, v) {
    S[k] = String(v); LS.set("settings", JSON.stringify(S));
    try { await api.put("api/settings", { values: { [k]: String(v) } }); } catch (e) { toast("设置没保存到服务器：" + e.message); }
  },
};

/* ───── 静态内容（web/content/*.json）───── */
const cache = new Map();
export function content(path) {
  if (!cache.has(path)) {
    const p = fetch(new URL("content/" + path, document.baseURI)).then(r => { if (!r.ok) throw new Error("内容加载失败：" + path); return r.json(); });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path);
}

/* ───── 生词本词集（用来给“加入生词本”按钮显示状态）───── */
let words = null;
export const wordbook = {
  async load(force) {
    if (!words || force) words = new Set((await api.get("api/cards/words")).words);
    return words;
  },
  has: w => !!words && words.has(w),
  async add(card, quiet) {
    const r = await api.post("api/cards", card);
    (words ||= new Set()).add(card.word);
    if (!quiet) toast(r.created ? `已加入生词本：${card.word}` : `「${card.word}」已在生词本里`);
    return r;
  },
};
export const cardFromEntry = (e, source) => ({
  word: e.word, kana: e.kana && e.kana !== e.word ? e.kana : "", romaji: e.romaji || "", pos: e.pos || "",
  meaning: (e.meanings || []).join("；"), example_ja: e.examples?.[0]?.ja || "", example_zh: e.examples?.[0]?.zh || "", source });

/* ───── 跨页面传递：从课程/听力“按这篇出题” ───── */
export const pending = { quiz: null };
