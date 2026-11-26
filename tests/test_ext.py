"""外部控制接口测试（标准库 unittest；起真实 uvicorn + urllib，不依赖 httpx/pytest，也不调用真实 Claude）。
运行：.venv/bin/python -m unittest discover -s tests -v"""
import asyncio
import json
import os
import socket
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

TMP = tempfile.mkdtemp()
os.environ.update(JC_DB=str(Path(TMP) / "t.db"), JC_ACCESS_CODE="secret", JC_VOICE_PRELOAD="0")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn  # noqa: E402
from server import app as appmod, db, routes_ai, routes_ext  # noqa: E402

GOOD_QUIZ = {"questions": [{"type": "vocab", "q": f"問題{i}", "options": ["あ", "い", "う", "え"], "answer": 1,
                            "explain": "い が正解"} for i in range(5)]}
GOOD_PASSAGE = {"title": "标题", "description": "简介", "translation": ["一", "二", "三"],
                "dialog": [{"speaker": "A", "text": t, "romaji": ""} for t in ("こんにちは", "元気ですか", "はい")]}
TABLES = ["cards", "reviews", "progress", "quizzes", "mistakes", "activity", "passages", "chat_sessions"]


class Fake:
    """替换 llm.ask_json：按 gate 事件放行，可指定返回值或抛错。"""
    def __init__(self):
        self.gate, self.out, self.err = None, None, None

    async def __call__(self, system, user, **kw):
        if self.gate:
            while not self.gate.is_set():
                await asyncio.sleep(0.02)
        if self.err:
            raise RuntimeError(self.err)
        return self.out


