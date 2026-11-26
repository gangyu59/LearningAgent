/**
 * Mac mini 启动器：keeper.sh 用 `node LearningAgent/server.js` 拉起并监控 8098 端口，
 * 这里只负责把 Python 服务（run.py）作为子进程拉起来；端口、口令等配置在项目根的 .env。
 * 子进程退出则本进程一起退出（keeper 会在 30 秒内重新拉起）。
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// .env 里可用 JC_PYTHON 指定解释器（Mac mini 上复用已装好依赖的环境，不另建 .venv）；否则用项目自己的 .venv
let envPy = process.env.JC_PYTHON || "";
try {
  const m = fs.readFileSync(path.join(ROOT, ".env"), "utf8").match(/^\s*JC_PYTHON\s*=\s*(.+?)\s*$/m);
  if (!envPy && m) envPy = m[1].replace(/^["']|["']$/g, "");
} catch (e) {}
const py = envPy || path.join(ROOT, ".venv", "bin", "python");
if (!fs.existsSync(py)) {
  console.error("找不到 Python：" + py + "\n在 .env 里设 JC_PYTHON=<已装好依赖的解释器>，或运行 python run.py --setup-only 建 .venv");
  process.exit(1);
}
const child = spawn(py, ["run.py", "--no-browser"], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, JC_NO_BROWSER: "1", JC_NO_AUTO_INSTALL: "1" },
});
child.on("exit", (code) => process.exit(code === null ? 1 : code));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => child.kill(sig));
