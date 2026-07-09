#!/bin/bash
# Debian post-install (runs as root by dpkg). Mirrors electron-builder's default
# integration (the /usr/bin symlink + database refreshes), but forces the
# chrome-sandbox to setuid root unconditionally so the app also launches on
# userns-restricted kernels (Ubuntu 23.10+), and refreshes the icon cache so the
# launcher icon shows up right away — including on upgrades.
set -e

APP_DIR='/opt/PaperReader'
BIN="$APP_DIR/paper-reader"

# /usr/bin/paper-reader → the app binary.
if type update-alternatives >/dev/null 2>&1; then
  if [ -L '/usr/bin/paper-reader' ] && [ -e '/usr/bin/paper-reader' ] &&
    [ "$(readlink '/usr/bin/paper-reader')" != '/etc/alternatives/paper-reader' ]; then
    rm -f '/usr/bin/paper-reader'
  fi
  update-alternatives --install '/usr/bin/paper-reader' 'paper-reader' "$BIN" 100 ||
    ln -sf "$BIN" '/usr/bin/paper-reader'
else
  ln -sf "$BIN" '/usr/bin/paper-reader'
fi

# Chromium's SUID sandbox helper must be setuid root, else the app aborts on
# launch. (The desktop entry also passes --no-sandbox as a fallback.)
if [ -f "$APP_DIR/chrome-sandbox" ]; then
  chown root:root "$APP_DIR/chrome-sandbox" 2>/dev/null || true
  chmod 4755 "$APP_DIR/chrome-sandbox" 2>/dev/null || true
fi

# Refresh desktop/MIME databases (launcher entry + PDF file association).
if hash update-mime-database 2>/dev/null; then
  update-mime-database /usr/share/mime || true
fi
if hash update-desktop-database 2>/dev/null; then
  update-desktop-database /usr/share/applications || true
fi

# Refresh the hicolor icon cache so the launcher icon appears immediately.
if hash gtk-update-icon-cache 2>/dev/null; then
  gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true
fi

exit 0
