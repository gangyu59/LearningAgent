"""学习数据接口：设置、统计、生词卡与复习、学习进度、测验与错题、对话记录。全部存 SQLite。"""
import json
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import db

router = APIRouter(prefix="/api")
MASTERED_DAYS = 21


# ───────────────────────── 设置 ─────────────────────────
class SettingsIn(BaseModel):
    values: dict[str, str]


@router.get("/settings")
def get_settings():
    with db.conn() as c:
        return db.get_settings(c)


@router.put("/settings")
def put_settings(body: SettingsIn):
    with db.conn() as c:
        for k, v in body.values.items():
            if k in db.DEFAULT_SETTINGS and len(v) <= 100:
                c.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)", (k, v))
        return db.get_settings(c)


# ───────────────────────── 活动 / 统计 ─────────────────────────
class ActivityIn(BaseModel):
    seconds: int = Field(0, ge=0, le=300)
    chat_turns: int = Field(0, ge=0, le=5)


@router.post("/activity")
def activity(body: ActivityIn):
    with db.conn() as c:
        if body.seconds:
            db.bump(c, "seconds", body.seconds)
        if body.chat_turns:
            db.bump(c, "chat_turns", body.chat_turns)
    return {"ok": True}


@router.get("/stats")
def stats():
    t = db.now()
    with db.conn() as c:
        q = lambda sql, *a: c.execute(sql, a).fetchone()[0]  # noqa: E731
        s = db.get_settings(c)
        c.execute("INSERT OR IGNORE INTO activity(day) VALUES(?)", (db.today(),))
        today = dict(c.execute("SELECT * FROM activity WHERE day=?", (db.today(),)).fetchone())
        quiz = [dict(r) for r in c.execute("SELECT ts,level,mode,total,correct FROM quizzes ORDER BY id DESC LIMIT 5")]
        last_chat = c.execute("SELECT id,scenario,updated,review FROM chat_sessions ORDER BY id DESC LIMIT 1").fetchone()
        prog = {r["kind"]: r["n"] for r in c.execute("SELECT kind,COUNT(*) n FROM progress WHERE status='done' GROUP BY kind")}
        return {
            "due": q("SELECT COUNT(*) FROM cards WHERE due<=? AND suspended=0", t),
            "new": q("SELECT COUNT(*) FROM cards WHERE reps=0 AND lapses=0 AND suspended=0"),
            "total_cards": q("SELECT COUNT(*) FROM cards"),
            "mastered": q("SELECT COUNT(*) FROM cards WHERE interval>=?", MASTERED_DAYS),
            "streak": db.streak(c), "today": today, "goal": int(s.get("daily_goal", 20) or 20),
            "week": db.week_activity(c), "mistakes_open": q("SELECT COUNT(*) FROM mistakes WHERE mastered=0"),
            "quiz_recent": quiz, "progress": prog,
            "last_chat": dict(last_chat) if last_chat else None,
        }


# ───────────────────────── 生词卡 ─────────────────────────
class CardIn(BaseModel):
    word: str = Field(min_length=1, max_length=60)
    kana: str = Field("", max_length=80)
    romaji: str = Field("", max_length=120)
    meaning: str = Field("", max_length=200)
    pos: str = Field("", max_length=20)
    example_ja: str = Field("", max_length=300)
    example_zh: str = Field("", max_length=300)
    note: str = Field("", max_length=300)
    source: str = Field("", max_length=30)


class CardsBulk(BaseModel):
    cards: list[CardIn] = Field(max_length=500)


def _upsert(c, x: CardIn) -> bool:
    """已有同词则只补空字段。返回是否新建。"""
    d = x.model_dump()
    d["word"] = d["word"].strip()
    row = c.execute("SELECT * FROM cards WHERE word=?", (d["word"],)).fetchone()
    if row:
        fill = {k: v for k, v in d.items() if k not in ("word", "source") and v and not row[k]}
        if fill:
            c.execute("UPDATE cards SET " + ",".join(f"{k}=?" for k in fill) + " WHERE id=?", (*fill.values(), row["id"]))
        return False
    t = db.now()
    c.execute("INSERT INTO cards(word,kana,romaji,meaning,pos,example_ja,example_zh,note,source,created_at,due) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
              (d["word"], d["kana"], d["romaji"], d["meaning"], d["pos"], d["example_ja"], d["example_zh"], d["note"], d["source"], t, t))
    return True


