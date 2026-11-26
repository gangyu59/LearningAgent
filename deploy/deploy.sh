#!/usr/bin/env bash
# 把本地代码推送到 Mac mini（只传代码；不碰 Mac mini 上的 .venv 和 data/）。
#   deploy/deploy.sh            有变动才推送；后端代码有变动就重启服务
#   deploy/deploy.sh --dry-run  只列出会推送哪些文件
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
CONF="${DEPLOY_CONF:-$ROOT/deploy/deploy.conf}"
[ -f "$CONF" ] || { echo "缺少 ${CONF}（参考 deploy/deploy.conf.example）"; exit 1; }
# shellcheck disable=SC1090
. "$CONF"
[ -n "${MINI_DIR:-}" ] || { echo "配置里没有 MINI_DIR"; exit 1; }
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=10"
if [ -n "${MINI_HOST:-}" ]; then DEST="$MINI_HOST:$MINI_DIR/"; RSH=(-e "ssh $SSH_OPTS"); else DEST="$MINI_DIR/"; RSH=(); mkdir -p "$MINI_DIR"; fi
COMMON=(-azc --itemize-changes --exclude-from="$ROOT/deploy/rsync-exclude")
PLAN=$(rsync -n "${COMMON[@]}" ${RSH[@]+"${RSH[@]}"} ./ "$DEST") || { echo "比对失败（连不上 Mac mini？）"; exit 1; }
CHANGES=$(printf '%s\n' "$PLAN" | grep -E '^[<>c*][fdLDS]' || true)
N=$(printf '%s' "$CHANGES" | grep -c . || true)
[ "$N" -eq 0 ] && { echo "无代码变动，不推送"; exit 0; }
if [ "${1:-}" = "--dry-run" ]; then echo "演习：有 $N 项变动："; printf '%s\n' "$CHANGES" | head -50; exit 0; fi
# 自检：本机代码连 import 都过不了就不推送
if ! "$ROOT/.venv/bin/python" -c "import sys; sys.path.insert(0,'$ROOT'); import server.app" 2>/dev/null; then echo "自检失败：本机代码无法加载，未推送"; exit 1; fi
rsync "${COMMON[@]}" ${RSH[@]+"${RSH[@]}"} ./ "$DEST" >/dev/null || { echo "推送失败"; exit 1; }
echo "已推送 $N 项变动"
# 后端代码变了才需要新进程。这里只结束旧进程，拉起新进程由 Mac mini 上原有的 keeper.sh 负责（约 30 秒内）。
if [ "${MINI_RESTART:-0}" = 1 ] && [ -n "${MINI_HOST:-}" ] && printf '%s\n' "$CHANGES" | awk '{print $2}' | grep -qE '^(server/|server\.js|run\.py|requirements)'; then
  PORT="${MINI_PORT:-8098}"
  echo "后端有变动，结束 Mac mini 上 :$PORT 的旧进程，等待 keeper 拉起新版本…"
  ssh $SSH_OPTS "$MINI_HOST" "lsof -ti :$PORT -sTCP:LISTEN | xargs kill 2>/dev/null; true"
  up=0
  for _ in $(seq 1 30); do
    sleep 5
    if ssh $SSH_OPTS "$MINI_HOST" "curl -fs -m 3 localhost:$PORT/api/health" 2>/dev/null | grep -q learningagent; then up=1; break; fi
  done
  if [ "$up" = 1 ]; then echo "✅ Mac mini 上新版本已运行"; else echo "⚠ 2.5 分钟内没等到服务恢复，请查看 Mac mini 上 /tmp/learningagent.log"; exit 1; fi
fi
