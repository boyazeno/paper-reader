#!/bin/bash
# Debian post-install: run as root by dpkg after unpacking the package.
set -e

# Chromium's SUID sandbox helper must be owned by root and setuid (mode 4755),
# or the app aborts on launch ("chrome-sandbox ... is not configured correctly").
# This makes launches from a terminal work too (the desktop entry also passes
# --no-sandbox as a fallback).
sandbox='/opt/PaperReader/chrome-sandbox'
if [ -f "$sandbox" ]; then
  chown root:root "$sandbox" 2>/dev/null || true
  chmod 4755 "$sandbox" 2>/dev/null || true
fi

# Refresh desktop + MIME databases so the launcher entry and the PDF file
# association ("Open with Paper Reader") take effect.
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
if command -v update-mime-database >/dev/null 2>&1; then
  update-mime-database /usr/share/mime || true
fi

exit 0
