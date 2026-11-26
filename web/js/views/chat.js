/* 日语对话：选场景 → 语音/打字聊天 → 提示、纠错、点词解析 → 结束后 AI 复盘并把生词加入生词本。对话记录存服务端。 */
import { h, iconBtn, toast, sheet, confirmBox, spinner } from "../ui.js";
import { api, errBox, LS } from "../api.js";
import { settings, wordbook, LEVELS } from "../store.js";
import { icon } from "../icons.js";
import { Speaker, sentenceSplitter, startRecording, unlock, stopAll, bindSpeak, onFallback, prefetch, say, MALE, FEMALE } from "../audio.js";
import { showAnalyze } from "../analyze.js";

const SCENES = [["🍜", "餐厅"], ["✈️", "机场"], ["🛍️", "购物"], ["🗺️", "问路"], ["🚕", "打车"], ["🏥", "看病"], ["🎫", "买票"], ["🏨", "酒店"], ["💼", "面试"], ["📱", "打电话"], ["🏫", "学校"], ["🏯", "京都旅行"]];

export async function mount(root) {
  root.style.overflow = "hidden";
  const S = { id: 0, scenario: "餐厅", messages: [], hint: null, busy: false, rec: null, speaker: null, abort: null, started: false, stt: true, dead: false, auto: false, replay: null, annotating: false, roma: LS.get("chat_romaji", "0") === "1", defaultVoice: FEMALE, viewing: null, text: false };
  const wrap = h("div.chat-wrap");
  root.append(wrap);

  /* ───── 骨架 ───── */
  const title = h("b", {}, "日语对话");
  const endBtn = h("button.btn.sm.ghost", { title: "结束本次对话，让 AI 复盘", onclick: () => endSession() }, h("span", { html: icon("review") }), "结束复盘"); endBtn.hidden = true;
  const historyBtn = iconBtn("history", "本场景的历史对话", () => showHistorySheet()); historyBtn.hidden = true;
  const levelSel = h("select.level-sel", { title: "对话难度", "aria-label": "对话难度" }, ...LEVELS.map(l => h("option", { value: l }, { N5: "N5 入门", N4: "N4 初级", N3: "N3 中级", N2: "N2 中高级", N1: "N1 高级" }[l])));
  levelSel.value = settings.level();
  levelSel.addEventListener("change", () => { settings.set("level", levelSel.value); if (S.started) toast(`下一句回复起使用 ${levelSel.value} 难度`); });
  const autoBtn = h("button.btn.sm.auto-btn", { onclick: () => setAuto(!S.auto) }, "▶ 自动对话");
  const playBtn = h("button.btn.sm.play-btn", { title: "用两种声音从第一句播放到最后一句", onclick: () => (S.replay ? stopReplay() : replayAll()) }, "🎧 完整对话");
  const toggle = (label, on, change) => { const c = h("input", { type: "checkbox" }); c.checked = on; c.addEventListener("change", () => change(c.checked)); return h("label.check.mini", {}, c, label); };
  const zhToggle = toggle("翻译", settings.bool("open_zh"), on => { settings.set("open_zh", on ? "1" : "0"); refreshAll(); annotate(); });
  const romaToggle = toggle("罗马音", S.roma, on => { S.roma = on; LS.set("chat_romaji", on ? "1" : "0"); refreshAll(); annotate(); });
  const tools = h("div.chat-tools", {}, autoBtn, playBtn, zhToggle, romaToggle);
  const msgs = h("div.msgs", { "aria-live": "polite" });
  const talkLabel = h("span", {}, "点击或长按说话");
  const talk = h("button.talk", {}, h("span.wave", {}, h("b"), h("b"), h("b"), h("b"), h("b")), talkLabel);
  const cancelRec = iconBtn("x", "取消录音", () => cancelRecording()); cancelRec.hidden = true;
  const kbBtn = iconBtn("keyboard", "切换到打字", () => showText(true));
  const voiceRow = h("div.row", {}, talk, cancelRec, kbBtn);
  const input = h("input", { type: "text", lang: "ja", autocomplete: "off", placeholder: "日本語で入力…", onkeydown: e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); sendTyped(); } } });
  const sendBtn = h("button.icon-btn.on", { "aria-label": "发送", html: icon("up"), onclick: () => sendTyped() });
  const micBtn = iconBtn("mic", "切换到语音", () => showText(false));
  const textRow = h("div.row", { hidden: true }, micBtn, input, sendBtn);
  const reviewBtn = h("button.btn.sm.primary", { onclick: () => reviewHistory() }, "查看复盘");
  const viewRow = h("div.row", { hidden: true }, h("button.btn.sm.ghost", { onclick: () => leaveHistory() }, "‹ 返回"), reviewBtn, h("span.grow"), h("button.btn.sm.danger", { onclick: () => deleteHistory() }, "删除"));
  const bottom = h("div.chat-bottom", { hidden: true }, viewRow, voiceRow, textRow, tools);
  const banner = h("div.err", { hidden: true, style: { margin: "8px 14px 0", borderRadius: "10px" } });
  wrap.append(h("div.chat-top", {}, levelSel, title, historyBtn, endBtn), banner, msgs, bottom);
  // 点任意朗读按钮时，让出播放器：结束整段播放
  msgs.addEventListener("click", e => { if (e.target.closest(".spk")) stopReplay(false); }, true);

  const scrollDown = () => requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
  onFallback(() => toast("神经网络语音暂不可用，已改用浏览器朗读"));

  /* ───── 自动对话：按 AI 给的提示一直聊下去 ───── */
  function setAuto(on) {
    S.auto = on;
    autoBtn.classList.toggle("on", on);
    autoBtn.textContent = on ? "■ 停止对话" : "▶ 自动对话";
    if (on) stopReplay();
    if (on) { unlock(); cancelRecording(); if (!S.busy && S.messages.at(-1)?.role === "assistant") autoNext(Promise.resolve()); }
  }
  async function autoNext(spDone) {
    await spDone;                                   // 等 AI 读完
    if (!S.auto || S.dead || S.busy) return;
    if (!S.hint?.ja) { setAuto(false); toast("AI 没有给出提示，自动对话已停止"); return; }
    sendUser(S.hint.ja, S.hint.zh || "", true);   // 先出文字，再读出来；同时 AI 已开始生成回复
  }

  /* ───── 两个角色的声音：AI 用设置里的声音，我方用另一种性别 ───── */
  const aiVoice = () => settings.get("voice") || S.defaultVoice;
  const myVoice = () => (aiVoice() === MALE ? FEMALE : MALE);
  const voiceOf = role => ({ voice: role === "user" ? myVoice() : aiVoice() });

  /* ───── 完整对话：从头播放现有对话 ───── */
  async function replayAll() {
    setAuto(false);
    if (S.busy || S.rec) { toast("等当前这句结束再播放"); return; }
    if (!S.messages.length) { toast("还没有可以播放的对话"); return; }
    unlock(); stopSpeaking();
    const run = S.replay = {};
    playBtn.classList.add("on"); playBtn.textContent = "■ 停止播放";
    const rows = [...msgs.querySelectorAll(".bubble-row")].filter(r => r._msg);
    for (const row of rows) {
      if (S.replay !== run) return;
      row.classList.add("playing"); row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const next = rows[rows.indexOf(row) + 1];
      if (next) prefetch(next._msg.content, voiceOf(next._msg.role).voice);
      await say(row._msg.content, voiceOf(row._msg.role));
      row.classList.remove("playing");
    }
    if (S.replay === run) stopReplay(false);
  }
  function stopReplay(silence = true) {
    if (!S.replay) return;
    S.replay = null; playBtn.classList.remove("on"); playBtn.textContent = "🎧 完整对话";
    msgs.querySelectorAll(".playing").forEach(r => r.classList.remove("playing"));
    if (silence) stopAll();
  }

  /* ───── 翻译与罗马音 ───── */
  const scrollIfIdle = () => { if (!S.replay) scrollDown(); };
  function refreshRow(row) {
    const m = row._msg; if (!m) return;
    const showZh = zhToggle.firstChild.checked;
    row._zh.textContent = m.zh || ""; row._zh.hidden = !(showZh && m.zh);
    row._zhBtn.disabled = !m.zh; row._zhBtn.classList.toggle("on", !row._zh.hidden);
    row._roma.textContent = m.romaji || ""; row._roma.hidden = !(S.roma && m.romaji);
  }
  function refreshAll() { msgs.querySelectorAll(".bubble-row").forEach(refreshRow); }
  // 缺翻译或罗马音的句子，按需向 AI 批量要，结果随对话一起保存
  async function annotate() {
    if (S.annotating) return;
    S.annotating = true;
    try {
      for (;;) {
        const showZh = zhToggle.firstChild.checked, list = S.messages;
        const todo = list.filter(m => (showZh && !m.zh) || (S.roma && !m.romaji)).slice(0, 20);
        if (!todo.length || S.dead) break;
        const { items } = await api.post("api/ai/annotate", { texts: todo.map(m => m.content) });
        todo.forEach((m, i) => { m.zh ||= items[i].zh; m.romaji ||= items[i].romaji; });
        if (S.messages !== list) continue;       // 期间换了一场对话
        refreshAll(); save(); scrollIfIdle();
        if (todo.some(m => (showZh && !m.zh) || (S.roma && !m.romaji))) break;   // AI 给了空结果，不反复请求
      }
    } catch (e) { toast("翻译/罗马音获取失败：" + e.message); }
    finally { S.annotating = false; }
  }

  /* ───── 欢迎页 ───── */
  function showWelcome() {
    setAuto(false); stopReplay();
    S.started = false; S.messages = []; S.hint = null; S.id = 0;
    setMode("welcome"); msgs.textContent = ""; msgs.scrollTop = 0; title.textContent = "日语对话";
    const custom = h("input", { type: "text", maxLength: 30, placeholder: "或者自己写场景：订酒店、面试、租房…" });
    const grid = h("div.scene-grid");
    const history = h("div");
    let counts = new Map(), asked = 0;
    const chosen = () => (custom.value.trim() || S.scenario).slice(0, 30);
    const draw = () => {
      grid.textContent = "";
      const own = [...counts.keys()].filter(n => !SCENES.some(s => s[1] === n)).map(n => ["📝", n]);   // 自己写过的场景
      [...SCENES, ...own].forEach(([e, n]) => grid.append(h("button.scene" + (n === chosen() ? ".on" : ""), { onclick: () => { S.scenario = n; custom.value = ""; draw(); loadHistory(); } },
        h("span.e", {}, e), n, counts.get(n) ? h("span.badge", { title: "历史对话数" }, counts.get(n)) : null)));
    };
    const loadHistory = async () => {
      const t = ++asked, name = chosen();
      try {
        const items = await fetchHistory(name);
        if (t !== asked || !history.isConnected) return;
        history.textContent = "";
        if (items.length) history.append(h("h2.sec", {}, `「${name}」的历史对话（${items.length}）`), historyList(items, id => openHistory(id)));
      } catch (e) { if (t === asked) history.textContent = "历史对话加载失败：" + e.message; }
    };
    let typing = 0;
    custom.addEventListener("input", () => { draw(); clearTimeout(typing); typing = setTimeout(loadHistory, 400); });
    draw();
    api.get("api/chat/scenes").then(r => { counts = new Map(r.items.map(x => [x.scenario, x.n])); draw(); }).catch(() => {});
    msgs.append(h("div.stack", { style: { maxWidth: "520px", margin: "0 auto", width: "100%", paddingTop: "8px" } },
      h("div", { style: { textAlign: "center" } }, h("div", { style: { width: "64px", height: "64px", borderRadius: "50%", background: "var(--sakura-soft)", color: "var(--sakura)", display: "grid", placeItems: "center", margin: "0 auto 10px", fontSize: "30px", fontWeight: 800 } }, "さ"),
        h("h1", { style: { fontSize: "21px" } }, "和さくら聊日语"), h("p.muted.small", {}, "选一个场景。可以说话，也可以打字；不会说就点“给我一个提示”。")),
      grid, custom, history,
      h("div.sticky-cta", {}, h("button.btn.primary.lg.block", { onclick: () => begin(chosen()) }, "开始对话"))));
    loadHistory();
  }

  /* ───── 历史对话：按场景回看和复习（数据在服务端 SQLite） ───── */
  // 三种界面：welcome 选场景 / live 对话中 / view 回看历史
  function setMode(mode) {
    const view = mode === "view", live = mode === "live";
    if (!view) S.viewing = null;
    bottom.hidden = mode === "welcome"; viewRow.hidden = !view;
    voiceRow.hidden = view || S.text; textRow.hidden = view || !S.text;
    autoBtn.hidden = view; endBtn.hidden = !live; historyBtn.hidden = !live; levelSel.hidden = view;
  }
  const fetchHistory = async name => (await api.get(`api/chat/sessions?limit=500&scenario=${encodeURIComponent(name)}`)).items;
  const when = ts => new Date(ts * 1000).toLocaleString("zh-CN", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const historyList = (items, open) => h("div.list", {}, ...items.map(it => h("button.card.tap.history-item", { onclick: () => open(it.id) },
    h("div.row", {}, h("b.grow", {}, when(it.started)), h("span.badge", {}, it.level), it.has_review ? h("span.badge.ok", {}, "已复盘") : null, h("span.faint.small", {}, `${it.count} 句`)),
    h("div.muted.small", {}, it.preview))));
  function showHistorySheet() {
    const name = S.scenario;
    sheet(`「${name}」的历史对话`, (body, close) => {
      const load = async () => {
        body.textContent = ""; body.append(spinner("加载中…"));
        try {
          const items = (await fetchHistory(name)).filter(it => it.id !== S.id);
          body.textContent = "";
          body.append(items.length ? historyList(items, id => { close(); openHistory(id); }) : h("p.muted", {}, "这个场景还没有其他历史对话。"));
        } catch (e) { body.textContent = ""; body.append(errBox(e, load)); }
      };
      load();
    });
  }
  async function openHistory(id) {
    setAuto(false);
    if (S.busy) { toast("等对方说完再查看历史"); return; }
    stopSpeaking(); cancelRecording(); unlock();
    const back = S.started ? S.id : 0;
    let d;
    try { d = await api.get(`api/chat/sessions/${id}`); } catch (e) { toast(e.message); return; }
    if (S.dead) return;
    setMode("view"); S.viewing = { back, review: d.review, level: d.level };
    Object.assign(S, { id: d.id, scenario: d.scenario, messages: d.messages, hint: d.hint, started: false });
    title.textContent = `${d.scenario} · ${new Date(d.started * 1000).toLocaleDateString("zh-CN")}`;
    reviewBtn.textContent = d.review ? "查看复盘" : "生成复盘";
    drawAll(); msgs.scrollTop = 0; requestAnimationFrame(() => { msgs.scrollTop = 0; }); annotate();
  }
  async function leaveHistory() {
    stopSpeaking();
    const back = S.viewing?.back;
    if (back) {
      try { const d = await api.get(`api/chat/sessions/${back}`); if (!S.dead) resume(d); return; } catch (e) { toast(e.message); }
    }
    showWelcome();
  }
  async function deleteHistory() {
    const id = S.id;
    if (!(await confirmBox("删除这条历史对话？删除后无法恢复。", "删除", true))) return;
    try { await api.del(`api/chat/sessions/${id}`); } catch (e) { toast(e.message); return; }
    if (S.viewing && S.id === id) leaveHistory();
  }
  function reviewHistory() {
    const v = S.viewing, id = S.id, scenario = S.scenario, messages = S.messages.slice(-80);
    sheet("对话复盘", body => {
      const out = h("div"); body.append(out);
      const run = async () => {
        if (v.review) { fillReview(out, v.review); return; }
        out.textContent = ""; out.append(spinner("AI 教练正在复盘…"));
        try { v.review = await api.post("api/ai/chat-review", { session_id: id, scenario, level: v.level, messages }); reviewBtn.textContent = "查看复盘"; fillReview(out, v.review); }
        catch (e) { out.textContent = ""; out.append(errBox(e, run)); }
      };
      run();
    });
  }
  function resume(d) {
    setMode("live");
    Object.assign(S, { id: d.id, scenario: d.scenario, messages: d.messages, hint: d.hint, started: true });
    title.textContent = S.scenario; drawAll(); annotate();
    if (S.messages.at(-1)?.role === "user") addRetry("上次的回复没收到");
  }

  async function begin(scenario) {
    unlock();
    S.scenario = scenario; S.started = true; S.messages = []; S.hint = null;
    try { S.id = (await api.post("api/chat/sessions", { scenario, level: settings.level() })).id; } catch (e) { toast(e.message); S.started = false; return; }
    msgs.textContent = ""; setMode("live"); title.textContent = scenario;
    askAI();
  }

  /* ───── 渲染 ───── */
  function renderMsg(m) {
    const row = h("div.bubble-row " + (m.role === "user" ? "me" : "ai"));
    const ja = h("div.ja", {}, m.content);
    const acts = h("div.acts", {}, bindSpeak(iconBtn("speaker", "朗读", null, "spk"), () => ja.textContent, () => voiceOf(m.role)), iconBtn("search", "解析这句", () => showAnalyze(ja.textContent)));
    const roma = h("div.roma", { hidden: true });
    const bub = h("div.bubble", {}, ja, roma);
    const zh = h("div.zh", { hidden: true });
    {
      const zhBtn = iconBtn("translate", "翻译", () => { if (!zh.textContent.trim()) return; zh.hidden = !zh.hidden; zhBtn.classList.toggle("on", !zh.hidden); scrollDown(); });
      zhBtn.disabled = true;
      acts.append(zhBtn); bub.append(acts, zh); row._zh = zh; row._zhBtn = zhBtn;
    }
    row.append(bub); row._ja = ja; row._roma = roma;
    if (m.content) { row._msg = m; refreshRow(row); }
    return row;
  }
  const fixNote = t => h("div.fix", {}, "💡 " + t);
  function drawAll() {
    msgs.textContent = "";
    S.messages.forEach(m => { msgs.append(renderMsg(m)); if (m.fix && settings.bool("show_fix")) msgs.append(fixNote(m.fix)); });
    drawHint(); scrollDown();
  }
  function drawHint() {
    msgs.querySelectorAll(".hint-box").forEach(x => x.remove());
    const hint = S.hint; if (!hint?.ja || S.viewing) return;
    const card = h("div.hint-card", { hidden: true },
      h("div.h-ja", {}, hint.ja), hint.kana && hint.kana !== hint.ja ? h("div.faint.small", {}, hint.kana) : null, hint.zh ? h("div.muted.small", {}, hint.zh) : null,
      h("div.row", { style: { marginTop: "8px" } }, bindSpeak(h("button.btn.sm.spk", {}, "🔊 听一听"), () => hint.ja, () => voiceOf("user")), h("button.btn.sm.primary", { onclick: () => sendUser(hint.ja, hint.zh) }, "就说这句")));
    const bar = h("button.btn.sm", { onclick: () => { card.hidden = !card.hidden; scrollDown(); } }, "💡 给我一个提示");
    msgs.append(h("div.hint-box", {}, bar, card)); scrollDown();
  }
  const save = () => api.put(`api/chat/sessions/${S.id}`, { messages: S.messages.slice(-1000), hint: S.hint, seconds: 0 }).catch(() => {});

  /* ───── 与 AI 往来 ───── */
  async function askAI() {
    const gate = S.gate || Promise.resolve(); const gated = !!S.gate; S.gate = null;   // gate：我方这句读完前，AI 的声音先不出
    S.busy = true; S.hint = null; drawHint(); setTalk(); if (!gated) stopSpeaking();
    const row = renderMsg({ role: "assistant", content: "" }); row.classList.add("typing"); msgs.append(row); scrollDown();
    let spEnd; const spDone = new Promise(r => { spEnd = r; });
    const sp = S.speaker = new Speaker(() => { if (S.speaker === sp) S.speaker = null; spEnd(); });
    let ok = false;
    const split = sentenceSplitter(s => { if (S.auto || settings.bool("autoplay")) { prefetch(s); gate.then(() => sp.enqueue(s)); } });
    let text = "";
    S.abort = new AbortController();
    try {
      let final = null;
      await api.sse("api/chat", { messages: S.messages.slice(-20).map(m => ({ role: m.role, content: m.content })), scenario: S.scenario, level: settings.level() }, ev => {
        if (ev.type === "ja") { text += ev.text; row._ja.textContent = text.trim(); split.feed(text); scrollDown(); }
        else if (ev.type === "done") final = ev;
      }, S.abort.signal);
      if (!final) throw new Error("回复被中断");
      const ja = (final.ja || text).trim();
      row._ja.textContent = ja; row.classList.remove("typing"); split.flush(text); gate.then(() => sp.close());
      const msg = { role: "assistant", content: ja, zh: final.zh || "" };
      S.messages.push(msg);
      row._msg = msg; refreshRow(row);
      const prev = S.messages[S.messages.length - 2];
      if (final.fix && prev?.role === "user") {
        prev.fix = final.fix;
        if (settings.bool("show_fix")) msgs.insertBefore(fixNote(final.fix), row);
      }
      S.hint = final.hint || null; drawHint(); save(); ok = true;
      if (S.auto && S.hint?.ja) prefetch(S.hint.ja, myVoice());
      annotate();
    } catch (e) {
      sp.stop(); row.remove();
      if (e.name !== "AbortError" && !S.dead) { addRetry(e.message); setAuto(false); }
    } finally { S.busy = false; S.abort = null; setTalk(); scrollDown(); }
    if (ok && S.auto) autoNext(spDone);
  }
  function addRetry(msg) {
    msgs.querySelector(".retry")?.remove();
    const box = h("div.err.retry", {}, "⚠️ " + msg + "　", h("button.btn.sm", { onclick: () => { box.remove(); askAI(); } }, "重试"));
    msgs.append(box); scrollDown();
  }
  function sendUser(text, zh = "", speakFirst = false) {
    text = (text || "").trim();
    if (!text || S.busy) return;
    stopSpeaking(); msgs.querySelector(".retry")?.remove();
    S.hint = null; drawHint();
    const m = { role: "user", content: text }; if (zh) m.zh = zh;
    S.messages.push(m); msgs.append(renderMsg(m)); scrollDown(); save();
    api.post("api/activity", { chat_turns: 1 }).catch(() => {});
    if (speakFirst) S.gate = new Promise(res => { const sp = S.userSp = new Speaker(() => { if (S.userSp === sp) S.userSp = null; res(); }, voiceOf("user")); sp.enqueue(text); sp.close(); });
    askAI();
    annotate();
  }
  function stopSpeaking() { stopReplay(); if (S.userSp) { S.userSp.stop(); S.userSp = null; } if (S.speaker) { S.speaker.stop(); S.speaker = null; } stopAll(); }

  /* ───── 录音 ───── */
  function setTalk() {
    const r = S.rec;
    talk.classList.toggle("rec", !!r && !r.transcribing);
    talk.classList.toggle("wait", !!(r && r.transcribing) || (S.busy && !r));
    talk.disabled = false;
    cancelRec.hidden = !(r && !r.transcribing); kbBtn.hidden = !!r;
    talkLabel.textContent = r ? (r.transcribing ? "识别中…" : "正在听…说完点一下") : S.busy ? "对方正在回复…" : "点击或长按说话";
    sendBtn.disabled = S.busy;
  }
  async function startRec() {
    if (S.rec || S.busy) return;
    unlock(); stopSpeaking();
    try {
      const hd = await startRecording({ onLevel: v => talk.style.setProperty("--lv", v.toFixed(2)), onAutoStop: () => finishRec() });
      S.rec = { h: hd, transcribing: false, t0: performance.now() }; setTalk();
    } catch (e) { toast(e.message); }
  }
  function cancelRecording() { if (!S.rec) return; try { S.rec.h.cancel(); } catch { /* */ } S.rec = null; setTalk(); }
  async function finishRec() {
    const r = S.rec; if (!r || r.transcribing) return;
    r.transcribing = true; setTalk();
    let text = "";
    try {
      const pcm = await r.h.stop();
      if (!pcm) toast("没听到声音，再试一次");
      else { text = await api.stt(pcm); if (!text) toast("没听清，请靠近一点再说"); }
    } catch (e) { toast(e.message); }
    S.rec = null; setTalk();
    if (text && !S.dead) sendUser(text);
  }
  let pressTimer = 0, held = false;
  talk.addEventListener("pointerdown", () => { if (S.rec) return; held = false; clearTimeout(pressTimer); pressTimer = setTimeout(() => { held = true; }, 400); startRec(); });
  talk.addEventListener("pointerup", () => { clearTimeout(pressTimer); if (held && S.rec && !S.rec.transcribing) { held = false; finishRec(); } });
  talk.addEventListener("click", () => { if (S.rec && !S.rec.transcribing && performance.now() - S.rec.t0 > 500 && !held) finishRec(); });
  talk.addEventListener("contextmenu", e => e.preventDefault());

  function showText(on) { S.text = on; voiceRow.hidden = on; textRow.hidden = !on; if (on) setTimeout(() => input.focus(), 50); }
  function sendTyped() { const v = input.value; if (!v.trim() || S.busy) return; input.value = ""; sendUser(v); }

  /* ───── 结束与复盘 ───── */
  async function endSession() {
    setAuto(false);
    if (S.busy) { toast("等对方说完再结束"); return; }
    const turns = S.messages.filter(m => m.role === "user").length;
    const markEnded = () => api.post(`api/chat/sessions/${S.id}/end`, {}).catch(() => {});
    if (turns < 1) { if (await confirmBox("还没开始说话，直接退出？", "退出")) { stopSpeaking(); cancelRecording(); markEnded(); showWelcome(); } return; }
    stopSpeaking(); cancelRecording(); markEnded();
    sheet("本次对话复盘", (body, close) => {
      const out = h("div", {}, spinner("AI 教练正在复盘…"));
      body.append(out);
      const run = async () => {
        out.textContent = ""; out.append(spinner("AI 教练正在复盘…"));
        try { fillReview(out, await api.post("api/ai/chat-review", { session_id: S.id, scenario: S.scenario, level: settings.level(), messages: S.messages.slice(-80) })); }
        catch (e) { out.textContent = ""; out.append(errBox(e, run)); }
      };
      run();
    }, { onClose: () => { if (!S.dead) showWelcome(); } });
  }
  function fillReview(out, d) {
    out.textContent = "";
    out.append(h("div.note-box", {}, d.summary || ""));
    if (d.good?.length) out.append(h("h2.sec", {}, "做得好"), ...d.good.map(g => h("div", {}, "✅ " + g)));
    if (d.fixes?.length) out.append(h("h2.sec", {}, "可以更自然"), ...d.fixes.map(f => h("div.card.flat", { style: { marginBottom: "8px" } },
      h("div.faint.small", { style: { textDecoration: "line-through" } }, f.orig), h("div", { style: { fontWeight: 600, fontSize: "16px" } }, f.better), h("div.muted.small", {}, f.why))));
    if (d.words?.length) {
      const addAll = h("button.btn.sm.primary", { onclick: async () => {
        addAll.disabled = true;
        try { const r = await api.post("api/cards/bulk", { cards: d.words.map(w => ({ word: w.w, kana: w.r && w.r !== w.w ? w.r : "", meaning: w.m || "", source: "chat" })) }); await wordbook.load(true); toast(`已加入 ${r.added} 个词`); addAll.textContent = "已加入"; }
        catch (e) { toast(e.message); addAll.disabled = false; }
      } }, "全部加入生词本");
      out.append(h("div.row", {}, h("h2.sec.grow", {}, "值得记的词"), addAll), ...d.words.map(w => h("div.row", { style: { padding: "4px 0" } }, h("b", {}, w.w), h("span.muted", {}, w.r && w.r !== w.w ? w.r : ""), h("span.grow", { style: { textAlign: "right" } }, w.m))));
    }
    if (d.next) out.append(h("h2.sec", {}, "下次可以练"), h("div", {}, d.next));
  }

  /* ───── 启动 ───── */
  try {
    const [{ session }, st] = await Promise.all([api.get("api/chat/sessions/latest"), api.get("api/voice/status").catch(() => null)]);
    if (st?.tts?.default_voice) S.defaultVoice = st.tts.default_voice;
    if (st && !st.stt.available) { S.stt = false; showText(true); micBtn.hidden = true; banner.hidden = false; banner.textContent = "服务器没装语音识别，只能打字"; }
    if (session && !session.review && !session.ended && session.messages.length) {
      resume(session);
    } else showWelcome();
  } catch (e) { banner.hidden = false; banner.textContent = "连不上后端：" + e.message; showWelcome(); }
  setTalk();

  return () => { S.dead = true; S.abort?.abort(); stopSpeaking(); cancelRecording(); root.style.overflow = ""; };
}
