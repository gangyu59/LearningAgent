/* 后端接口。访问口令（如服务端设置了）存在本机，遇到 401 自动询问一次。 */
import { promptBox, toast } from "./ui.js";

const LS = {
  get(k, d = "") { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 隐私模式 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
export { LS };

export class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
const url = p => new URL(p, document.baseURI).href;

let asking = null;
async function askCode() {
  if (!asking) asking = promptBox("请输入访问口令", { type: "password" }).finally(() => { asking = null; });
  const c = await asking;
  if (!c) throw new ApiError("未输入访问口令", 401);
  LS.set("code", c.trim());
}

async function raw(path, opts = {}, retry = true) {
  const headers = { ...(opts.headers || {}) };
  const code = LS.get("code");
  if (code) headers["X-Access-Code"] = code;
  let res;
  try { res = await fetch(url(path), { ...opts, headers }); }
  catch (e) { if (e.name === "AbortError") throw e; throw new ApiError("连不上服务器，请确认后端服务在运行", 0); }
  if (res.status === 401 && retry) { LS.del("code"); await askCode(); return raw(path, opts, false); }
  if (!res.ok) {
    let msg = "请求失败 " + res.status;
    try { const j = await res.json(); if (typeof j.detail === "string") msg = j.detail; else if (Array.isArray(j.detail)) msg = "参数不正确"; } catch { /* */ }
    throw new ApiError(msg, res.status);
  }
  return res;
}

const json = async (path, method, body, signal) => (await raw(path, {
  method, signal, headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })).json();

export const api = {
  get: (p, signal) => json(p, "GET", undefined, signal),
  post: (p, b, signal) => json(p, "POST", b ?? {}, signal),
  put: (p, b) => json(p, "PUT", b),
  patch: (p, b) => json(p, "PATCH", b),
  del: p => json(p, "DELETE"),

  /** SSE：每个事件回调 onEvent(ev)；遇到 error 事件抛异常 */
  async sse(path, body, onEvent, signal) {
    const res = await raw(path, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
        if (!line.startsWith("data:")) continue;
        let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
        if (ev.type === "error") throw new ApiError(ev.message || "AI 出错", 502);
        onEvent(ev);
      }
    }
  },
  async stt(pcm) { return (await (await raw("api/voice/stt", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: pcm })).json()).text || ""; },
  async tts(text, voice, rate) {
    const q = new URLSearchParams({ text, rate: (rate >= 0 ? "+" : "") + rate + "%" });
    if (voice) q.set("voice", voice);
    return (await raw("api/voice/tts?" + q)).blob();
  },
};

/** 带“出错重试”的统一错误展示 */
export function errBox(e, retry) {
  const d = document.createElement("div");
  d.className = "err";
  d.textContent = "⚠️ " + (e.message || e);
  if (retry) {
    const b = document.createElement("button");
    b.className = "btn sm"; b.style.marginLeft = "10px"; b.textContent = "重试"; b.onclick = retry;
    d.append(b);
  }
  return d;
}
export const failToast = e => { if (e.name !== "AbortError") toast(e.message || String(e)); };
