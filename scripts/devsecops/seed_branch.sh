#!/usr/bin/env bash
# 3.6 隐私 / 基线 / 渗透：同一项目连传 5 包（同应用不同分支）。
# 先不要立即执行；5 次传完再点。
#
#   bash scripts/devsecops/seed_branch.sh           # 安卓 + Windows
#   bash scripts/devsecops/seed_branch.sh android
#   bash scripts/devsecops/seed_branch.sh win
#
# 设置_1.0.0060*.apk 不在本脚本里（留给静态检测成功）。

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=env.sh
source "$SCRIPT_DIR/env.sh"

FILE_DIR="$SCRIPT_DIR/devsecops_file"
ANDROID_APK="${ANDROID_APK:-$FILE_DIR/天骄学堂隐私基线.apk}"
WIN_EXE="${WIN_EXE:-$FILE_DIR/AudioDriverSetup渗透.exe}"

# 5 连：同分支取最新。期望扫 akssk/T2、dev/T5、pre/T4
BRANCHES=(akssk akssk dev pre dev)
BUILDS=(T1 T2 T3 T4 T5)

targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  targets=(android win)
fi

upload_five() {
  local kind="$1"
  local file="$2"
  echo
  echo "======== 3.6 五连传: $kind ========"
  echo "文件: $file"
  if [[ ! -f "$file" ]]; then
    echo "错误:文件不存在: $file" >&2
    exit 1
  fi
  local i
  for i in "${!BRANCHES[@]}"; do
    export BRANCH="${BRANCHES[$i]}"
    export BUILD_NUMBER="${BUILDS[$i]}"
    echo
    echo "----- $kind  ${BUILD_NUMBER}  branch=${BRANCH} -----"
    case "$kind" in
      android)
        bash "$SCRIPT_DIR/seed_baseline_android.sh" "$file"
        ;;
      win)
        bash "$SCRIPT_DIR/seed_win_app.sh" "$file"
        ;;
    esac
    sleep 2
  done
  echo "======== 完成: $kind ========"
}

for t in "${targets[@]}"; do
  case "$t" in
    android|apk)
      export DEVOPS_TYPE=tablet_android
      export APP_NAME="${APP_NAME_ANDROID:-DS-多分支}"
      export PACKAGE_NAME="${PACKAGE_NAME_ANDROID:-com.lenovo.ds.branch01}"
      export MIME=application/vnd.android.package-archive
      upload_five android "$ANDROID_APK"
      ;;
    win|windows)
      export DEVOPS_TYPE=windows
      export APP_NAME="${APP_NAME_WIN:-DS-多分支-渗透}"
      export PACKAGE_NAME="${PACKAGE_NAME_WIN:-com.lenovo.ds.win03}"
      export MIME=application/x-msdownload
      upload_five win "$WIN_EXE"
      ;;
    *)
      echo "错误:未知目标 '$t'（可用 android / win）" >&2
      exit 1
      ;;
  esac
done

echo
echo "五连传完成。请立即执行对应节点，期望每个节点 3 条日志（akssk/dev/pre 各最新）。"
