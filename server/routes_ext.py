"""供外部控制器（OmniTwin）调用的接口：只读目录、异步任务、只读复习摘要。
全部走 app.py 里的口令中间件。任务结果只放在内存里，不写生词卡、错题、进度、统计，也不计入连续学习天数。"""
import asyncio
import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from . import db
from .routes_ai import (LEVEL_IDS, LEVEL_RE, MODES, QUIZ_N_DEFAULT, QUIZ_N_MAX, QUIZ_N_MIN, KINDS,
                        PassageIn, QuizIn, generate_passage, generate_quiz)
from .routes_data import MASTERED_DAYS

router = APIRouter(prefix="/api")


# ───────────────────────── 参数模型（范围与 /api/ai/quiz、/api/ai/passage 一致，多余字段直接拒绝）─────────────────────────
class QuizParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    level: str = Field("N4", pattern=LEVEL_RE)
    mode: str = Field("mixed", pattern="^(" + "|".join(MODES) + ")$")
    n: int = Field(QUIZ_N_DEFAULT, ge=QUIZ_N_MIN, le=QUIZ_N_MAX)


class PassageParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    level: str = Field("N4", pattern=LEVEL_RE)
    topic: str = Field("", max_length=60)
    kind: str = Field("dialog", pattern="^(" + "|".join(KINDS) + ")$")


CATALOG = [
    {"id": "quiz", "name": "生成测验", "description": "按水平和题型让 Claude 出一套四选一的日语题，只返回题目，不写入错题本或统计。",
     "params": [
         {"name": "level", "type": "string", "enum": LEVEL_IDS, "default": "N4", "required": False},
         {"name": "mode", "type": "string", "enum": list(MODES), "default": "mixed", "required": False},
         {"name": "n", "type": "integer", "min": QUIZ_N_MIN, "max": QUIZ_N_MAX, "default": QUIZ_N_DEFAULT, "required": False},
     ],
     "consumes_claude": True, "model_tier": "sonnet", "estimated_seconds": {"typical": 25, "max": 180}},
    {"id": "passage", "name": "生成听力/阅读材料", "description": "让 Claude 写一段对话或短故事（含中文翻译），只返回正文，不保存到材料库。",
     "params": [
         {"name": "level", "type": "string", "enum": LEVEL_IDS, "default": "N4", "required": False},
         {"name": "topic", "type": "string", "max_length": 60, "default": "", "required": False,
          "note": "留空则由 Claude 任选生活场景"},
         {"name": "kind", "type": "string", "enum": list(KINDS), "default": "dialog", "required": False},
     ],
     "consumes_claude": True, "model_tier": "sonnet", "estimated_seconds": {"typical": 20, "max": 180}},
]


@router.get("/catalog")
def catalog():
    return {"jobs": CATALOG}


# ───────────────────────── 异步任务（内存）─────────────────────────
MAX_KEPT = 50
JOBS: dict[str, dict] = {}
_tasks: set = set()  # 防止后台任务被垃圾回收
EST = {"quiz": 25.0, "passage": 20.0}


class JobIn(BaseModel):
    kind: str
    params: dict[str, Any] = Field(default_factory=dict)


def _zh_error(e: ValidationError) -> str:
    parts = []
    for x in e.errors():
        loc = ".".join(str(i) for i in x["loc"]) or "params"
        parts.append(f"{loc}: " + ("不认识的参数" if x["type"] == "extra_forbidden" else "取值不合法"))
    return "；".join(parts)


def _running() -> bool:
    return any(j["status"] == "running" for j in JOBS.values())


def _set(job: dict, phase: str, progress: float) -> None:
    job["phase"], job["progress"] = phase, round(max(job["progress"], min(progress, 0.95)), 2)


async def _run(job: dict, kind: str, params) -> None:
    done = False

    async def ticker():  # 生成期间按预计耗时平滑推进，别让进度停在原地
        while True:
            await asyncio.sleep(1)
            _set(job, "Claude 生成中", 0.1 + 0.8 * (1 - 2 ** (-(time.monotonic() - t0) / EST[kind])))

    t0 = time.monotonic()
    tick = asyncio.create_task(ticker())
    try:
        _set(job, "Claude 生成中", 0.1)
        if kind == "quiz":
            qs = await generate_quiz(QuizIn(**params.model_dump()))
            result = {"kind": "quiz", "level": params.level, "mode": params.mode, "count": len(qs), "questions": qs}
        else:
            data = await generate_passage(PassageIn(**params.model_dump()), save=False)
            data.pop("id", None)
            result = {"kind": "passage", "level": params.level, "passage_kind": params.kind, **data}
        _set(job, "整理结果", 0.95)
        job["result"], job["progress"], job["phase"], job["status"] = result, 1.0, "完成", "done"
        done = True
    except HTTPException as e:
        job["error_message"] = str(e.detail)[:300]
    except Exception as e:  # noqa: BLE001
        job["error_message"] = (str(e)[:300] or e.__class__.__name__)
    finally:
        tick.cancel()
        if not done:
            job["status"], job["phase"] = "error", "失败"
        job["finished_at"] = db.now()


def _public(job: dict) -> dict:
    return {k: job[k] for k in ("job_id", "kind", "status", "progress", "phase", "result", "error_message")}


@router.post("/jobs")
async def create_job(body: JobIn):
    model = {"quiz": QuizParams, "passage": PassageParams}.get(body.kind)
    if not model:
        raise HTTPException(400, f"不认识的任务类型「{body.kind[:30]}」，可用：quiz、passage")
    try:
        params = model(**body.params)
    except ValidationError as e:
        raise HTTPException(400, "参数不合法：" + _zh_error(e))
    if _running():  # 检查和登记之间没有 await，不会被并发请求穿插
        raise HTTPException(409, "已有任务在运行，请等它结束")
    job = {"job_id": uuid.uuid4().hex[:12], "kind": body.kind, "status": "running", "progress": 0.0, "phase": "排队",
           "result": None, "error_message": None, "created_at": db.now()}
    JOBS[job["job_id"]] = job
    for old in [k for k, v in JOBS.items() if v["status"] != "running"][:-MAX_KEPT]:
        del JOBS[old]
    t = asyncio.create_task(_run(job, body.kind, params))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return {"job_id": job["job_id"]}


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "没有这个任务（服务重启后任务记录会丢失）")
    return _public(job)


# ───────────────────────── 只读复习摘要 ─────────────────────────
@router.get("/review/summary")
def review_summary():
    """与 /api/stats 里同名字段口径一致，但不写库，适合高频轮询。"""
    t = db.now()
    with db.conn() as c:
        q = lambda sql, *a: c.execute(sql, a).fetchone()[0]  # noqa: E731
        s = db.get_settings(c)
        return {
            "due": q("SELECT COUNT(*) FROM cards WHERE due<=? AND suspended=0", t),
            "new": q("SELECT COUNT(*) FROM cards WHERE reps=0 AND lapses=0 AND suspended=0"),
            "total_cards": q("SELECT COUNT(*) FROM cards"),
            "mastered": q("SELECT COUNT(*) FROM cards WHERE interval>=?", MASTERED_DAYS),
            "streak": db.streak(c),
            "goal": int(s.get("daily_goal", 20) or 20),
            "mistakes_open": q("SELECT COUNT(*) FROM mistakes WHERE mastered=0"),
        }
