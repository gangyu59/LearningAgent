"""调本机已登录的 Claude Code 命令行（订阅账户，不需要 API Key），按字流式返回。
做法与 OmniTwin 的 llm_parser 一致：不传 ANTHROPIC_* 环境变量，否则占位符/过期 key 会让命令行放弃订阅登录。"""
import asyncio
import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import AsyncIterator


def _candidates() -> list:
    home = Path.home()
    c = [os.environ.get("CLAUDE_BIN"), shutil.which("claude"), str(home / ".local/bin/claude"),
         str(home / ".claude/local/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude",
         str(home / ".npm-global/bin/claude"), str(home / ".bun/bin/claude")]
    # launchd / ssh 启动的进程 PATH 很精简，npm 全局装的 claude 常在 nvm / volta 目录里
    c += sorted(str(p) for p in home.glob(".nvm/versions/node/*/bin/claude"))
    c += [str(home / ".volta/bin/claude")]
    return [x for x in c if x]


def claude_binary() -> str:
    for cand in _candidates():
        if Path(cand).is_file() and os.access(cand, os.X_OK):
            return cand
    return ""


def _env(binary: str) -> dict:
    env = {k: v for k, v in os.environ.items() if not k.startswith(("ANTHROPIC_", "CLAUDE_CODE_USE_"))}
    extra = [str(Path(binary).resolve().parent), str(Path(binary).parent), "/opt/homebrew/bin", "/usr/local/bin",
             "/usr/bin", "/bin"]
    env["PATH"] = os.pathsep.join(dict.fromkeys(extra + env.get("PATH", "").split(os.pathsep)))
    env.setdefault("HOME", str(Path.home()))
    return env


LAST = {"ok": None, "err": ""}  # 最近一次调用结果，给 /api/health 看


async def stream_claude(system: str, user: str, model: str, timeout: float = 90) -> AsyncIterator[str]:
    """逐段产出模型回复的文字。失败抛 RuntimeError（含可读原因）。"""
    binary = claude_binary()
    if not binary:
        raise RuntimeError("找不到 claude 命令（可设环境变量 CLAUDE_BIN）")
    cmd = [binary, "-p", "--tools", "", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
           "--no-session-persistence", "--model", model, "--system-prompt", system]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        env=_env(binary), cwd=tempfile.gettempdir(), limit=4 * 1024 * 1024)
    proc.stdin.write(user.encode("utf-8"))
    await proc.stdin.drain()
    proc.stdin.close()
    got, err_msg = False, ""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    try:
        while True:
            left = deadline - loop.time()
            if left <= 0:
                raise RuntimeError("claude 调用超过 %.0f 秒未返回" % timeout)
            try:
                raw = await asyncio.wait_for(proc.stdout.readline(), timeout=left)
            except asyncio.TimeoutError:
                raise RuntimeError("claude 调用超过 %.0f 秒未返回" % timeout)
            if not raw:
                break
            try:
                ev = json.loads(raw)
            except ValueError:
                continue
            t = ev.get("type")
            if t == "stream_event":
                d = (ev.get("event") or {}).get("delta") or {}
                if d.get("type") == "text_delta" and d.get("text"):
                    got = True
                    yield d["text"]
            elif t == "result" and ev.get("is_error"):
                err_msg = str(ev.get("result") or "")[:300]
        rc = await proc.wait()
        if rc != 0 or (not got and err_msg):
            msg = err_msg or (await proc.stderr.read()).decode("utf-8", "replace")[:300]
            if re.search(r"401|authenticat|oauth|log ?in|expired|credential|keychain", msg, re.I):
                raise RuntimeError("Claude 订阅登录不可用：请在这台机器的桌面终端运行 claude 重新登录（ssh 远程读不到钥匙串）")
            raise RuntimeError(msg or "claude 退出码 %s" % rc)
        if not got:
            raise RuntimeError("claude 没有返回内容")
        LAST.update(ok=True, err="")
    except BaseException as e:
        if not isinstance(e, (GeneratorExit, asyncio.CancelledError)):
            LAST.update(ok=False, err=str(e)[:300])
        raise
    finally:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()
