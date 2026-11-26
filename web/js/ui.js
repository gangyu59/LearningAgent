/* 通用 UI 小工具：建元素、提示、弹层、对话框、分段控件。 */
import { icon } from "./icons.js";

// 原生 append(null) 会插入文字“null”：统一忽略 null / false，方便写 cond ? node : null
const nativeAppend = Element.prototype.append;
Element.prototype.append = function (...nodes) { return nativeAppend.apply(this, nodes.filter(n => n != null && n !== false)); };

/** h("div.card", {onclick}, child, "text") —— 标签后可用 .class 追加类名；on* 属性绑事件；html 属性放原始 HTML（仅限自己写的图标） */
export function h(tag, props, ...kids) {
  const [name, ...cls] = tag.split(".");
  const el = document.createElement(name || "div");
  if (cls.length) el.className = cls.join(" ");
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className += (el.className ? " " : "") + v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k in el && k !== "list" && typeof v !== "object") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const ico = (name, cls) => h("span", { html: icon(name, cls), style: { display: "inline-flex" } });
export function iconBtn(name, title, onclick, cls = "") {
  return h("button.icon-btn" + (cls ? "." + cls : ""), { title, "aria-label": title, onclick, html: icon(name) });
}
export const clear = el => { el.textContent = ""; return el; };
export const spinner = text => h("div.loading", {}, h("span.spin"), text || "");
export const empty = (big, title, sub, ...actions) =>
  h("div.empty", {}, h("div.big", {}, big), h("b", {}, title), sub ? h("div", {}, sub) : null, actions.length ? h("div.row", { style: { justifyContent: "center", marginTop: "14px" } }, ...actions) : null);

/* ───── 提示 ───── */
let toastTimer = 0;
export function toast(msg, ms = 2600) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = h("div.toast", { role: "status" }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

/* ───── 弹层 ───── */
const layer = () => document.getElementById("layer");
/** 底部弹层。build(body, close) 里往 body 填内容。返回 close。 */
export function sheet(title, build, { onClose } = {}) {
  const body = h("div.sheet-b");
  const scrim = h("div.scrim", { onclick: e => { if (e.target === scrim) close(); } });
  const box = h("div.sheet", { role: "dialog", "aria-label": title }, h("div.sheet-h", {}, h("b", {}, title), iconBtn("x", "关闭", () => close())), body);
  scrim.append(box);
  layer().append(scrim);
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  function close() { document.removeEventListener("keydown", onKey); scrim.remove(); if (onClose) onClose(); }
  build(body, close);
  return close;
}
function dialog(build) {
  return new Promise(resolve => {
    const scrim = h("div.scrim.center");
    const done = v => { scrim.remove(); resolve(v); };
    scrim.append(h("div.dialog", { role: "dialog" }, build(done)));
    layer().append(scrim);
    scrim.querySelector("input,button.primary")?.focus();
  });
}
export const confirmBox = (msg, ok = "确定", danger = false) => dialog(done => [
  h("p", { style: { marginBottom: "16px", fontWeight: 600 } }, msg),
  h("div.row", { style: { justifyContent: "flex-end" } }, h("button.btn.ghost", { onclick: () => done(false) }, "取消"), h("button.btn." + (danger ? "danger" : "primary"), { onclick: () => done(true) }, ok))]);
export const promptBox = (msg, { type = "text", placeholder = "", value = "" } = {}) => dialog(done => {
  const inp = h("input", { type, placeholder, value, onkeydown: e => { if (e.key === "Enter") done(inp.value); } });
  return [h("p", { style: { marginBottom: "10px", fontWeight: 600 } }, msg), inp,
    h("div.row", { style: { justifyContent: "flex-end", marginTop: "14px" } }, h("button.btn.ghost", { onclick: () => done(null) }, "取消"), h("button.btn.primary", { onclick: () => done(inp.value) }, "确定"))];
});

/* ───── 控件 ───── */
/** 分段控件：items=[[value,label]...]，选中变化时回调 */
export function seg(items, current, onChange) {
  const box = h("div.seg", { role: "tablist" });
  items.forEach(([v, label]) => {
    const b = h("button", { role: "tab", class: v === current ? "on" : "", onclick: () => { if (v !== current) onChange(v); } }, label);
    box.append(b);
  });
  return box;
}
export function chips(items, current, onChange, { multi = false } = {}) {
  const box = h("div.chips");
  const on = v => multi ? current.includes(v) : v === current;
  items.forEach(([v, label]) => box.append(h("button.chip" + (on(v) ? ".on" : ""), { type: "button", onclick: () => onChange(v) }, label)));
  return box;
}
export function header(title, { sub, back, actions } = {}) {
  return h("div.page-head", {},
    back ? h("a.back", { href: back, "aria-label": "返回", html: icon("left") }) : null,
    h("h1", {}, title, sub ? h("span.sub", {}, sub) : null),
    ...(actions || []));
}
export const fmtDate = ts => { const d = new Date(ts * 1000); return `${d.getMonth() + 1}月${d.getDate()}日`; };
export const copyText = async t => { try { await navigator.clipboard.writeText(t); toast("已复制"); } catch { toast("复制失败"); } };
export const jaOnly = t => (t || "").replace(/[（(][^）)]*[）)]/g, "").trim(); // 朗读时去掉括号里的读音/说明
