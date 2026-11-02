#!/usr/bin/env bash
# 源码 SOURCE_PACKAGE 造数（日后用）。本次 3.6 不要执行。
#
# zip 优先 scripts/devsecops/devsecops_file/csl-psirt-server-cn.zip；
# 没有则用 192.168.50.206:/root/csl-psirt-server-cn.zip。
# 同一份 zip，换 filename= 冒充不同包。
#
# 只打 pre。同名只留最后一次，不同名都扫。

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/env.sh" ]]; then
  # shellcheck source=env.sh
  source "$SCRIPT_DIR/env.sh"
fi

# 生产 https://csl.lenovo.com/devops/upload 不要用
url="${UPLOAD_URL:-http://127.0.0.1:8080/loophole/tabletProject/receive}"
ak="${SECLABAK:-}"
sk="${SECLABSK:-}"
zip="${SOURCE_ZIP:-$SCRIPT_DIR/devsecops_file/csl-psirt-server-cn.zip}"
if [[ ! -f "$zip" && -f /root/csl-psirt-server-cn.zip ]]; then
  zip=/root/csl-psirt-server-cn.zip
fi
pkg="${PACKAGE_NAME:-com.lenovo.ds.src01}"
label="${APP_NAME:-DS-源码多分支}"
it_code="${IT_CODE:-fengtt1}"

if [[ ! -f "$zip" ]]; then
  echo "错误:找不到源码 zip: $zip" >&2
  echo "请把 zip 放到 $SCRIPT_DIR/devsecops_file/csl-psirt-server-cn.zip，或在 206 上执行，或设置 SOURCE_ZIP。" >&2
  exit 1
fi

upload() {
  local filename="$1" branch="$2" build="$3"
  local ts nonce sig
  if ts_ns="$(date +%s%N 2>/dev/null)" && [[ "$ts_ns" != *N* ]]; then
    ts=$((ts_ns / 1000000))
  else
    ts="$(date +%s)000"
  fi
  if command -v uuidgen >/dev/null 2>&1; then
    nonce="$(uuidgen | tr 'A-Z' 'a-z')"
  else
    nonce="$(openssl rand -hex 16)"
  fi
  sig=$(printf 'AKSK_VALIDATE\n%s\n%s\n%s' "$ak" "$ts" "$nonce" | openssl dgst -sha256 -hmac "$sk" | awk '{print $NF}')
  echo "===== ${filename}  branch=${branch}  build=${build} ====="
  curl -sS -w "\nHTTP:%{http_code}\n" --max-time 600 "$url" \
    -H "X-AKSK-Access-Key-Id:$ak" \
    -H "X-AKSK-Timestamp:$ts" \
    -H "X-AKSK-Nonce:$nonce" \
    -H "X-AKSK-Signature:$sig" \
    -F "info={\"devopsType\":\"source\",\"scanMode\":\"SOURCE_PACKAGE\",\"packageName\":\"${pkg}\",\"label\":\"${label}\",\"itCode\":\"${it_code}\",\"branch\":\"${branch}\",\"buildNumber\":\"${build}\",\"env\":\"jenkins\",\"versionName\":\"1.2.0\",\"versionCode\":\"120\",\"originalApkName\":\"${filename}\"}" \
    -F "file=@${zip};filename=${filename}"
  echo
  sleep 2
}

# 按时间从早到晚。同名只应扫最后一次，不同名都扫。
upload "zyf_branch2_source.zip" "release/branch2" "JENKINS-121"
upload "zyf_branch1_source.zip" "release/branch1" "JENKINS-122"
upload "zyf_branch4_source.zip" "release/branch4" "JENKINS-123"
upload "zyf_branch2_source.zip" "release/branch2" "JENKINS-124"
upload "zyf_branch3_source.zip" "release/branch3" "JENKINS-125"
upload "zyf_branch1_source.zip" "release/branch1" "JENKINS-126"

echo "源码包已推完（未立即执行）。到 pre 源码节点核对后回填 SRC01。"