def call(base, method, path, body=None, code="secret"):
    req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"x-access-code": code} if code else {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


class ExtTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        cls.server = uvicorn.Server(uvicorn.Config(appmod.app, host="127.0.0.1", port=port, log_level="warning"))
        threading.Thread(target=cls.server.run, daemon=True).start()
        cls.base = f"http://127.0.0.1:{port}"
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.base + "/api/health", timeout=1)
                break
            except OSError:
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.server.should_exit = True

    def setUp(self):
        self.fake = Fake()
        routes_ai.llm.ask_json = self.fake  # generate_* 通过 llm.ask_json 调模型
        routes_ext.JOBS.clear()

    def req(self, *a, **k):
        return call(self.base, *a, **k)

    def counts(self):
        c = sqlite3.connect(db.DB_PATH)
        try:
            return {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}
        finally:
            c.close()

    def wait(self, jid, status="done", timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            _, j = self.req("GET", "/api/jobs/" + jid)
            if j["status"] == status:
                return j
            time.sleep(0.05)
        self.fail(f"任务未到 {status}: {j}")

    # ── 健康检查 / 目录 / 口令 ──
    def test_health_fields(self):
        st, h = self.req("GET", "/api/health", code="")
        self.assertEqual(st, 200)
        self.assertTrue(h["ok"] and isinstance(h["version"], str) and isinstance(h["uptime_s"], int))
        for k in ("service", "pid", "claude", "last", "auth", "model"):
            self.assertIn(k, h)

    def test_auth_required_except_health(self):
        for m, p, b in [("GET", "/api/catalog", None), ("POST", "/api/jobs", {"kind": "quiz"}),
                        ("GET", "/api/jobs/x", None), ("GET", "/api/review/summary", None)]:
            self.assertEqual(self.req(m, p, b, code="")[0], 401, p)
            self.assertEqual(self.req(m, p, b, code="bad")[0], 401, p)

    def test_catalog_matches_ai_endpoints(self):
        st, cat = self.req("GET", "/api/catalog")
        self.assertEqual(st, 200)
        by = {j["id"]: j for j in cat["jobs"]}
        self.assertEqual(set(by), {"quiz", "passage"})
        p = {x["name"]: x for x in by["quiz"]["params"]}
        self.assertEqual(p["level"]["enum"], ["N1", "N2", "N3", "N4", "N5"])
        self.assertEqual(set(p["mode"]["enum"]), set(routes_ai.MODES))
        self.assertEqual((p["n"]["min"], p["n"]["max"]), (3, 15))
        # 目录给出的边界值，/api/ai/quiz 的校验也必须接受/拒绝
        fields = routes_ai.QuizIn.model_fields["n"].metadata
        self.assertEqual({type(m).__name__: (m.ge if hasattr(m, "ge") else m.le) for m in fields}, {"Ge": 3, "Le": 15})
        for j in cat["jobs"]:
            self.assertTrue(j["consumes_claude"])

    # ── 参数校验 ──
    def test_param_validation_400(self):
        bad = [{"kind": "nope", "params": {}}, {"kind": "quiz", "params": {"level": "N9"}},
               {"kind": "quiz", "params": {"n": 2}}, {"kind": "quiz", "params": {"n": 16}},
               {"kind": "quiz", "params": {"mode": "x"}}, {"kind": "quiz", "params": {"context": "x"}},
               {"kind": "passage", "params": {"level": "n4"}}, {"kind": "passage", "params": {"topic": "x" * 61}}]
        for b in bad:
            st, r = self.req("POST", "/api/jobs", b)
            self.assertEqual(st, 400, b)
            self.assertRegex(r["detail"], "[一-鿿]")
        self.assertEqual(self.req("POST", "/api/jobs", {})[0], 422)  # 缺 kind 属于请求体结构错误
        self.assertFalse(routes_ext.JOBS)

    def test_unknown_job_404(self):
        self.assertEqual(self.req("GET", "/api/jobs/nonexistent")[0], 404)

    # ── 状态流转 / 互斥 ──
    def test_quiz_job_lifecycle_and_409(self):
        self.fake.gate, self.fake.out = threading.Event(), GOOD_QUIZ
        st, r = self.req("POST", "/api/jobs", {"kind": "quiz", "params": {"level": "N3", "mode": "vocab", "n": 5}})
        self.assertEqual(st, 200)
        jid = r["job_id"]
        _, j = self.req("GET", "/api/jobs/" + jid)
        self.assertEqual(j["status"], "running")
        self.assertTrue(0 <= j["progress"] < 1 and j["phase"] and j["result"] is None and j["error_message"] is None)
        st, r2 = self.req("POST", "/api/jobs", {"kind": "passage", "params": {}})
        self.assertEqual(st, 409)
        self.fake.gate.set()
        j = self.wait(jid)
        self.assertEqual(j["progress"], 1.0)
        qs = j["result"]["questions"]
        self.assertEqual(len(qs), 5)
        for q in qs:
            self.assertEqual(set(q) >= {"q", "options", "answer", "explain"}, True)
            self.assertEqual(len(q["options"]), 4)
            self.assertIn(q["answer"], range(4))
            self.assertEqual(q["options"][q["answer"]], "い")  # 随机打乱后答案下标仍指向正确项
        # 结束后可以再发
        self.assertEqual(self.req("POST", "/api/jobs", {"kind": "quiz", "params": {}})[0], 200)

    def test_passage_job_and_status_values(self):
        self.fake.out = GOOD_PASSAGE
        _, r = self.req("POST", "/api/jobs", {"kind": "passage", "params": {"level": "N5", "topic": "买东西"}})
        j = self.wait(r["job_id"])
        self.assertEqual(j["status"], "done")
        self.assertEqual([d["text"] for d in j["result"]["dialog"]], ["こんにちは", "元気ですか", "はい"])
        self.assertEqual(len(j["result"]["translation"]), 3)
        self.assertNotIn("id", j["result"])

    def test_error_state(self):
        self.fake.err = "AI 返回的内容无法解析，请重试"
        _, r = self.req("POST", "/api/jobs", {"kind": "quiz", "params": {}})
        j = self.wait(r["job_id"], "error")
        self.assertIn("无法解析", j["error_message"])
        self.assertIsNone(j["result"])
        self.fake.err, self.fake.out = None, {"questions": []}  # 题不够规范 → HTTPException 502 → error
        _, r = self.req("POST", "/api/jobs", {"kind": "quiz", "params": {}})
        self.assertEqual(self.wait(r["job_id"], "error")["status"], "error")

    # ── 无副作用 ──
    def test_jobs_do_not_touch_learning_data(self):
        c = sqlite3.connect(db.DB_PATH)
        c.execute("INSERT INTO cards(word,created_at,due) VALUES('食べる',1,1)")
        c.execute("INSERT INTO mistakes(ts,level,question,picked) VALUES(1,'N4','{\"q\":\"x\"}',0)")
        c.commit()
        c.close()
        before = self.counts()
        for kind, out in (("quiz", GOOD_QUIZ), ("passage", GOOD_PASSAGE)):
            self.fake.out = out
            _, r = self.req("POST", "/api/jobs", {"kind": kind, "params": {}})
            self.wait(r["job_id"])
        self.req("GET", "/api/review/summary")
        self.req("GET", "/api/catalog")
        self.assertEqual(self.counts(), before)
        self.assertEqual(before["passages"], 0)

    def test_old_passage_endpoint_still_saves(self):
        self.fake.out = GOOD_PASSAGE
        n = self.counts()["passages"]
        st, r = self.req("POST", "/api/ai/passage", {"level": "N4"})
        self.assertEqual(st, 200)
        self.assertGreater(r["id"], 0)
        self.assertEqual(self.counts()["passages"], n + 1)

    # ── review/summary ──
    def test_review_summary_readonly(self):
        before = self.counts()
        st, s = self.req("GET", "/api/review/summary")
        self.assertEqual(st, 200)
        self.assertEqual(set(s), {"due", "new", "total_cards", "mastered", "streak", "goal", "mistakes_open"})
        self.assertTrue(all(isinstance(v, int) for v in s.values()))
        for _ in range(3):
            self.req("GET", "/api/review/summary")
        self.assertEqual(self.counts(), before)
        st, full = self.req("GET", "/api/stats")  # 口径一致
        for k in s:
            self.assertEqual(s[k], full[k], k)


if __name__ == "__main__":
    unittest.main()
