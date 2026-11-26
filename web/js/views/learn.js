/* 学习：课程 / 语法 / 听力。静态教材 + AI 讲解、出题、生成新听力。 */
import { h, header, seg, chips, spinner, empty, toast, iconBtn, ico, copyText } from "../ui.js";
import { api, errBox } from "../api.js";
import { settings, content, GROUPS, groupOf, pending } from "../store.js";
import { icon } from "../icons.js";
import { render } from "../md.js";
import { showAnalyze } from "../analyze.js";
import { say, stopAll, bindSpeak, prefetch, FEMALE, MALE } from "../audio.js";

const KINDS = { lessons: "课程", grammar: "语法", listening: "听力" };
const EXTRA = { grammar: [["common", "常用句型"]], listening: [["scenes", "场景"], ["stories", "故事"], ["ai", "AI 生成"]] };
const groupsOf = kind => [...GROUPS, ...(EXTRA[kind] || [])];
const SUBTITLE = { lessons: "系统地学一个主题", grammar: "句型与例句", listening: "听对话，练听力" };

export async function mount(root, parts) {
  const [kindRaw, group, id] = parts;
  const kind = KINDS[kindRaw] ? kindRaw : "lessons";
  const cleanups = [];
  const page = h("div.page"); root.append(page);
  if (group && id) await detail(page, kind, group, id, cleanups);
  else await list(page, kind, group || (kind === "lessons" || kind === "grammar" || kind === "listening" ? groupOf(settings.level()) : "beginner"));
  return () => cleanups.forEach(f => f());
}

/* ───────────── 列表 ───────────── */
async function list(page, kind, group) {
  page.append(header("学习", { sub: SUBTITLE[kind] }),
    seg(Object.entries(KINDS), kind, k => (location.hash = `#/learn/${k}`)),
    h("div", { style: { height: "12px" } }),
    h("div.chips.scroll", {}, ...groupsOf(kind).map(([g, label]) => h("a.chip" + (g === group ? ".on" : ""), { href: `#/learn/${kind}/${g}`, style: { textDecoration: "none" } }, label))),
    h("div", { style: { height: "14px" } }));
  const box = h("div.list", {}, spinner());
  page.append(box);
  try {
    if (group === "ai") return await aiList(page, box);
    const [items, prog] = await Promise.all([content(`${kind}/${group}.json`), api.get("api/progress")]);
    const done = prog[kind] || {};
    box.textContent = "";
    box.classList.add("cols");
    items.forEach(it => {
      const isDone = done[`${group}:${it.id}`] === "done";
      box.append(h("a.card.item" + (isDone ? ".done" : ""), { href: `#/learn/${kind}/${group}/${it.id}` },
        h("div.no", { html: isDone ? icon("check") : "" }, isDone ? null : it.id),
        h("div.grow", {}, h("div.t", {}, it.title), h("div.d", {}, it.description || it.objective || "")),
        h("span.faint", { html: icon("right") })));
    });
    const n = items.filter(it => done[`${group}:${it.id}`] === "done").length;
    if (kind === "lessons" || kind === "grammar") page.insertBefore(h("div.faint.small", { style: { margin: "-6px 2px 10px" } }, `已完成 ${n} / ${items.length}`), box);
  } catch (e) { box.textContent = ""; box.append(errBox(e, () => { page.textContent = ""; list(page, kind, group); })); }
}

async function aiList(page, box) {
  const topic = h("input", { type: "text", placeholder: "主题（可选）：机场、租房、看电影…", maxLength: 60 });
  let sel = "dialog";
  const kindChips = h("div");
  const drawKinds = () => { kindChips.textContent = ""; kindChips.append(chips([["dialog", "对话"], ["story", "短故事"]], sel, v => { sel = v; drawKinds(); })); };
  drawKinds();
  const go = h("button.btn.primary.block", { onclick: async () => {
    go.disabled = true; go.textContent = "AI 正在编写，约 10–20 秒…";
    try { const d = await api.post("api/ai/passage", { level: settings.level(), kind: sel, topic: topic.value }); location.hash = `#/learn/listening/ai/${d.id}`; }
    catch (e) { toast(e.message); go.disabled = false; go.textContent = "生成新的听力材料"; }
  } }, "生成新的听力材料");
  box.replaceWith(h("div.card.stack", {}, h("div.small.muted", {}, `按你当前的水平（${settings.level()}）生成，生成后会保存在下面的列表里`), kindChips, topic, go));
  const items = (await api.get("api/ai/passages")).items;
  const list = h("div.list.cols", { style: { marginTop: "14px" } });
  const prog = (await api.get("api/progress")).listening || {};
  items.forEach(it => list.append(h("a.card.item" + (prog["ai:" + it.id] === "done" ? ".done" : ""), { href: `#/learn/listening/ai/${it.id}` },
    h("div.no", {}, it.kind === "story" ? "话" : "会"), h("div.grow", {}, h("div.t", {}, it.title), h("div.d", {}, `${it.level} · ${it.description || ""}`)), h("span.faint", { html: icon("right") }))));
  page.append(items.length ? list : h("div.faint.small", { style: { marginTop: "14px", textAlign: "center" } }, "还没有生成过材料"));
}

