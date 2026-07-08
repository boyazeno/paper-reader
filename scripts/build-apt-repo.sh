#!/usr/bin/env bash
#
# Build a GPG-signed, apt-installable repository under ./public from the .deb(s)
# in ./dist. The layout is a standard pooled repo served as static files:
#
#   public/
#     .nojekyll                                  # tell GitHub Pages to serve as-is
#     index.html                                 # human-readable install page
#     paper-reader.gpg                            # public signing key (for signed-by=)
#     pool/main/<pkg>_<ver>_<arch>.deb
#     dists/stable/Release  Release.gpg  InRelease
#     dists/stable/main/binary-amd64/Packages(.gz)
#
# Any packages already present in ./public/pool (e.g. carried over from a prior
# gh-pages publish via $EXISTING) are kept, so old versions stay installable.
#
# Env:
#   GPG_KEY_ID     signing key id/fingerprint (required)
#   GPG_PASSPHRASE key passphrase (optional; empty for an unprotected key)
#   PAGES_URL      public base URL of the repo (for the install page/instructions)
#   EXISTING       dir holding a previously published repo to carry forward
#                  (default: _existing)
set -euo pipefail

OUT=public
EXISTING=${EXISTING:-_existing}
SUITE=stable
COMP=main
ARCH=amd64
ORIGIN="Paper Reader"
LABEL="Paper Reader"
PAGES_URL=${PAGES_URL:-https://EXAMPLE.github.io/paper-reader}
REPO_SLUG=${REPO_SLUG:-OWNER/REPO}

: "${GPG_KEY_ID:?set GPG_KEY_ID to the signing key id}"

gpg_sign() {
  gpg --batch --yes --pinentry-mode loopback --passphrase "${GPG_PASSPHRASE:-}" \
    --local-user "$GPG_KEY_ID" "$@"
}

rm -rf "$OUT"
mkdir -p "$OUT/pool/$COMP" "$OUT/dists/$SUITE/$COMP/binary-$ARCH"

# Carry forward previously published packages, then add the freshly built ones.
if [ -d "$EXISTING/pool" ]; then
  cp -rn "$EXISTING/pool/." "$OUT/pool/"
fi
shopt -s nullglob
debs=(dist/*.deb)
if [ ${#debs[@]} -eq 0 ]; then
  echo "no .deb found in ./dist — run 'npm run build:linux' first" >&2
  exit 1
fi
cp -f "${debs[@]}" "$OUT/pool/$COMP/"

pushd "$OUT" >/dev/null

# Package index (Filename paths are relative to the repo root).
dpkg-scanpackages --arch "$ARCH" pool > "dists/$SUITE/$COMP/binary-$ARCH/Packages"
gzip -9c "dists/$SUITE/$COMP/binary-$ARCH/Packages" > "dists/$SUITE/$COMP/binary-$ARCH/Packages.gz"

# Release index with checksums over the Packages files.
apt-ftparchive \
  -o "APT::FTPArchive::Release::Origin=$ORIGIN" \
  -o "APT::FTPArchive::Release::Label=$LABEL" \
  -o "APT::FTPArchive::Release::Suite=$SUITE" \
  -o "APT::FTPArchive::Release::Codename=$SUITE" \
  -o "APT::FTPArchive::Release::Components=$COMP" \
  -o "APT::FTPArchive::Release::Architectures=$ARCH" \
  release "dists/$SUITE" > "dists/$SUITE/Release"

# Detached + inline signatures apt looks for.
gpg_sign --armor --detach-sign -o "dists/$SUITE/Release.gpg" "dists/$SUITE/Release"
gpg_sign --clearsign -o "dists/$SUITE/InRelease" "dists/$SUITE/Release"

popd >/dev/null

# Public key as a binary keyring (drop-in for /etc/apt/keyrings via signed-by=).
gpg --export "$GPG_KEY_ID" > "$OUT/paper-reader.gpg"

touch "$OUT/.nojekyll"

cat > "$OUT/index.html" <<HTML
<!doctype html>
<meta charset="utf-8">
<title>Paper Reader — APT repository</title>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem}
pre{background:#111;color:#eee;padding:1rem;border-radius:8px;overflow:auto}code{font-family:ui-monospace,monospace}</style>
<h1>Paper Reader — install via apt</h1>
<p>Debian/Ubuntu (amd64):</p>
<pre><code>sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL ${PAGES_URL}/paper-reader.gpg | sudo tee /etc/apt/keyrings/paper-reader.gpg >/dev/null
echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/paper-reader.gpg] ${PAGES_URL} ${SUITE} ${COMP}" \\
  | sudo tee /etc/apt/sources.list.d/paper-reader.list
sudo apt update
sudo apt install paper-reader</code></pre>
<p>Or download the <code>.deb</code>/<code>.AppImage</code> directly from the
<a href="https://github.com/${REPO_SLUG}/releases">Releases</a> page.</p>
HTML

echo "Built signed repo in ./$OUT (key $GPG_KEY_ID)"
