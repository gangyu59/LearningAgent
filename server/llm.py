"""统一的大模型入口：只用本机已登录的 Claude 订阅（claude 命令行）。
对话走 claude_cli.stream_claude；结构化任务（出题、分析、查词…）走 ask_json，带缓存和一次自动重试。"""
import asyncio
import hashlib
import json
import os
import re
from typing import AsyncIterator

from . import claude_cli, db

CHAT_MODEL = os.environ.get("JC_CLAUDE_MODEL", "haiku")
GEN_MODEL = os.environ.get("JC_CLAUDE_GEN_MODEL", CHAT_MODEL)  # 查词/翻译/讲解等
QUIZ_MODEL = os.environ.get("JC_CLAUDE_QUIZ_MODEL", "sonnet")  # 出题和生成教材要求准确，默认用更强的模型
slots = asyncio.Semaphore(2)  # 同时最多 2 个 claude 进程


async def stream(system: str, user: str, model: str = "") -> AsyncIterator[str]:
    async with slots:
        async for piece in claude_cli.stream_claude(system, user, model or GEN_MODEL):
            yield piece


async def ask(system: str, user: str, model: str = "", timeout: float = 120) -> str:
    buf = ""
    async with slots:
        async for piece in claude_cli.stream_claude(system, user, model or GEN_MODEL, timeout=timeout):
            buf += piece
    return buf


def extract_json(text: str):
    """从模型输出里取出 JSON（容忍代码块围栏和前后多余文字）。"""
    t = re.sub(r"^```(?:json)?\s*|\s*```\s*$", "", text.strip(), flags=re.M)
    starts = [i for i in (t.find("{"), t.find("[")) if i >= 0]
    if not starts:
        raise ValueError("没有 JSON")
    i = min(starts)
    end = t.rfind("}" if t[i] == "{" else "]")
    return json.loads(t[i:end + 1])


def key_of(kind: str, *parts) -> str:
    return kind + ":" + hashlib.sha1(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


async def ask_json(system: str, user: str, cache: str = "", kind: str = "", model: str = "", timeout: float = 120):
    """cache 非空则先查缓存、成功后写入。解析失败自动再问一次。"""
    if cache:
        with db.conn() as c:
            hit = db.cache_get(c, cache)
        if hit is not None:
            return hit
    last = None
    for attempt in range(2):
        u = user if attempt == 0 else user + "\n\n（上一次输出不是合法 JSON。这次只输出一个合法 JSON，不要任何解释或代码块。）"
        try:
            data = extract_json(await ask(system, u, model, timeout))
            if cache:
                with db.conn() as c:
                    db.cache_put(c, cache, kind or "json", data)
            return data
        except ValueError as e:  # JSON 解析失败（json.JSONDecodeError 是 ValueError 子类）
            last = e
    raise RuntimeError("AI 返回的内容无法解析，请重试") from last