def _card(c, cid: int) -> dict:
    r = c.execute("SELECT * FROM cards WHERE id=?", (cid,)).fetchone()
    if not r:
        raise HTTPException(404, "没有这张卡")
    return dict(r)


@router.get("/cards/words")
def card_words():
    with db.conn() as c:
        return {"words": [r[0] for r in c.execute("SELECT word FROM cards")]}


@router.get("/cards")
def list_cards(filter: str = "all", q: str = "", limit: int = 50, offset: int = 0):
    where, args = ["1=1"], []
    t = db.now()
    if filter == "due":
        where.append("due<=? AND suspended=0"); args.append(t)
    elif filter == "new":
        where.append("reps=0 AND lapses=0")
    elif filter == "mastered":
        where.append("interval>=?"); args.append(MASTERED_DAYS)
    elif filter == "weak":
        where.append("lapses>0")
    if q.strip():
        where.append("(word LIKE ? OR kana LIKE ? OR romaji LIKE ? OR meaning LIKE ?)")
        args += [f"%{q.strip()}%"] * 4
    sql = " AND ".join(where)
    with db.conn() as c:
        total = c.execute(f"SELECT COUNT(*) FROM cards WHERE {sql}", args).fetchone()[0]
        items = db.rows(c.execute(f"SELECT * FROM cards WHERE {sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                                  (*args, min(limit, 200), offset)))
    return {"items": items, "total": total}


@router.post("/cards")
def add_card(body: CardIn):
    with db.conn() as c:
        created = _upsert(c, body)
        if created:
            db.bump(c, "items")
        r = c.execute("SELECT * FROM cards WHERE word=?", (body.word.strip(),)).fetchone()
        return {"created": created, "card": dict(r)}


@router.post("/cards/bulk")
def add_cards(body: CardsBulk):
    with db.conn() as c:
        n = sum(1 for x in body.cards if _upsert(c, x))
    return {"added": n, "skipped": len(body.cards) - n}


@router.patch("/cards/{cid}")
def edit_card(cid: int, body: CardIn):
    d = body.model_dump()
    d.pop("source")
    with db.conn() as c:
        _card(c, cid)
        try:
            c.execute("UPDATE cards SET " + ",".join(f"{k}=?" for k in d) + " WHERE id=?", (*d.values(), cid))
        except Exception:  # noqa: BLE001  词与别的卡重复
            raise HTTPException(409, "已经有同名的词了")
        return _card(c, cid)


@router.delete("/cards/{cid}")
def del_card(cid: int):
    with db.conn() as c:
        c.execute("DELETE FROM reviews WHERE card_id=?", (cid,))
        c.execute("DELETE FROM cards WHERE id=?", (cid,))
    return {"ok": True}


@router.get("/cards/due")
def due_cards(limit: int = 20):
    t = db.now()
    with db.conn() as c:
        total = c.execute("SELECT COUNT(*) FROM cards WHERE due<=? AND suspended=0", (t,)).fetchone()[0]
        items = db.rows(c.execute("SELECT * FROM cards WHERE due<=? AND suspended=0 ORDER BY (reps=0), due LIMIT ?",
                                  (t, min(limit, 100))))
    for it in items:
        it["next"] = db.preview_intervals(it)
    return {"items": items, "total": total}


class ReviewIn(BaseModel):
    grade: int = Field(ge=0, le=3)


@router.post("/cards/{cid}/review")
def review_card(cid: int, body: ReviewIn):
    with db.conn() as c:
        card = _card(c, cid)
        s = db.schedule(card, body.grade)
        c.execute("UPDATE cards SET interval=?,ease=?,reps=?,lapses=?,due=?,last_review=? WHERE id=?",
                  (s["interval"], s["ease"], s["reps"], s["lapses"], s["due"], db.now(), cid))
        c.execute("INSERT INTO reviews(card_id,ts,grade) VALUES(?,?,?)", (cid, db.now(), body.grade))
        db.bump(c, "reviews")
        return _card(c, cid)


# ───────────────────────── 学习进度 ─────────────────────────
class ProgressIn(BaseModel):
    kind: str = Field(pattern="^(lessons|grammar|listening)$")
    item: str = Field(min_length=1, max_length=60)
    status: str = Field("done", pattern="^(seen|done)$")


@router.get("/progress")
def get_progress():
    with db.conn() as c:
        out = {}
        for r in c.execute("SELECT kind,item,status FROM progress"):
            out.setdefault(r["kind"], {})[r["item"]] = r["status"]
        return out


@router.put("/progress")
def put_progress(body: ProgressIn):
    with db.conn() as c:
        old = c.execute("SELECT status FROM progress WHERE kind=? AND item=?", (body.kind, body.item)).fetchone()
        if old and old["status"] == "done" and body.status == "seen":
            return {"ok": True}
        c.execute("INSERT OR REPLACE INTO progress(kind,item,status,ts) VALUES(?,?,?,?)", (body.kind, body.item, body.status, db.now()))
        if body.status == "done" and not (old and old["status"] == "done"):
            db.bump(c, "items")
    return {"ok": True}


# ───────────────────────── 测验与错题 ─────────────────────────
class QuizItem(BaseModel):
    q: dict
    picked: int = Field(ge=-1, le=3)
    correct: bool
    mistake_id: Optional[int] = None


class QuizResultIn(BaseModel):
    level: str = Field(pattern="^N[1-5]$")
    mode: str = Field(max_length=20)
    items: list[QuizItem] = Field(min_length=1, max_length=30)


@router.post("/quiz/result")
def quiz_result(body: QuizResultIn):
    t = db.now()
    right = sum(1 for i in body.items if i.correct)
    with db.conn() as c:
        c.execute("INSERT INTO quizzes(ts,level,mode,total,correct) VALUES(?,?,?,?,?)", (t, body.level, body.mode, len(body.items), right))
        for i in body.items:
            if i.correct and i.mistake_id:
                c.execute("UPDATE mistakes SET mastered=1 WHERE id=?", (i.mistake_id,))
            elif not i.correct and not i.mistake_id:
                c.execute("INSERT INTO mistakes(ts,level,question,picked) VALUES(?,?,?,?)",
                          (t, body.level, json.dumps(i.q, ensure_ascii=False), i.picked))
        db.bump(c, "quiz_q", len(body.items))
        left = c.execute("SELECT COUNT(*) FROM mistakes WHERE mastered=0").fetchone()[0]
    return {"correct": right, "total": len(body.items), "mistakes_open": left}


@router.get("/quiz/history")
def quiz_history(limit: int = 20):
    with db.conn() as c:
        return {"items": db.rows(c.execute("SELECT * FROM quizzes ORDER BY id DESC LIMIT ?", (min(limit, 100),)))}


@router.get("/quiz/mistakes")
def quiz_mistakes(level: str = "", limit: int = 20):
    sql, args = "SELECT * FROM mistakes WHERE mastered=0", []
    if re.fullmatch(r"N[1-5]", level):
        sql += " AND level=?"; args.append(level)
    with db.conn() as c:
        items = db.rows(c.execute(sql + " ORDER BY ts DESC, id DESC LIMIT ?", (*args, min(limit, 100))))
    for it in items:
        it["question"] = json.loads(it["question"])
    return {"items": items}


@router.delete("/quiz/mistakes/{mid}")
def del_mistake(mid: int):
    with db.conn() as c:
        c.execute("DELETE FROM mistakes WHERE id=?", (mid,))
    return {"ok": True}


# ───────────────────────── 对话记录 ─────────────────────────
class SessionNew(BaseModel):
    scenario: str = Field("日常会话", max_length=60)
    level: str = Field("N4", pattern="^N[1-5]$")


class SessionSave(BaseModel):
    messages: list[dict] = Field(max_length=1000)
    hint: Optional[dict] = None
    seconds: int = Field(0, ge=0)


def _session(r) -> dict:
    d = dict(r)
    d["messages"] = json.loads(d["messages"] or "[]")
    d["hint"] = json.loads(d["hint"]) if d["hint"] else None
    d["review"] = json.loads(d["review"]) if d["review"] else None
    return d


HAS_USER_TURN = '%"role": "user"%'   # messages 列是 json.dumps 的默认格式


@router.post("/chat/sessions")
def new_session(body: SessionNew):
    t = db.now()
    with db.conn() as c:
        cur = c.execute("INSERT INTO chat_sessions(scenario,level,started,updated) VALUES(?,?,?,?)", (body.scenario, body.level, t, t))
        return {"id": cur.lastrowid}


@router.put("/chat/sessions/{sid}")
def save_session(sid: int, body: SessionSave):
    with db.conn() as c:
        c.execute("UPDATE chat_sessions SET messages=?,hint=?,seconds=?,updated=? WHERE id=?",
                  (json.dumps(body.messages, ensure_ascii=False), json.dumps(body.hint, ensure_ascii=False) if body.hint else "",
                   body.seconds, db.now(), sid))
    return {"ok": True}


@router.post("/chat/sessions/{sid}/end")
def end_session(sid: int):
    """用户点了「结束」就算结束，不依赖复盘是否生成成功。"""
    with db.conn() as c:
        c.execute("UPDATE chat_sessions SET ended=1,updated=? WHERE id=?", (db.now(), sid))
    return {"ok": True}


@router.get("/chat/sessions/latest")
def latest_session():
    with db.conn() as c:
        r = c.execute("SELECT * FROM chat_sessions ORDER BY id DESC LIMIT 1").fetchone()
    return {"session": _session(r) if r else None}


@router.get("/chat/sessions")
def list_sessions(limit: int = 20, scenario: str = ""):
    """历史对话（只列学习者开过口的），可按场景过滤。"""
    where, args = ["messages LIKE ?"], [HAS_USER_TURN]
    if scenario:
        where.append("scenario=?")
        args.append(scenario)
    with db.conn() as c:
        items = db.rows(c.execute("SELECT id,scenario,level,started,updated,seconds,messages,review FROM chat_sessions "
                                  f"WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT ?", (*args, max(1, min(limit, 500)))))
    for it in items:
        msgs = json.loads(it.pop("messages") or "[]")
        it["turns"] = sum(1 for m in msgs if m.get("role") == "user")
        it["count"] = len(msgs)
        it["preview"] = next((str(m.get("content", ""))[:60] for m in msgs if m.get("role") == "user"), "")
        it["has_review"] = bool(it.pop("review"))
    return {"items": items}


@router.get("/chat/scenes")
def chat_scenes():
    """每个场景有多少条历史对话，最近练过的排前面。"""
    with db.conn() as c:
        return {"items": db.rows(c.execute("SELECT scenario,COUNT(*) n FROM chat_sessions WHERE messages LIKE ? "
                                           "GROUP BY scenario ORDER BY MAX(id) DESC", (HAS_USER_TURN,)))}


@router.get("/chat/sessions/{sid}")
def get_session(sid: int):
    with db.conn() as c:
        r = c.execute("SELECT * FROM chat_sessions WHERE id=?", (sid,)).fetchone()
    if not r:
        raise HTTPException(404, "没有这次对话")
    return _session(r)


@router.delete("/chat/sessions/{sid}")
def del_session(sid: int):
    with db.conn() as c:
        c.execute("DELETE FROM chat_sessions WHERE id=?", (sid,))
    return {"ok": True}
