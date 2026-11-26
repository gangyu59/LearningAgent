#!/usr/bin/env bash
# LearningAgent 一键启动（等价于 python run.py，参数原样传递）
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || exit 1
PY=$(command -v python || command -v python3) || { echo "找不到 python"; exit 1; }
exec "$PY" run.py "$@"
