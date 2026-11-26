/* 单页应用外壳：底部导航 / 侧栏、哈希路由、学习时长统计。 */
import { icon } from "./icons.js";
import { h, clear, empty } from "./ui.js";
import { api } from "./api.js";
import { settings } from "./store.js";
import { stopAll } from "./audio.js";

const TABS = [["home", "首页", "home"], ["learn", "学习", "book"], ["chat", "对话", "chat"], ["words", "单词", "cards"], ["test", "测验", "test"]];
const VIEWS = {
  home: () => import("./views/home.js"), learn: () => import("./views/learn.js"), chat: () => import("./views/chat.js"),
  words: () => import("./views/words.js"), test: () => import("./views/test.js"), review: () => import("./views/review.js"),
  settings: () => import("./views/settings.js"),
};
const NAV_OF = { review: "words", settings: "home" };

const nav = document.getElementById("nav"), root = document.getElementById("view");
nav.append(h("div.logo", {}, "あ"));
TABS.forEach(([id, label, ic]) => nav.append(h("a", { href: "#/" + id, "data-tab": id, html: icon(ic) + `<span>${label}</span>` })));

let cleanup = null, token = 0;
async function route() {
  const t = ++token;
  const [path, qs] = (location.hash.slice(2) || "home").split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const name = VIEWS[parts[0]] ? parts[0] : "home";
  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null; stopAll();
  nav.querySelectorAll("a").forEach(a => a.classList.toggle("on", a.dataset.tab === (NAV_OF[name] || name)));
  clear(root); root.scrollTop = 0;
  try {
    const mod = await VIEWS[name]();
    if (t !== token) return;
    cleanup = (await mod.mount(root, parts.slice(1), new URLSearchParams(qs || ""))) || null;
  } catch (e) {
    console.error(e);
    if (t === token) { clear(root); root.append(h("div.page", {}, empty("⚠️", "页面出错了", e.message || String(e), h("a.btn.primary", { href: "#/home" }, "回首页")))); }
  }
}
window.addEventListener("hashchange", route);

/* 学习时长：页面可见时每 30 秒记一次 */
setInterval(() => { if (!document.hidden) api.post("api/activity", { seconds: 30 }).catch(() => {}); }, 30000);

settings.load().finally(route);
