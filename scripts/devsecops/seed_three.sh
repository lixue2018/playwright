#!/usr/bin/env bash
# 按约定造 3 条数据（各上传 1 个文件）：Android 基线 / iOS 基线 / Windows 渗透。
# 在 playwright/ 根目录执行:
#   bash scripts/devsecops/seed_three.sh
#
# 可选只跑其中几条:
#   bash scripts/devsecops/seed_three.sh android
#   bash scripts/devsecops/seed_three.sh android ios
#   bash scripts/devsecops/seed_three.sh win

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# shellcheck source=env.sh
source "$SCRIPT_DIR/env.sh"

if [[ -z "${SECLABSK:-}" ]]; then
  echo "错误:SECLABSK 为空，请在 env.sh 或环境变量中配置。" >&2
  exit 1
fi

targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  targets=(android ios win)
fi

run_one() {
  local name="$1"
  echo
  echo "======== 开始: $name ========"
  case "$name" in
    android|apk|baseline-android)
      bash "$SCRIPT_DIR/seed_baseline_android.sh"
      ;;
    ios|ipa|baseline-ios)
      bash "$SCRIPT_DIR/seed_baseline_ios.sh"
      ;;
    win|windows|win01)
      bash "$SCRIPT_DIR/seed_win_app.sh"
      ;;
    *)
      echo "错误:未知目标 '$name'（可用 android / ios / win）" >&2
      exit 1
      ;;
  esac
  echo "======== 完成: $name ========"
}

for t in "${targets[@]}"; do
  run_one "$t"
done

echo
echo "全部完成。请到 pre 后台核对节点日志，并回填 fixtures/devsecops/fixture_projects.json。"
