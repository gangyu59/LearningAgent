"""LearningAgent 一键启动（唯一入口）。前端和后端是同一个进程：页面 + /api/*。

    python run.py                 启动并在服务就绪后自动打开浏览器（Ctrl+C 停止）
    python run.py --setup         重建 .venv 并重装依赖，然后启动
    python run.py --setup-only    只准备环境（建 .venv、装依赖）后退出，部署脚本用
    python run.py --no-browser    不开浏览器
    python run.py --attach        端口上已有本服务就复用它，不重启
    python run.py --page chat     启动后打开的页面：home（首页）/ chat（日语对话）/ review（复习）

缺依赖时自动建 .venv、装 requirements.txt、再用 .venv 重跑；不需要自己激活环境。
端口上已有本服务时默认接管（停旧起新），避免孤儿进程；端口被别的程序占用则报错，不会乱杀。
环境变量：PORT（默认 19610）、HOST（默认 127.0.0.1）、JC_ACCESS_CODE、JC_CLAUDE_MODEL、
JC_NO_BROWSER=1、JC_NO_AUTO_INSTALL=1、JC_VOICE_PRELOAD=0
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

IS_WIN = os.name == "nt"
VENV_DIR = ROOT / ".venv"
VENV_PY = VENV_DIR / ("Scripts/python.exe" if IS_WIN else "bin/python")
DEFAULT_PORT = 19610   # 本机端口：19590 OmniTwin · 19600 AInvestor · 19610 LearningAgent（Mac mini 上由 .env 改成 8098）
CORE_DEPS = ("fastapi", "uvicorn", "edge_tts", "numpy")
PAGES = {"home": "/", "chat": "/#/chat", "review": "/#/review"}


# ───────── 环境引导（只用标准库，系统自带 python3 就能跑） ─────────
def _missing() -> list:
    import importlib.util
    return [m for m in CORE_DEPS if importlib.util.find_spec(m) is None]


def in_project_venv() -> bool:
    try:
        return Path(sys.prefix).resolve() == VENV_DIR.resolve()
    except OSError:
        return False


def _pick_base_python() -> str:
    """建 .venv 用哪个解释器：优先较新的版本（mlx-whisper 等在新版本上更稳）。"""
    for name in ("python3.13", "python3.12", "python3.11", "python3.10"):
        pyenv = sorted((Path.home() / ".pyenv/versions").glob("%s*/bin/%s" % (name[6:], name)))
        p = shutil.which(name) or str(Path.home() / ".local/bin" / name) or ""
        if not (p and Path(p).is_file()) and pyenv:
            p = str(pyenv[-1])
        if p and Path(p).is_file() and os.access(p, os.X_OK):
            return p
    return sys.executable


def _pip_install() -> None:
    py = str(VENV_PY)
    subprocess.check_call([py, "-m", "pip", "install", "-q", "--upgrade", "pip"])
    subprocess.check_call([py, "-m", "pip", "install", "-q", "-r", str(ROOT / "requirements.txt")])


def _exec_venv() -> None:
    if os.environ.get("JC_VENV_HOP") == "1":
        print("✗ 已经切到 .venv 但没生效（sys.prefix=%s）。试 python run.py --setup 重建。" % sys.prefix, file=sys.stderr)
        sys.exit(1)
    os.environ["JC_VENV_HOP"] = "1"
    os.execv(str(VENV_PY), [str(VENV_PY), str(ROOT / "run.py")] + sys.argv[1:])


def ensure_environment(force: bool) -> None:
    if os.environ.get("JC_NO_AUTO_INSTALL") == "1" and not force:
        miss = _missing()
        if miss:
            print("✗ 缺依赖：%s\n  pip install -r requirements.txt" % ", ".join(miss), file=sys.stderr)
            sys.exit(1)
        return
    if not force:
        miss = _missing()
        if not miss:
            return
        if not in_project_venv() and VENV_PY.exists():   # 当前解释器缺依赖，但 .venv 可能是齐的
            probe = subprocess.run([str(VENV_PY), "-c", "import " + ", ".join(CORE_DEPS)], capture_output=True)
            if probe.returncode == 0:
                print("▸ 切到项目 .venv", flush=True)
                _exec_venv()
        print("▸ 缺依赖 %s，自动准备 .venv（首次约需几分钟）…" % ", ".join(miss), flush=True)
    else:
        print("▸ --setup：重建依赖环境…", flush=True)
    if not VENV_PY.exists():
        base = _pick_base_python()
        print("▸ 用 %s 建立 .venv" % base, flush=True)
        subprocess.check_call([base, "-m", "venv", str(VENV_DIR)])
    _pip_install()
    if not in_project_venv():
        _exec_venv()


# ───────── 服务探测 / 端口 ─────────
def probe_service(port: int, host: str = "127.0.0.1", timeout: float = 1.0):
    """端口上是不是本服务？是 → health 字典；没人监听 → None；别的程序 → False。"""
    try:
        with urllib.request.urlopen("http://%s:%d/api/health" % (host, port), timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError, TimeoutError):
        return None if port_is_free(port) else False
    return data if data.get("service") == "learningagent" else False


def port_is_free(port: int) -> bool:
    import socket
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) != 0


def kill_listeners(port: int) -> list:
    if IS_WIN or not shutil.which("lsof"):
        return []
    out = subprocess.run(["lsof", "-ti", "tcp:%d" % port, "-sTCP:LISTEN"], capture_output=True, text=True).stdout.split()
    pids = [int(p) for p in out if p.isdigit() and int(p) != os.getpid()]
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
    return pids


def wait_ready(port: int, deadline_s: float = 40.0) -> bool:
    end = time.time() + deadline_s
    while time.time() < end:
        if probe_service(port, timeout=0.6):
            return True
        time.sleep(0.25)
    return False


def open_browser_later(url: str, port: int) -> None:
    def _go() -> None:
        if wait_ready(port):
            webbrowser.open(url)
        else:
            print("⚠ 40 秒内没等到服务就绪，没开浏览器。手动访问：%s" % url, file=sys.stderr)
    threading.Thread(target=_go, daemon=True).start()


def banner(port: int, pid, attached: bool = False) -> None:
    print("")
    print("  ╔═══════════════════════════════════════════════╗")
    print("  ║  LearningAgent · にほんご                     ║")
    print("  ╚═══════════════════════════════════════════════╝")
    print("")
    print("   首页      http://127.0.0.1:%d/" % port)
    print("   日语对话  http://127.0.0.1:%d/#/chat" % port)
    print("   健康检查  http://127.0.0.1:%d/api/health" % port)
    print("")
    print("   ⚠ 服务在另一个进程里（pid %s），本窗口马上退出；要停：kill %s。" % (pid, pid) if attached
          else "   Ctrl+C 停止（pid %s；停不掉就 kill -9 %s）" % (pid, pid))
    print("")
    sys.stdout.flush()


def install_exit_handlers(port: int) -> None:
    """两段式退出：第一次 Ctrl+C 温和停，第二次强制退出并释放端口。"""
    state = {"n": 0}

    def _h(signum, _frame):
        if state["n"] >= 1:
            print("\n▸ 强制退出…", flush=True)
            kill_listeners(port)
            os._exit(130 if signum == signal.SIGINT else 0)
        state["n"] += 1
        print("\n▸ 正在停止…（没反应就再按一次 Ctrl+C）", flush=True)
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, _h)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _h)


def load_dotenv() -> None:
    """读项目根目录的 .env（KEY=VALUE，不覆盖已有环境变量）：Mac mini 上的端口、口令等本机配置放这里，不进 git、不被部署覆盖。"""
    f = ROOT / ".env"
    if not f.is_file():
        return
    for line in f.read_text("utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main() -> None:
    load_dotenv()
    ap = argparse.ArgumentParser(description="LearningAgent 一键启动")
    ap.add_argument("--setup", action="store_true", help="重建 .venv 并装依赖")
    ap.add_argument("--setup-only", action="store_true", help="只准备环境后退出")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--page", choices=sorted(PAGES), default="home")
    ap.add_argument("--port", type=int, default=None)
    ap.add_argument("--host", default=None)
    ap.add_argument("--attach", action="store_true", help="已有本服务就复用并退出")
    args = ap.parse_args()

    ensure_environment(force=args.setup)
    if args.setup_only:
        print("✅ 环境就绪：%s" % VENV_PY)
        return

    port = args.port or int(os.environ.get("PORT", DEFAULT_PORT))
    host = args.host or os.environ.get("HOST", "127.0.0.1")
    url = "http://127.0.0.1:%d%s" % (port, PAGES[args.page])
    no_browser = args.no_browser or os.environ.get("JC_NO_BROWSER") == "1"

    existing = probe_service(port)
    if existing and args.attach:
        print("▸ --attach：端口 %d 上已有本服务（pid %s），复用它。" % (port, existing.get("pid")))
        banner(port, existing.get("pid"), attached=True)
        if not no_browser:
            webbrowser.open(url)
        return
    if existing is False:
        print("✗ 端口 %d 被别的程序占用（不是 LearningAgent），没法启动。\n  看一眼：lsof -nP -iTCP:%d -sTCP:LISTEN\n  或换端口：PORT=19601 python run.py"
              % (port, port), file=sys.stderr)
        sys.exit(1)
    if existing:
        print("▸ 端口 %d 上已有本服务（pid %s），接管：停掉它，用本窗口重起。" % (port, existing.get("pid")))
        kill_listeners(port)
        for _ in range(25):
            if port_is_free(port):
                break
            time.sleep(0.2)
        else:
            print("✗ 旧进程没退出，端口 %d 仍被占用。" % port, file=sys.stderr)
            sys.exit(1)

    install_exit_handlers(port)
    # 应用在这里就导入：导入失败要在横幅之前炸出来，否则 URL 一个都打不开
    from server.app import app
    if not no_browser:
        open_browser_later(url, port)
    banner(port, os.getpid())

    import uvicorn
    uvicorn.run(app, host=host, port=port, log_level=os.environ.get("JC_LOG_LEVEL", "warning"),
                timeout_graceful_shutdown=8)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n▸ 已停止。")
