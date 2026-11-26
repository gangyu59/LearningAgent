/* 录音（16kHz PCM16，说完自动停）与朗读（服务端 edge-tts，失败退回浏览器朗读）。 */
import { api, ApiError } from "./api.js";
import { settings } from "./store.js";
import { jaOnly } from "./ui.js";

/* ───────── 录音 ───────── */
function toPCM16(chunks, sr) {
  let n = 0; chunks.forEach(c => (n += c.length));
  const all = new Float32Array(n); let o = 0; chunks.forEach(c => { all.set(c, o); o += c.length; });
  const ratio = sr / 16000, len = Math.floor(n / ratio), out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const a = Math.floor(i * ratio), b = Math.min(n, Math.floor((i + 1) * ratio)); let s = 0;
    for (let k = a; k < b; k++) s += all[k];
    const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out.buffer;
}

/** 开始录音。opts.onLevel(0..1)；opts.onAutoStop() 检测到说完。返回 { stop(): Promise<ArrayBuffer|null>, cancel() } */
export async function startRecording(opts = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("此浏览器无法使用麦克风（需要 https 或 localhost）");
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
  catch { throw new Error("没有麦克风权限，请在浏览器设置里允许使用麦克风"); }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* */ } }
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  let spoke = false, lastVoice = 0, done = false;
  const started = performance.now(), THRESH = 0.02, SILENCE_MS = 1400, MAX_MS = 30000;
  proc.onaudioprocess = e => {
    if (done) return;
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
    const rms = Math.sqrt(s / d.length), now = performance.now();
    opts.onLevel?.(Math.min(1, rms * 8));
    if (rms > THRESH) { spoke = true; lastVoice = now; }
    if (opts.onAutoStop && ((spoke && now - lastVoice > SILENCE_MS) || now - started > MAX_MS)) { done = true; opts.onAutoStop(); }
  };
  src.connect(proc); proc.connect(ctx.destination);
  const sr = ctx.sampleRate;
  const close = () => { done = true; try { proc.disconnect(); src.disconnect(); ctx.close(); stream.getTracks().forEach(t => t.stop()); } catch { /* */ } };
  return {
    async stop() { close(); const n = chunks.reduce((a, c) => a + c.length, 0); return !spoke || n < sr * 0.4 ? null : toPCM16(chunks, sr); },
    cancel: close,
  };
}

/* ───────── 朗读 ───────── */
// 同一个 <audio> 反复使用：iOS 只允许被用户手势“解锁”过的元素在异步回调里播放
const el = new Audio();
el.preload = "auto";
let unlocked = false;
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  el.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
  el.play().catch(() => {});
}

const st = { fallback: false, onFallback: null, cache: new Map(), cancel: null, gen: 0 };
export const onFallback = fn => { st.onFallback = fn; };
export const FEMALE = "ja-JP-NanamiNeural", MALE = "ja-JP-KeitaNeural";
const prefs = () => ({ voice: settings.get("voice"), rate: +settings.get("rate") || 0 });

function fetchSeg(text, voice, rate) {
  const key = voice + "|" + rate + "|" + text;
  if (!st.cache.has(key)) {
    const p = api.tts(text, voice, rate);
    p.catch(() => st.cache.delete(key));
    st.cache.set(key, p);
    if (st.cache.size > 60) st.cache.delete(st.cache.keys().next().value);
  }
  return st.cache.get(key);
}
export const prefetch = (text, voice, rate) => { fetchSeg(jaOnly(text), voice ?? prefs().voice, rate ?? prefs().rate).catch(() => {}); };