/* ───────────── 详情 ───────────── */
async function detail(page, kind, group, id, cleanups) {
  const back = `#/learn/${kind}/${group}`;
  page.append(spinner());
  let item;
  try {
    if (group === "ai") item = (await api.get("api/ai/passages")).items.find(x => String(x.id) === id);
    else item = (await content(`${kind}/${group}.json`)).find(x => String(x.id) === id);
  } catch (e) { page.textContent = ""; page.append(header("出错了", { back }), errBox(e)); return; }
  page.textContent = "";
  if (!item) { page.append(header("没找到", { back }), empty("🤔", "没有这一项")); return; }

  const key = `${group}:${item.id}`;
  api.put("api/progress", { kind, item: key, status: "seen" }).catch(() => {});
  page.append(header(item.title, { back, sub: item.description || item.objective }));

  const doneBtn = h("button.btn", { onclick: async () => {
    try { await api.put("api/progress", { kind, item: key, status: "done" }); doneBtn.className = "btn"; doneBtn.innerHTML = icon("check") + " 已完成"; doneBtn.disabled = true; toast("已标记完成 👍"); } catch (e) { toast(e.message); }
  } }, "标记完成");
  api.get("api/progress").then(p => { if ((p[kind] || {})[key] === "done") { doneBtn.innerHTML = icon("check") + " 已完成"; doneBtn.disabled = true; } }).catch(() => {});

  const actions = h("div.row.wrap", { style: { margin: "14px 0" } });
  let context = "", topic = item.title, quizMode = "mixed";

  if (kind === "lessons") {
    if (item.objective) page.append(h("div.note-box", {}, "🎯 " + item.objective));
    page.append(h("div.card", { style: { marginTop: "12px" } }, render(item.content)));
    context = item.content.slice(0, 2400);
  } else {
    context = dialogue(page, kind, item, cleanups);
    quizMode = kind === "listening" ? "listening" : "grammar";
  }

  actions.append(h("button.btn.primary", { onclick: () => { pending.quiz = { mode: quizMode, context, title: item.title }; location.hash = "#/test/run"; } }, ico("test"), " 按这篇出题"), doneBtn);
  page.append(actions);

  const t = teachPanel({ topic: (kind === "lessons" ? "日语课：" : kind === "grammar" ? "语法：" : "听力材料：") + item.title, context, cleanups,
    actions: kind === "listening" ? [["more", "更多类似表达"], ["practice", "出几道练习"]] : [["explain", "讲解一下"], ["more", "多给几个例句"], ["practice", "出几道练习"]] });
  page.append(t);
}

