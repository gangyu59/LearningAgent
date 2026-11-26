"""LearningAgent 服务：单页应用（web/）+ /api/*。
AI 只用本机 Claude 订阅；语音识别用本机 Whisper，朗读用 edge-tts；学习数据存 SQLite（data/learning.db）。"""
import hmac
import json
import os
import re
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import claude_cli, db, llm, prompts, voice
from .routes_ai import router as ai_router
from .routes_data import router as data_router
from .routes_ext import router as ext_router

ROOT = Path(__file__).resolve().parent.parent
ACCESS_CODE = os.environ.get("JC_ACCESS_CODE", "")  # 设了就要求 /api/* 带口令（ngrok 暴露公网时务必设置）
WEB = ROOT / "web"  # 只有这个目录对外提供静态文件，源码、数据库、虚拟环境都不在里面
MAX_PCM = 16000 * 2 * 60
VERSION = "2.0.0"
STARTED = time.monotonic()

app = FastAPI(title="LearningAgent")


@app.middleware("http")
async def guard(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and ACCESS_CODE and path != "/api/health":
        got = request.headers.get("x-access-code") or request.query_params.get("code") or ""
        if not hmac.compare_digest(got, ACCESS_CODE):
            return JSONResponse({"detail": "需要访问口令", "code": "auth"}, status_code=401)
    resp = await call_next(request)
    if not path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.on_event("startup")
async def _startup():
    db.init()
    voice.prune_cache()
    if os.environ.get("JC_VOICE_PRELOAD", "1") != "0":
        voice.preload()


@app.get("/api/health")
def health():
    return {"service": "learningagent", "pid": os.getpid(), "claude": bool(claude_cli.claude_binary()), "last": claude_cli.LAST,
            "auth": bool(ACCESS_CODE), "model": llm.CHAT_MODEL,
            "ok": True, "version": VERSION, "uptime_s": int(time.monotonic() - STARTED)}


@app.get("/api/auth/check")
def auth_check():
    return {"ok": True}  # 能走到这里说明口令已通过中间件


@app.get("/api/voice/status")
def voice_status():
    return {"stt": {"available": voice.stt_available(), **voice.state},
            "tts": {"available": voice.tts_available(), "default_voice": voice.DEFAULT_VOICE},
            "voices": voice.VOICES, "other_voices": voice.OTHER_VOICES}


@app.post("/api/voice/stt")
async def stt(request: Request):
    """请求体：16kHz 单声道 PCM16 原始字节。无有效语音返回空文本。"""
    if not voice.stt_available():
        raise HTTPException(503, "服务器没装语音识别（pip install mlx-whisper）")
    pcm = await request.body()
    if len(pcm) > MAX_PCM:
        raise HTTPException(413, "录音太长，请分段说（每段不超过 1 分钟）")
    try:
        return {"text": await voice.transcribe(pcm)}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, "语音识别失败：" + str(e)[:120])


@app.get("/api/voice/tts")
async def tts(text: str = Query(..., min_length=1, max_length=600), voice_id: str = Query("", alias="voice"),
              rate: str = "+0%"):
    if not voice.tts_available():
        raise HTTPException(503, "服务器没装朗读组件（pip install edge-tts）")
    if not re.fullmatch(r"[+-]\d{1,3}%", rate):
        raise HTTPException(422, "rate 形如 +10%")
    if voice_id and voice_id not in voice.ALL_VOICE_IDS:
        raise HTTPException(422, "不认识的声音")
    speech = voice.clean_for_speech(text)
    if not speech:
        raise HTTPException(422, "没有可朗读的文字")
    try:
        return Response(await voice.tts(speech, voice_id, rate), media_type="audio/mpeg",
                        headers={"Cache-Control": "public, max-age=86400"})
    except RuntimeError as e:
        raise HTTPException(502, str(e)[:160])


class Msg(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=1500)


class ChatIn(BaseModel):
    messages: list[Msg] = Field(default_factory=list, max_length=60)
    scenario: str = Field("日常会话", max_length=60)
    level: str = "N4"
    persona: str = Field("さくら", max_length=20)


def _sse(obj: dict) -> str:
    return "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"


@app.post("/api/chat")
async def chat(body: ChatIn):
    """SSE：{type:'ja',text:增量} … {type:'done',ja,zh,fix,hint}；出错 {type:'error',message}。"""
    system = prompts.system_prompt(body.scenario, body.level, body.persona)
    user = prompts.build_user([m.model_dump() for m in body.messages])

    async def gen():
        buf, sent = "", 0
        try:
            async for piece in llm.stream(system, user, llm.CHAT_MODEL):
                buf += piece
                ja = prompts.ja_portion(buf)
                if len(ja) > sent:
                    yield _sse({"type": "ja", "text": ja[sent:]})
                    sent = len(ja)
            yield _sse({"type": "done", **prompts.parse(buf)})
        except Exception as e:  # noqa: BLE001
            yield _sse({"type": "error", "message": str(e)[:200] or e.__class__.__name__})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


app.include_router(data_router)
app.include_router(ai_router)
app.include_router(ext_router)

# 其余一律当静态页面（单页应用）
app.mount("/", StaticFiles(directory=str(WEB), html=True), name="static")