function playBlob(blob) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(blob);
    const finish = fn => { el.onended = el.onerror = null; st.cancel = null; URL.revokeObjectURL(u); fn(); };
    el.onended = () => finish(resolve);
    el.onerror = () => finish(() => reject(new Error("播放失败")));
    el.src = u;
    el.play().catch(err => finish(() => reject(err)));
    st.cancel = () => finish(resolve);
  });
}
function speakFallback(text, lang, rate) {
  return new Promise(resolve => {
    if (!window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = 1 + rate / 100;
    const v = speechSynthesis.getVoices().find(x => x.lang.replace("_", "-").startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    u.onend = u.onerror = () => resolve();
    st.cancel = () => { speechSynthesis.cancel(); resolve(); };
    speechSynthesis.speak(u);
  });
}

/** 朗读一句，播放完成（或被 stopAll 打断）后 resolve。opts: {voice, rate, lang} */
export async function say(text, opts = {}) {
  text = opts.raw ? (text || "").trim() : jaOnly(text);
  if (!text) return;
  unlock();
  const p = prefs(), voice = opts.voice ?? p.voice, rate = opts.rate ?? p.rate, lang = opts.lang || "ja-JP";
  const gen = st.gen;
  if (!st.fallback) {
    try {
      const blob = await fetchSeg(text, voice, rate);
      if (gen !== st.gen) return;
      await playBlob(blob);
      return;
    } catch (e) {
      if (gen !== st.gen) return;
      if (!(e instanceof ApiError && e.status === 401)) { st.fallback = true; st.onFallback?.(e); }
    }
  }
  if (gen === st.gen) await speakFallback(text, lang, rate);
}
export function stopAll() {
  st.gen++;
  try { el.onended = el.onerror = null; el.pause(); } catch { /* */ }
  try { st.cancel?.(); } catch { /* */ }
  try { window.speechSynthesis?.cancel(); } catch { /* */ }
}

/** 按钮朗读：点一下播，再点停；播放时按钮加 .on */
export function bindSpeak(btn, getText, opts) {
  btn.addEventListener("click", async e => {
    e.stopPropagation();
    if (btn.classList.contains("on")) { stopAll(); document.querySelectorAll(".sp-on").forEach(b => b.classList.remove("on", "sp-on")); return; }
    stopAll();
    document.querySelectorAll(".sp-on").forEach(b => b.classList.remove("on", "sp-on"));
    btn.classList.add("on", "sp-on");
    const gen = st.gen;
    try { await say(getText(), typeof opts === "function" ? opts() : opts); } finally { if (gen === st.gen) btn.classList.remove("on", "sp-on"); }
  });
  return btn;
}

/** 朗读器：流式文字按句入队，顺序播放（对话用） */
export class Speaker {
  constructor(onEnd, opts = {}) { this.opts = opts; this.q = []; this.closed = false; this.running = false; this.stopped = false; this.onEnd = onEnd; this.gen = st.gen; }
  enqueue(s) {
    s = (s || "").trim();
    if (!s || this.stopped) return;
    this.q.push(s); prefetch(s, this.opts.voice);
    if (!this.running) this._run();
  }
  close() { this.closed = true; if (!this.running) this._end(); }
  stop() { if (this.stopped) return; this.stopped = true; this.q = []; stopAll(); this._end(); }
  async _run() {
    this.running = true;
    while (this.q.length && !this.stopped) { try { await say(this.q.shift(), this.opts); } catch { /* 单句失败继续 */ } }
    this.running = false;
    if (this.closed || this.stopped) this._end();
  }
  _end() { if (this.ended) return; this.ended = true; this.onEnd?.(); }
}

/** 把不断增长的文字切成句子：feed(全部已有文字)，新完成的句子交给 cb；flush(全文) 收尾 */
export function sentenceSplitter(cb) {
  let done = 0;
  const re = /[^。！？!?\n]*[。！？!?\n]+/g;
  return {
    feed(text) { re.lastIndex = done; let m; while ((m = re.exec(text)) && m.index === done) { cb(m[0]); done = re.lastIndex; } },
    flush(text) { const rest = text.slice(done); done = text.length; if (rest.trim()) cb(rest); },
  };
}
