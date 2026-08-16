#!/bin/bash
# デスクトップに「ゾンビシューティング.app」を作り直す。
# ゲームのフォルダを移動したときや、アイコンを作り直したときに使う。
set -e
GAME="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Desktop/ゾンビシューティング.app"
PORT=8765

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$GAME/icon/zombie.icns" "$APP/Contents/Resources/icon.icns"
printf 'APPL????' > "$APP/Contents/PkgInfo"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>ゾンビシューティング</string>
  <key>CFBundleDisplayName</key><string>ゾンビシューティング</string>
  <key>CFBundleIdentifier</key><string>local.zombie.shooting</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>run</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

cat > "$APP/Contents/MacOS/run" <<RUN
#!/bin/bash
# ゾンビシューティングを起動する。
# ブラウザは file:// からモジュールを読めないので、
# 小さなサーバーを立ててから開く。
GAME="$GAME"
PORT=$PORT
URL="http://localhost:\$PORT/index.html"

if [ ! -f "\$GAME/index.html" ]; then
  osascript -e 'display alert "ゲームが見つかりません" message "ゲームのフォルダが見あたりません。フォルダを移動した場合は tools/make-app.sh を実行して作り直してください。" as critical'
  exit 1
fi

# すでに動いていれば、それをそのまま使う
if ! curl -s -o /dev/null --max-time 1 "\$URL"; then
  cd "\$GAME" || exit 1
  nohup python3 -m http.server "\$PORT" >/dev/null 2>&1 &
  # 立ち上がるまで待つ（最大4秒）
  for _ in \$(seq 1 20); do
    curl -s -o /dev/null --max-time 1 "\$URL" && break
    sleep 0.2
  done
fi

open "\$URL"
RUN

chmod +x "$APP/Contents/MacOS/run"
touch "$APP"
echo "できました: $APP"
