#!/usr/bin/env bash
# macOS 双击即可启动（Finder 里双击；首次可能要右键 → 打开）。关闭这个终端窗口即停止服务。
cd "$(cd "$(dirname "$0")" && pwd)" || exit 1
PY=$(command -v python || command -v python3) || { echo "找不到 python"; read -r _; exit 1; }
"$PY" run.py "$@"
status=$?
[ $status -ne 0 ] && { echo; echo "启动失败（退出码 $status），按回车关闭"; read -r _; }
