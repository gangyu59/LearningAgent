# 部署说明（Mac mini，与 OmniTwin 同一套做法）

にほんご 是单页应用（`web/`）+ Python 后端（`server/`），同一个进程提供页面和 `/api/*`，本机默认端口 **19610**（19590 是 OmniTwin，19600 是 AInvestor）。
- AI 只用本机已登录的 **Claude 订阅（`claude` 命令行）**：对话/查词/翻译/讲解用 haiku，出题和生成教材用 sonnet。代码里没有任何 API Key。
- 识别用本机 **Whisper**，朗读用微软 **edge-tts**。
- 学习数据（生词卡、复习进度、错题、对话记录、设置）存 **SQLite：`data/learning.db`**，部署不会覆盖；换机器时拷这个文件即可。

## 本机（MacBook）开发
```
python run.py        # 或 ./start.sh；Finder 里也可以双击「启动 LearningAgent.command」
```
一个命令同时起前端和后端：首次自动建 `.venv` 并装依赖，服务就绪后自动打开浏览器（Ctrl+C 停止）。
端口上已有本服务时自动接管（停旧起新）；被别的程序占用则报错不乱杀。常用参数：
`--page chat` 直接打开日语对话 · `--no-browser` · `--attach`（已在运行就复用）· `--setup`（重建环境）。
不能用 file:// 或纯静态托管（Vercel 等）直接打开——没有后端。

## 部署到 Mac mini
沿用 Mac mini 上现有的做法：`keeper.sh` 监控 **8098** 端口，缺了就执行 `node LearningAgent/server.js`；
公网入口是 ngrok → `proxy.js`，`/learning/*` 转发到 8098。手机访问 `<ngrok 域名>/learning/`。

```
deploy/deploy.sh --dry-run   # 先看会推送哪些文件
deploy/deploy.sh             # rsync 推代码；后端有变动就结束旧进程，等 keeper 拉起新版本并检查健康
```
推送不会覆盖 Mac mini 上的 `.env` 和 `data/`（学习数据库在这里）。

首次部署（只需一次）：
1. 本机 `cp deploy/deploy.conf.example deploy/deploy.conf`，填 `MINI_HOST` / `MINI_DIR`。
2. Mac mini 项目目录建 `.env`：
   ```
   PORT=8098
   HOST=127.0.0.1
   JC_ACCESS_CODE=访问口令
   JC_PYTHON=/path/to/已装好依赖的/python    # 省略则用项目自己的 .venv（python run.py --setup-only 建立）
   ```
3. Mac mini 上需要已登录 `claude`。Python 依赖见 `requirements.txt`，可用 `JC_PYTHON` 复用其他项目的环境，避免重复下载。

[server.js](server.js) 只是启动器：读 `.env`，拉起 `run.py`。服务日志在 `/tmp/learningagent.log`。

## 环境变量（写在 `.env` 里或启动前设置）
| 变量 | 作用 |
|---|---|
| `JC_ACCESS_CODE` | 设置后 `/api/*` 需要口令（页面会弹窗询问并记在本机）。通过 ngrok 暴露公网时建议 basic-auth 和口令二选一或都开 |
| `JC_CLAUDE_MODEL` | 对话模型，默认 `haiku`（最经济最快）；界面里不提供切换，要换在服务端设这个变量 |
| `JC_CLAUDE_GEN_MODEL` | 查词/翻译/讲解/复盘用的模型，默认同 `JC_CLAUDE_MODEL` |
| `JC_CLAUDE_QUIZ_MODEL` | 出题和生成听力材料用的模型，默认 `sonnet`（haiku 出的题有语病，不建议换） |
| `JC_DB` | 数据库路径，默认 `data/learning.db` |
| `JC_TTS_VOICE` | 默认朗读声音，默认 `ja-JP-NanamiNeural` |
| `JC_VOICE_PRELOAD=0` | 启动时不预加载 Whisper |
| `PORT` / `HOST` | 默认 19610 / 127.0.0.1 |
| `JC_PYTHON` | 仅 `server.js` 使用：指定运行服务的解释器 |
