#!/usr/bin/env bash
# 造数：基线 Android（一条数据，一个 apk）
# bash scripts/devsecops/seed_baseline_android.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FILE_DIR="$SCRIPT_DIR/devsecops_file"

export DEVOPS_TYPE="${DEVOPS_TYPE:-tablet_android}"
export APP_NAME="${APP_NAME:-DS-基线-Android}"
export PACKAGE_NAME="${PACKAGE_NAME:-com.lenovo.ds.baseline.android}"
export BUILD_NUMBER="${BUILD_NUMBER:-DS-BASELINE-ANDROID-1}"
export MIME="${MIME:-application/vnd.android.package-archive}"

file="${1:-$FILE_DIR/bpp_1.0.1.93.apk}"
exec bash "$SCRIPT_DIR/upload_artifact.sh" "$file"
