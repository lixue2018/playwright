#!/usr/bin/env bash
# DevSecOps 制品上传（AKSK → /devops/upload）。
# 协议：multipart info + file + 四个 X-AKSK-* 头。
#
# 用法（在 playwright/ 根目录）:
#   bash scripts/devsecops/upload_artifact.sh /path/to/file.apk
#   DEVOPS_TYPE=windows APP_NAME='DS-Windows渗透无初审' PACKAGE_NAME='com.lenovo.ds.win01' \
#     bash scripts/devsecops/upload_artifact.sh "devsecops_file/app.exe"
# AK/SK 默认读 env.sh，也可用 SECLABAK / SECLABSK 覆盖。
#
# 环境变量见 scripts/devsecops/README.md；地址切换见 env.sh。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=env.sh
source "$SCRIPT_DIR/env.sh"

url="${UPLOAD_URL}"
ak="${SECLABAK}"
sk="${SECLABSK}"

devops_type="${DEVOPS_TYPE:?请设置 DEVOPS_TYPE，如 tablet_android / tablet_ios / windows}"
env_name="${JOB_NAME:-jenkins_devsecops_seed}"
branch="${BRANCH:-main}"
build_number="${BUILD_NUMBER:-1}"
app_label="${APP_NAME:-${LABEL:?请设置 APP_NAME 或 LABEL}}"
package_name="${PACKAGE_NAME:?请设置 PACKAGE_NAME}"
version_name="${VERSION_NAME:-1.0.0}"
version_code="${VERSION_CODE:-${build_number}}"
it_code="${IT_CODE:-fengtt1}"
mime="${MIME:-application/octet-stream}"

file="${1:-}"
if [[ -z "$file" ]]; then
  echo "错误:请传入要上传的文件路径。" >&2
  exit 1
fi
if [[ ! -f "$file" ]]; then
  echo "错误:文件不存在: $file" >&2
  exit 1
fi
# Git Bash / mingw curl 认 Windows 路径；中文或空格目录用 POSIX 路径会报 curl 26
if command -v cygpath >/dev/null 2>&1; then
  file="$(cygpath -am "$file")"
fi
# Git Bash / mingw curl 的 filename= 不能带非 ASCII，否则 Spring 落库成 U+FFFD
orig_filename="$(basename "$file")"
ascii_filename="$(printf '%s' "$orig_filename" | LC_ALL=C tr -cd 'A-Za-z0-9._-')"
if [[ -z "$ascii_filename" || "$ascii_filename" == .* ]]; then
  ext="${orig_filename##*.}"
  if [[ "$ext" != "$orig_filename" && "$ext" =~ ^[A-Za-z0-9]+$ ]]; then
    ascii_filename="upload.${ext}"
  else
    ascii_filename="upload.bin"
  fi
fi

# info 用 UTF-8 JSON 带真实文件名；multipart filename= 仍用 ASCII（curl 中文 header 会乱码）
json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  printf '%s' "$s"
}
if [[ -n "${INFO:-}" ]]; then
  info="$INFO"
else
  info=$(printf '%s' "{\"env\":\"$(json_escape "$env_name")\",\"branch\":\"$(json_escape "$branch")\",\"buildNumber\":\"$(json_escape "$build_number")\",\"devopsType\":\"$(json_escape "$devops_type")\",\"versionName\":\"$(json_escape "$version_name")\",\"versionCode\":\"$(json_escape "$version_code")\",\"label\":\"$(json_escape "$app_label")\",\"packageName\":\"$(json_escape "$package_name")\",\"itCode\":\"$(json_escape "$it_code")\",\"originalApkName\":\"$(json_escape "$orig_filename")\"}")
fi

if [[ -z "$sk" ]]; then
  echo "错误:请通过环境变量 SECLABSK（或 SK）提供 Secret Key，切勿把 sk 写入脚本。" >&2
  exit 1
fi
if [[ "$sk" == "$ak" || "$sk" == ak_pre_* || "$sk" == ak_pro_* || "$sk" == ak_test_* ]]; then
  echo "错误:SECLABSK 看起来是 AccessKey，不是 Secret Key。" >&2
  exit 1
fi

# Git Bash / macOS / Linux 兼容时间戳（毫秒）与 nonce
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

sign=$(printf 'AKSK_VALIDATE\n%s\n%s\n%s' "$ak" "$ts" "$nonce")
sig=$(printf '%s' "$sign" | openssl dgst -sha256 -hmac "$sk" | awk '{print $NF}')

echo "URL       : $url"
echo "上传文件  : $file"
echo "展示文件名: $orig_filename"
if [[ "$ascii_filename" != "$orig_filename" ]]; then
  echo "multipart名: $ascii_filename （仅 header 用 ASCII，展示名走 info.originalApkName）"
fi
echo "MIME      : $mime"
echo "devopsType: $devops_type"
echo "info      : $info"
echo "AK        : $ak"

tmp_body="$(mktemp)"
tmp_info="$(mktemp)"
if command -v cygpath >/dev/null 2>&1; then
  tmp_body="$(cygpath -am "$tmp_body")"
  tmp_info="$(cygpath -am "$tmp_info")"
fi
# info 走文件，避免 Git Bash / mingw curl 把 -F info=$json 里的中文转成系统码页
printf '%s' "$info" > "$tmp_info"
trap 'rm -f "$tmp_body" "$tmp_info"' EXIT

# Windows Git Bash / Schannel：吊销检查离线会报 CRYPT_E_REVOCATION_OFFLINE
curl_extra=()
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*) curl_extra+=(--ssl-no-revoke) ;;
esac

# 避免 MSYS 把 @D:/... 路径再转换一次
export MSYS2_ARG_CONV_EXCL="${MSYS2_ARG_CONV_EXCL:-*}"

auth_args=()
if [[ -n "${AUTH_TOKEN:-}" ]]; then
  token="$AUTH_TOKEN"
  [[ "$token" == Bearer* ]] || token="Bearer $token"
  auth_args+=(-H "Authorization:$token" -H "clientId:${CLIENT_ID:-yBQF1Ayq0G8HtG3193wOjapfEaOQgng6}" -H "client-type:client")
fi

http_code=$(
  curl -sS --connect-timeout 20 --max-time 600 --retry 2 \
    "${curl_extra[@]}" \
    "${auth_args[@]}" \
    -o "$tmp_body" -w "%{http_code}" \
    "$url" \
    -H "X-AKSK-Access-Key-Id:$ak" \
    -H "X-AKSK-Timestamp:$ts" \
    -H "X-AKSK-Nonce:$nonce" \
    -H "X-AKSK-Signature:$sig" \
    -F "info=<${tmp_info}" \
    -F "file=@${file};type=${mime};filename=${ascii_filename}"
)

echo "HTTP      : $http_code"
echo "响应体    :"
cat "$tmp_body"
echo

if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
  echo "错误:上传失败，HTTP $http_code" >&2
  exit 1
fi
if grep -q '"code"' "$tmp_body" && ! grep -Eq '"code"[[:space:]]*:[[:space:]]*200' "$tmp_body"; then
  echo "错误:业务失败，响应 code 不是 200" >&2
  exit 1
fi
echo "上传成功"
