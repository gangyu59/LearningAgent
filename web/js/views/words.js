/* 单词：词典（本地 605 词 + AI 查询）/ 翻译助手 / 生词本。 */
import { h, header, seg, chips, spinner, empty, toast, iconBtn, ico, sheet, confirmBox, copyText } from "../ui.js";
import { api, errBox } from "../api.js";
import { settings, content, wordbook, cardFromEntry, LEVELS } from "../store.js";
import { icon } from "../icons.js";
import { bindSpeak } from "../audio.js";
import { showAnalyze } from "../analyze.js";

const TABS = [["dict", "词典"], ["translate", "翻译"], ["book", "生词本"]];

export async function mount(root, parts) {
  const tab = TABS.some(t => t[0] === parts[0]) ? parts[0] : "dict";
  const page = h("div.page"); root.append(page);
  page.append(header("单词"), seg(TABS, tab, t => (location.hash = "#/words/" + t)), h("div", { style: { height: "14px" } }));
  const body = h("div"); page.append(body);
  const cleanups = [];
  await ({ dict, translate, book }[tab])(body, cleanups);
  return () => cleanups.forEach(f => f());
}

/* ═════════════ 词典 ═════════════ */
const norm = s => (s || "").toLowerCase().replace(/[\s'’\-・]/g, "");

async function dict(body) {
  body.append(spinner());
  let all;
  try { [all] = await Promise.all([content("dictionary.json"), wordbook.load()]); } catch (e) { body.textContent = ""; body.append(errBox(e)); return; }
  body.textContent = "";
  const st = { q: "", level: "", pos: "", shown: 40, ai: [] };
  const input = h("input", { type: "search", placeholder: "输入日语、假名、罗马字或中文意思", autocomplete: "off", oninput: () => { st.q = input.value.trim(); st.shown = 40; st.ai = []; draw(); } });
  const lvBox = h("div"), posBox = h("div"), res = h("div.list");
  const POS = ["名词", "动词", "形容词", "副词", "短语"];
  const drawChips = () => {
    lvBox.textContent = ""; posBox.textContent = "";
    lvBox.append(h("div.chips.scroll", {}, ...[["", "全部"], ...LEVELS.map(l => [l, l])].map(([v, t]) => h("button.chip" + (st.level === v ? ".on" : ""), { onclick: () => { st.level = v; st.shown = 40; drawChips(); draw(); } }, t))));
    posBox.append(h("div.chips.scroll", {}, ...[["", "全部词性"], ...POS.map(p => [p, p])].map(([v, t]) => h("button.chip" + (st.pos === v ? ".on" : ""), { onclick: () => { st.pos = v; st.shown = 40; drawChips(); draw(); } }, t))));
  };
  function score(e, q, nq) {
    if (e.word === q || e.kana === q) return 0;
    if (e.word.startsWith(q) || e.kana.startsWith(q)) return 1;
    if (e.word.includes(q) || e.kana.includes(q)) return 2;
    if (norm(e.romaji) === nq) return 1;
    if (nq && norm(e.romaji).includes(nq)) return 3;
    if (e.meanings.some(m => m.includes(q))) return 3;
    return -1;
  }
  function draw() {
    res.textContent = "";
    let items = all.filter(e => (!st.level || e.level === st.level) && (!st.pos || e.pos === st.pos));
    if (st.q) {
      const nq = norm(st.q);
      items = items.map(e => [score(e, st.q, nq), e]).filter(x => x[0] >= 0).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    } else { const li = e => (LEVELS.indexOf(e.level) < 0 ? 9 : LEVELS.indexOf(e.level)); items = items.slice().sort((a, b) => li(a) - li(b)); }
    const aiRows = st.ai.map(e => entryCard(e, true));
    const rows = items.slice(0, st.shown).map(e => entryCard(e));
    res.append(h("div.faint.small", { style: { margin: "0 2px" } }, st.q ? `找到 ${items.length} 个` : `共 ${items.length} 个词`), ...aiRows, ...rows);
    if (items.length > st.shown) res.append(h("button.btn.block", { onclick: () => { st.shown += 60; draw(); } }, `显示更多（还有 ${items.length - st.shown} 个）`));
    if (st.q && items.length < 4 && !st.ai.length) {
      const b = h("button.btn.primary.block", { onclick: async () => {
        b.disabled = true; b.textContent = "AI 查询中…";
        try { const r = await api.post("api/ai/lookup", { q: st.q }); st.ai = r.entries || []; if (!st.ai.length) toast("AI 也没找到这个词"); draw(); }
        catch (e) { toast(e.message); b.disabled = false; b.textContent = `让 AI 查「${st.q}」`; }
      } }, ico("zap"), ` 让 AI 查「${st.q}」`);
      res.append(b);
    }
  }
  body.append(h("div.search", {}, h("span", { html: icon("search") }), input), h("div", { style: { height: "10px" } }), lvBox, h("div", { style: { height: "8px" } }), posBox, h("div", { style: { height: "12px" } }), res);
  drawChips(); draw();
}

/** 词条卡片：点开看例句、活用、联想；可朗读、加入生词本 */
function entryCard(e, ai) {
  const open = h("div", { hidden: true });
  const addBtn = h("button.icon-btn", { title: "加入生词本", "aria-label": "加入生词本" });
  const paintAdd = () => { const has = wordbook.has(e.word); addBtn.innerHTML = icon(has ? "check" : "plus"); addBtn.classList.toggle("fav-on", has); };
  paintAdd();
  addBtn.onclick = async ev => { ev.stopPropagation(); if (wordbook.has(e.word)) return toast("已经在生词本里了"); try { await wordbook.add(cardFromEntry(e, ai ? "ai" : "dict")); paintAdd(); } catch (err) { toast(err.message); } };
  const card = h("div.card.tap", { onclick: () => { open.hidden = !open.hidden; if (!open.hidden && !open.childElementCount) fillDetail(); } },
    h("div.row", {},
      h("div.grow", {}, h("div", { style: { display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" } },
        h("b.ja", { style: { fontSize: "20px" } }, e.word), e.kana && e.kana !== e.word ? h("span.muted", {}, e.kana) : null,
        e.level ? h("span.badge", {}, e.level) : null, e.pos ? h("span.badge.pink", {}, e.pos) : null, ai ? h("span.badge.ok", {}, "AI") : null),
        h("div.muted", {}, (e.meanings || []).join("；"))),
      bindSpeak(iconBtn("speaker", "朗读", null), () => e.kana || e.word), addBtn), open);
  function fillDetail() {
    if (e.romaji) open.append(h("div.faint.small", { style: { marginTop: "8px" } }, e.romaji));
    (e.examples || []).forEach(x => open.append(h("div.ex", {}, bindSpeak(iconBtn("speaker", "朗读", null), () => x.ja),
      h("div.grow", { onclick: ev => { ev.stopPropagation(); showAnalyze(x.ja); } }, h("div.ja-t", {}, x.ja), x.romaji ? h("div.kana", {}, x.romaji) : null, x.zh ? h("div.zh", {}, x.zh) : null))));
    if (e.conjugations && Object.keys(e.conjugations).length) open.append(h("div.small", { style: { margin: "6px 0" } }, ...Object.entries(e.conjugations).map(([k, v]) => h("span", { style: { marginRight: "14px" } }, h("span.faint", {}, k + " "), h("b.ja", {}, v)))));
    if (e.association) open.append(h("div.note-box", { style: { margin: "6px 0" } }, "💭 " + e.association));
    if (e.note) open.append(h("div.note-box", { style: { margin: "6px 0" } }, "📝 " + e.note));
    const rel = [...(e.related || []), ...(e.synonyms || [])];
    if (rel.length) open.append(h("div.small.muted", {}, "相关：" + rel.join("、")));
  }
  return card;
}

/* ═════════════ 翻译 ═════════════ */
const LANGS = { zh: "中文", ja: "日语", en: "英语", fr: "法语" };
const VOICE = { zh: "zh-CN-XiaoxiaoNeural", en: "en-US-JennyNeural", fr: "fr-FR-DeniseNeural" };
const TAG = { zh: "zh-CN", ja: "ja-JP", en: "en-US", fr: "fr-FR" };
const speakOpts = lang => ({ voice: lang === "ja" ? undefined : VOICE[lang], lang: TAG[lang], raw: lang !== "ja" });

async function translate(body, cleanups) {
  await wordbook.load().catch(() => {});
  const st = { src: "zh", targets: ["ja"] };
  const ta = h("textarea", { placeholder: "输入要翻译的句子…", maxLength: 500 });
  const srcBox = h("div"), tgBox = h("div"), out = h("div.stack", { style: { marginTop: "14px" } });
  const draw = () => {
    srcBox.textContent = ""; tgBox.textContent = "";
    st.targets = st.targets.filter(t => t !== st.src); if (!st.targets.length) st.targets = [st.src === "ja" ? "zh" : "ja"];
    srcBox.append(seg([["zh", "中文"], ["ja", "日本語"], ["en", "English"]], st.src, v => { st.src = v; draw(); }));
    tgBox.append(chips(Object.entries(LANGS).filter(([k]) => k !== st.src), st.targets, v => { st.targets = st.targets.includes(v) ? st.targets.filter(x => x !== v) : [...st.targets, v].slice(-3); draw(); }, { multi: true }));
  };
  draw();
  let ctl = null; cleanups.push(() => ctl?.abort());
  const go = h("button.btn.primary.block", { onclick: async () => {
    const text = ta.value.trim(); if (!text) return toast("先输入要翻译的内容");
    ctl?.abort(); ctl = new AbortController();
    go.disabled = true; out.textContent = ""; out.append(spinner("AI 翻译中…"));
    try { const targets = [...st.targets]; show(out, text, await api.post("api/ai/translate", { text, src: st.src, targets }, ctl.signal), targets[0]); }
    catch (e) { out.textContent = ""; if (e.name !== "AbortError") out.append(errBox(e)); }
    go.disabled = false;
  } }, ico("translate"), " 翻译");
  body.append(h("div.stack", {}, srcBox, ta, h("div.small.muted", {}, "翻译成（最多 3 种）"), tgBox, go), out);
  const show = (box, text, d, tl) => {
    box.textContent = "";
    (d.results || []).forEach(r => box.append(h("div.card", {},
      h("div.row", {}, h("span.badge", {}, LANGS[r.lang] || r.lang), h("div.grow"), bindSpeak(iconBtn("speaker", "朗读", null), () => r.text, () => speakOpts(r.lang)),
        iconBtn("copy", "复制", () => copyText(r.text)), r.lang === "ja" ? iconBtn("search", "解析", () => showAnalyze(r.text)) : null),
      h("div", { style: { fontSize: "19px", fontWeight: 600, margin: "4px 0", lineHeight: 1.5 } }, r.text), r.reading ? h("div.faint.small", {}, r.reading) : null)));
    if (d.replies?.length) box.append(h("h2.sec", {}, "可以这样回 / 接话"), ...d.replies.map(r => h("div.card.flat.row", {},
      h("div.grow", {}, h("div", { style: { fontWeight: 600 } }, r.text), r.zh ? h("div.muted.small", {}, r.zh) : null),
      bindSpeak(iconBtn("speaker", "朗读", null), () => r.text, () => speakOpts(tl)), iconBtn("copy", "复制", () => copyText(r.text)))));
    if (d.grammar?.length) box.append(h("h2.sec", {}, "译文语法"), ...d.grammar.map(g => h("div", { style: { margin: "4px 0" } }, h("b", {}, g.point), h("span.muted", {}, "　" + g.note))));
    if (d.words?.length) box.append(h("h2.sec", {}, "译文生词"), ...d.words.map(w => {
      const b = h("button.icon-btn", { title: "加入生词本", html: icon(wordbook.has(w.w) ? "check" : "plus") });
      b.onclick = async () => { if (wordbook.has(w.w)) return; try { await wordbook.add({ word: w.w, kana: w.r && w.r !== w.w && tl === "ja" ? w.r : "", meaning: w.m || "", example_ja: tl === "ja" ? (d.results.find(r => r.lang === "ja")?.text || "") : "", source: "translate" }); b.innerHTML = icon("check"); } catch (e) { toast(e.message); } };
      return h("div.row", { style: { padding: "3px 0" } }, h("b", {}, w.w), h("span.muted", {}, w.r || ""), h("span.grow", { style: { textAlign: "right" } }, w.m), b);
    }));
  };
}

/* ═════════════ 生词本 ═════════════ */
async function book(body) {
  const st = { filter: "all", q: "", items: [], total: 0, stats: null };
  const bar = h("div"), search = h("input", { type: "search", placeholder: "搜索生词", oninput: () => { st.q = search.value.trim(); reload(); } });
  const list = h("div.list"), more = h("div");
  const FILTERS = [["all", "全部"], ["due", "待复习"], ["new", "新词"], ["weak", "易错"], ["mastered", "已掌握"]];

  async function reload() {
    list.textContent = ""; list.append(spinner());
    try {
      const [r, s] = await Promise.all([api.get(`api/cards?filter=${st.filter}&q=${encodeURIComponent(st.q)}&limit=50`), api.get("api/stats")]);
      st.items = r.items; st.total = r.total; st.stats = s; await wordbook.load(true); draw();
    } catch (e) { list.textContent = ""; list.append(errBox(e, reload)); }
  }
  async function loadMore() {
    const r = await api.get(`api/cards?filter=${st.filter}&q=${encodeURIComponent(st.q)}&limit=50&offset=${st.items.length}`);
    st.items.push(...r.items); draw();
  }
  function draw() {
    const s = st.stats;
    bar.textContent = "";
    bar.append(h("div.row.wrap", {}, h("div.grow.small.muted", {}, `共 ${s.total_cards} 个 · 待复习 ${s.due} · 已掌握 ${s.mastered}`),
      h("button.btn.sm", { onclick: openImport }, "从词库导入"), h("button.btn.sm.primary", { onclick: openAdd }, ico("plus"), " 添加")),
      h("div", { style: { height: "10px" } }), h("div.chips.scroll", {}, ...FILTERS.map(([v, t]) => h("button.chip" + (st.filter === v ? ".on" : ""), { onclick: () => { st.filter = v; reload(); } }, t))));
    list.textContent = "";
    if (!st.items.length) {
      list.append(st.q || st.filter !== "all" ? empty("🔎", "没有符合的词") : empty("📒", "生词本是空的", "在词典里点 ＋ 添加，或从词库批量导入 N5 基础词", h("button.btn.primary", { onclick: openImport }, "导入 N5 词库")));
    } else st.items.forEach(c => list.append(cardRow(c)));
    more.textContent = "";
    if (st.items.length < st.total) more.append(h("button.btn.block", { onclick: loadMore }, `加载更多（${st.total - st.items.length}）`));
    if (s.due) more.append(h("a.btn.primary.lg.block", { href: "#/review", style: { marginTop: "12px" } }, `开始复习（${s.due}）`));
  }
  function cardRow(c) {
    const open = h("div", { hidden: true });
    const nextTxt = c.reps === 0 && c.lapses === 0 ? "新词" : c.due <= Date.now() / 1000 ? "待复习" : `${Math.max(1, Math.round((c.due - Date.now() / 1000) / 86400))} 天后`;
    const row = h("div.card.tap", { onclick: () => { open.hidden = !open.hidden; } },
      h("div.row", {}, h("div.grow", {}, h("div", { style: { display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" } }, h("b.ja", { style: { fontSize: "19px" } }, c.word),
        c.kana ? h("span.muted", {}, c.kana) : null, h("span.badge" + (nextTxt === "待复习" ? ".pink" : ""), {}, nextTxt)), h("div.muted", {}, c.meaning || "（没有释义）")),
        bindSpeak(iconBtn("speaker", "朗读", null), () => c.kana || c.word)),
      open);
    open.append(
      c.example_ja ? h("div.ex", {}, bindSpeak(iconBtn("speaker", "朗读", null), () => c.example_ja), h("div.grow", {}, h("div.ja-t", {}, c.example_ja), c.example_zh ? h("div.zh", {}, c.example_zh) : null)) : null,
      c.note ? h("div.note-box", {}, c.note) : null,
      h("div.row.small.faint", { style: { marginTop: "8px" } }, h("span.grow", {}, `复习 ${c.reps} 次 · 忘记 ${c.lapses} 次` + (c.source ? " · 来源：" + ({ dict: "词典", chat: "对话", analyze: "句子解析", translate: "翻译", ai: "AI 查词", import: "词库导入", manual: "手动" }[c.source] || c.source) : "")),
        h("button.btn.sm.danger", { onclick: async ev => { ev.stopPropagation(); if (await confirmBox(`删除「${c.word}」？复习记录也会一起删掉。`, "删除", true)) { await api.del("api/cards/" + c.id); toast("已删除"); reload(); } } }, ico("trash"), " 删除")));
    return row;
  }

  function openAdd() {
    sheet("添加生词", (b, close) => {
      const w = h("input", { type: "text", placeholder: "单词（汉字或假名）", maxLength: 60 }), m = h("input", { type: "text", placeholder: "中文释义（留空则让 AI 补全）", maxLength: 200 });
      const ok = h("button.btn.primary.block", { onclick: async () => {
        const word = w.value.trim(); if (!word) return toast("请输入单词");
        ok.disabled = true; ok.textContent = "保存中…";
        try {
          let card = { word, meaning: m.value.trim(), source: "manual" };
          if (!card.meaning) {
            ok.textContent = "AI 补全中…";
            const e = (await api.post("api/ai/lookup", { q: word })).entries?.[0];
            if (e) card = { ...cardFromEntry(e, "manual"), word };
          }
          await wordbook.add(card); close(); reload();
        } catch (e) { toast(e.message); ok.disabled = false; ok.textContent = "保存"; }
      } }, "保存");
      b.append(h("div.stack", {}, w, m, ok));
    });
  }
  async function openImport() {
    const all = await content("dictionary.json"); await wordbook.load(true);
    sheet("从词库导入", (b, close) => {
      b.append(h("p.muted.small", { style: { marginBottom: "10px" } }, "把词典里的词按 JLPT 级别批量加入生词本（已有的词会跳过）。导入后每次复习 20 张一组，不会一下子压过来。"));
      LEVELS.forEach(lv => {
        const ws = all.filter(e => e.level === lv), fresh = ws.filter(e => !wordbook.has(e.word));
        const btn = h("button.btn.sm.primary", { disabled: !fresh.length, onclick: async () => {
          btn.disabled = true; btn.textContent = "导入中…";
          try { const r = await api.post("api/cards/bulk", { cards: fresh.map(e => cardFromEntry(e, "import")) }); toast(`已导入 ${r.added} 个词`); close(); reload(); }
          catch (e) { toast(e.message); btn.disabled = false; btn.textContent = "导入"; }
        } }, fresh.length ? "导入" : "已全部导入");
        b.append(h("div.row", { style: { padding: "8px 0", borderBottom: "1px solid var(--line)" } }, h("b", { style: { width: "36px" } }, lv), h("div.grow.small.muted", {}, `${ws.length} 词，其中 ${fresh.length} 个还没在生词本`), btn));
      });
    });
  }

  body.append(h("div.search", {}, h("span", { html: icon("search") }), search), h("div", { style: { height: "10px" } }), bar, h("div", { style: { height: "10px" } }), list, more);
  await reload();
}
