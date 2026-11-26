"""学习数据：SQLite（data/learning.db）。生词卡 + 间隔复习、学习进度、测验与错题、每日活动、设置、对话记录、AI 缓存。

每次请求单独开连接（WAL 模式），不跨线程共享。"""
import json
import math
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("JC_DB") or ROOT / "data" / "learning.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS cards(
  id INTEGER PRIMARY KEY, word TEXT NOT NULL UNIQUE, kana TEXT DEFAULT '', romaji TEXT DEFAULT '',
  meaning TEXT DEFAULT '', pos TEXT DEFAULT '', example_ja TEXT DEFAULT '', example_zh TEXT DEFAULT '',
  note TEXT DEFAULT '', source TEXT DEFAULT '', created_at INTEGER NOT NULL,
  due INTEGER NOT NULL, interval REAL DEFAULT 0, ease REAL DEFAULT 2.5, reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0, last_review INTEGER, suspended INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS cards_due ON cards(due);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, card_id INTEGER, ts INTEGER, grade INTEGER);
CREATE TABLE IF NOT EXISTS progress(kind TEXT, item TEXT, status TEXT, ts INTEGER, PRIMARY KEY(kind, item));
CREATE TABLE IF NOT EXISTS quizzes(id INTEGER PRIMARY KEY, ts INTEGER, level TEXT, mode TEXT, total INTEGER, correct INTEGER);
CREATE TABLE IF NOT EXISTS mistakes(id INTEGER PRIMARY KEY, ts INTEGER, level TEXT, question TEXT, picked INTEGER, mastered INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS activity(day TEXT PRIMARY KEY, reviews INTEGER DEFAULT 0, chat_turns INTEGER DEFAULT 0,
  quiz_q INTEGER DEFAULT 0, items INTEGER DEFAULT 0, seconds INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS ai_cache(key TEXT PRIMARY KEY, kind TEXT, value TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS passages(id INTEGER PRIMARY KEY, ts INTEGER, level TEXT, kind TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS chat_sessions(id INTEGER PRIMARY KEY, scenario TEXT, level TEXT, started INTEGER, updated INTEGER,
  seconds INTEGER DEFAULT 0, messages TEXT DEFAULT '[]', hint TEXT DEFAULT '', review TEXT DEFAULT '');
"""

DEFAULT_SETTINGS = {"level": "N4", "voice": "", "rate": "0", "autoplay": "1", "open_zh": "0", "show_fix": "1",
                    "daily_goal": "20"}


def init() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with conn() as c:
        c.executescript(SCHEMA)
        if "ended" not in {r["name"] for r in c.execute("PRAGMA table_info(chat_sessions)")}:
            c.execute("ALTER TABLE chat_sessions ADD COLUMN ended INTEGER DEFAULT 0")  # 老数据库补列；老记录视为已结束
            c.execute("UPDATE chat_sessions SET ended=1")


@contextmanager
def conn():
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA foreign_keys=ON")
    try:
        yield c
        c.commit()
    except BaseException:
        c.rollback()
        raise
    finally:
        c.close()


def now() -> int:
    return int(time.time())


def today() -> str:
    return date.today().isoformat()


def rows(cur) -> list:
    return [dict(r) for r in cur.fetchall()]


# ───────── 活动统计 ─────────
def bump(c, field: str, n: int = 1) -> None:
    assert field in {"reviews", "chat_turns", "quiz_q", "items", "seconds"}
    c.execute("INSERT OR IGNORE INTO activity(day) VALUES(?)", (today(),))
    c.execute(f"UPDATE activity SET {field}={field}+? WHERE day=?", (n, today()))


def streak(c) -> int:
    """连续学习天数：今天还没学不断，从昨天往前数。"""
    days = {r["day"] for r in c.execute("SELECT day FROM activity WHERE reviews+chat_turns+quiz_q+items>0 OR seconds>=60")}
    d = date.today()
    if d.isoformat() not in days:
        d -= timedelta(days=1)
    n = 0
    while d.isoformat() in days:
        n += 1
        d -= timedelta(days=1)
    return n


# ───────── 间隔复习（SM-2 的简化版）─────────
GRADES = {0: "重来", 1: "困难", 2: "良好", 3: "简单"}


def schedule(card: dict, grade: int) -> dict:
    """返回新的 interval(天)/ease/reps/lapses/due。again 10 分钟后再来；其余按天。"""
    ease, interval, reps, lapses = card["ease"], card["interval"], card["reps"], card["lapses"]
    t = now()
    if grade == 0:
        lapses += 1
        reps = 0
        ease = max(1.3, ease - 0.2)
        interval = 0
        due = t + 600
    else:
        if grade == 1:
            ease = max(1.3, ease - 0.15)
            interval = 1 if reps == 0 else max(1, interval * 1.2)
        elif grade == 2:
            interval = 1 if reps == 0 else 3 if reps == 1 else interval * ease
        else:
            ease += 0.15
            interval = 3 if reps == 0 else max(4, interval * ease * 1.3)
        reps += 1
        interval = round(interval, 1)
        due = t + int(interval * 86400)
    return {"interval": interval, "ease": round(ease, 2), "reps": reps, "lapses": lapses, "due": due}


def preview_intervals(card: dict) -> dict:
    out = {}
    for g in range(4):
        s = schedule(card, g)
        out[g] = "10 分钟" if g == 0 else fmt_days(s["interval"])
    return out


def fmt_days(d: float) -> str:
    if d < 1:
        return "不到 1 天"
    if d < 30:
        return f"{math.floor(d)} 天" if d >= 2 else "1 天"
    if d < 365:
        return f"{round(d / 30)} 个月"
    return f"{d / 365:.1f} 年"


# ───────── 设置 ─────────
def get_settings(c) -> dict:
    out = dict(DEFAULT_SETTINGS)
    out.update({r["key"]: r["value"] for r in c.execute("SELECT key,value FROM settings")})
    return out


def cache_get(c, key: str):
    r = c.execute("SELECT value FROM ai_cache WHERE key=?", (key,)).fetchone()
    return json.loads(r["value"]) if r else None


def cache_put(c, key: str, kind: str, value) -> None:
    c.execute("INSERT OR REPLACE INTO ai_cache(key,kind,value,ts) VALUES(?,?,?,?)",
              (key, kind, json.dumps(value, ensure_ascii=False), now()))


def week_activity(c, days: int = 14) -> list:
    start = (date.today() - timedelta(days=days - 1)).isoformat()
    have = {r["day"]: dict(r) for r in c.execute("SELECT * FROM activity WHERE day>=?", (start,))}
    out = []
    for i in range(days):
        d = (date.today() - timedelta(days=days - 1 - i)).isoformat()
        r = have.get(d, {})
        n = r.get("reviews", 0) + r.get("chat_turns", 0) + r.get("quiz_q", 0) + r.get("items", 0)
        out.append({"day": d, "n": n, "reviews": r.get("reviews", 0), "chat_turns": r.get("chat_turns", 0),
                    "quiz_q": r.get("quiz_q", 0), "items": r.get("items", 0), "seconds": r.get("seconds", 0)})
    return out


def iso(ts: int) -> str:
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")
