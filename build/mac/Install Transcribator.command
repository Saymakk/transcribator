#!/bin/bash
# Double-click in the DMG: copy to /Applications and clear Gatekeeper quarantine.

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/Transcribator.app"
DEST="/Applications/Transcribator.app"

if [[ ! -d "$SRC" ]]; then
  osascript -e 'display alert "Transcribator.app не найден в этом окне DMG." message "Запускайте «Install Transcribator.command» из той же папки, где лежит Transcribator.app." as critical'
  exit 1
fi

do_install() {
  rm -rf "$DEST"
  cp -R "$SRC" "$DEST"
  xattr -cr "$DEST" || true
}

if ! do_install 2>/dev/null; then
  SRC_Q=$(printf '%q' "$SRC")
  DEST_Q=$(printf '%q' "$DEST")
  osascript -e "do shell script \"rm -rf ${DEST_Q} && cp -R ${SRC_Q} ${DEST_Q} && xattr -cr ${DEST_Q}\" with administrator privileges"
fi

osascript -e 'display dialog "Transcribator установлен в /Applications.\nКарантин Gatekeeper снят автоматически." buttons {"Открыть"} default button 1 with title "Transcribator"'
open "$DEST"