/** 对话/例句列表 + 播放控制。返回给 AI/出题用的文字材料。 */
function dialogue(page, kind, item, cleanups) {
  const lines = item.dialog, trs = item.translation || [];
  const speakers = [...new Set(lines.map(l => l.speaker))];
  const multi = speakers.length > 1 && kind === "listening";
  const voiceOf = sp => (!multi ? undefined : sp === speakers[0] ? FEMALE : sp === speakers[1] ? MALE : undefined);
  const st = { playing: false, token: 0, slow: false, hide: false, rm: false, tr: kind === "grammar", cur: -1 };
  const listEl = h("div.dlg");
  const rowEls = lines.map((l, i) => {
    const sp = bindSpeak(iconBtn("speaker", "朗读", null), () => l.text, () => ({ voice: voiceOf(l.speaker), rate: st.slow ? -25 : undefined }));
    const row = h("div.line" + (multi && l.speaker === speakers[1] ? ".B" : ""), {},
      multi ? h("div.who", {}, l.speaker) : null,
      h("div.grow", {}, h("div.txt", { style: { cursor: "pointer" }, onclick: () => showAnalyze(l.text) }, l.text), h("div.rm", {}, l.romaji || ""), h("div.tr", {}, trs[i] || "")), sp);
    listEl.append(row); return row;
  });
  const apply = () => rowEls.forEach(r => {
    r.classList.toggle("hide", st.hide);
    r.querySelector(".rm").hidden = !st.rm; r.querySelector(".tr").hidden = !st.tr;
  });
  const toggle = (label, key, ic) => { const b = h("button.chip", { onclick: () => { st[key] = !st[key]; b.classList.toggle("on", st[key]); apply(); } }, label); b.classList.toggle("on", st[key]); return b; };

  const playBtn = h("button.btn.primary", {});
  const setPlay = () => { playBtn.innerHTML = icon(st.playing ? "pause" : "play") + (st.playing ? " 停止" : " 播放全部"); };
  async function playAll() {
    if (st.playing) { st.playing = false; st.token++; stopAll(); rowEls.forEach(r => r.classList.remove("now")); setPlay(); return; }
    st.playing = true; const tk = ++st.token; setPlay();
    for (let i = 0; i < lines.length && tk === st.token; i++) {
      rowEls.forEach(r => r.classList.remove("now")); rowEls[i].classList.add("now");
      rowEls[i].scrollIntoView({ block: "center", behavior: "smooth" });
      if (i + 1 < lines.length) prefetch(lines[i + 1].text, voiceOf(lines[i + 1].speaker) ?? settings.get("voice"), st.slow ? -25 : +settings.get("rate"));
      await say(lines[i].text, { voice: voiceOf(lines[i].speaker), rate: st.slow ? -25 : undefined });
      if (tk === st.token && !st.hide) await new Promise(r => setTimeout(r, 250));
    }
    if (tk === st.token) { st.playing = false; rowEls.forEach(r => r.classList.remove("now")); setPlay(); }
  }
  playBtn.onclick = playAll; setPlay();
  cleanups.push(() => { st.token++; st.playing = false; });

  const ctl = h("div.row.wrap", { style: { marginBottom: "12px" } }, playBtn,
    toggle("慢速", "slow"), kind === "listening" ? toggle("先听后看", "hide") : null, toggle("罗马音", "rm"), toggle("翻译", "tr"));
  apply();
  page.append(ctl, listEl);
  return lines.map((l, i) => (multi ? l.speaker + "：" : "") + l.text + (trs[i] ? `（${trs[i]}）` : "")).join("\n").slice(0, 2400);
}

/* ───────────── AI 老师面板（流式讲解） ───────────── */
function teachPanel({ topic, context, actions, cleanups }) {
  const out = h("div.card", { hidden: true, style: { marginTop: "12px" } });
  const body = h("div.rich");
  out.append(body);
  let ctl = null;
  cleanups.push(() => ctl?.abort());
  async function run(action, question = "") {
    ctl?.abort(); ctl = new AbortController();
    out.hidden = false; body.textContent = ""; body.append(spinner("AI 老师在写…"));
    let text = "";
    try {
      await api.sse("api/ai/teach", { action, topic, context, question, level: settings.level() }, ev => {
        if (ev.type !== "text") return;
        text += ev.text; render(text, body); body.classList.add("cursor");
      }, ctl.signal);
      body.classList.remove("cursor");
      if (!text.trim()) body.textContent = "（没有返回内容）";
    } catch (e) {
      body.classList.remove("cursor");
      if (e.name !== "AbortError") body.append(errBox(e, () => run(action, question)));
    }
  }
  const input = h("input", { type: "text", placeholder: "有疑问？问问 AI 老师…", maxLength: 300, onkeydown: e => { if (e.key === "Enter" && !e.isComposing) ask(); } });
  const ask = () => { const q = input.value.trim(); if (q) { input.value = ""; run("ask", q); } };
  return h("div", {}, h("h2.sec", {}, "AI 老师"),
    h("div.row.wrap", {}, ...actions.map(([a, label]) => h("button.btn.sm", { onclick: () => run(a) }, ico("zap"), " ", label))),
    h("div.row", { style: { marginTop: "10px" } }, input, h("button.btn.sm.primary", { onclick: ask }, "提问")), out);
}
