# Publishing Paper Reader via `apt`

This repo ships a GitHub Actions pipeline that, on every version tag, builds the
Linux installers and publishes a **GPG-signed APT repository to GitHub Pages** so
anyone can:

```bash
sudo apt install paper-reader
```

- Workflow: [`.github/workflows/release.yml`](.github/workflows/release.yml)
- Repo generator: [`scripts/build-apt-repo.sh`](scripts/build-apt-repo.sh)
- Hosting: the `gh-pages` branch, served at `https://<owner>.github.io/<repo>`
- Scope: `amd64` Debian/Ubuntu. Old versions stay installable (the generator
  carries forward previously published `.deb`s).

---

## One-time maintainer setup

### 1. (Recommended) fix the package metadata

Before the first public release, set real values so the `.deb` control fields and
site links are correct:

- `package.json` → `"homepage"` → `https://github.com/<owner>/<repo>`
- `electron-builder.yml` → `maintainer:` → `Your Name <you@example.com>`

### 2. Create a GPG signing key

Use a dedicated key for signing the repository (not your personal identity key):

```bash
gpg --batch --gen-key <<EOF
%no-protection
Key-Type: eddsa
Key-Curve: ed25519
Key-Usage: sign
Name-Real: Paper Reader
Name-Email: you@example.com
Expire-Date: 0
%commit
EOF

# note the fingerprint
gpg --list-secret-keys --with-colons | awk -F: '/^fpr:/ {print $10; exit}'
```

### 3. Add the key as repo secrets

```bash
# armored private key → secret consumed by the workflow
gpg --armor --export-secret-keys <FINGERPRINT> > private.key
gh secret set GPG_PRIVATE_KEY < private.key
rm private.key                     # keep this file out of git!

# only if you protected the key with a passphrase:
gh secret set GPG_PASSPHRASE       # then type the passphrase
```

(Or add them via **Settings → Secrets and variables → Actions**.)

The **public** key is exported automatically by the pipeline and served at
`…/paper-reader.gpg` for users — you don't add it manually.

### 4. Put the code on GitHub

This folder isn't a git repo yet:

```bash
git init -b main
git add .
git commit -m "Paper Reader"
gh repo create <owner>/<repo> --public --source=. --push
```

The repo must be **public** for free GitHub Pages hosting.

### 5. Release

```bash
git tag v0.2.1
git push origin v0.2.1
```

This runs the workflow: it builds the `.deb`/`.AppImage`, signs and publishes the
APT repo to `gh-pages`, and attaches the installers to a GitHub Release.

### 6. Enable GitHub Pages (once, after the first run)

**Settings → Pages → Build and deployment → Source: Deploy from a branch →
Branch: `gh-pages` / `(root)`**. Within a minute the repo is live at
`https://<owner>.github.io/<repo>/` (a friendly install page is served there too).

---

## What end users run

```bash
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://<owner>.github.io/<repo>/paper-reader.gpg \
  | sudo tee /etc/apt/keyrings/paper-reader.gpg >/dev/null

echo "deb [signed-by=/etc/apt/keyrings/paper-reader.gpg] https://<owner>.github.io/<repo> stable main" \
  | sudo tee /etc/apt/sources.list.d/paper-reader.list

sudo apt update
sudo apt install paper-reader
```

Updates then arrive with normal `sudo apt update && sudo apt upgrade`.

---

## Testing the repo generation locally

You can produce and inspect the signed repo without CI (uses a key in your
keyring):

```bash
npm run build:linux          # produces dist/*.deb
GPG_KEY_ID=<FINGERPRINT> \
PAGES_URL="https://<owner>.github.io/<repo>" \
REPO_SLUG="<owner>/<repo>" \
  scripts/build-apt-repo.sh  # writes ./public

# sanity check
gpg --verify public/dists/stable/InRelease
```

Point a throwaway apt config at `file://$PWD/public` to dry-run an install.

---

## Notes & limitations

- **amd64 only.** electron-builder currently targets `amd64`; add `arm64` by
  extending the build matrix and `Architectures` in the generator.
- **Keep the private key safe.** Losing it means users must re-add a new key;
  leaking it lets others sign packages as you.
- **Alternatives** (not wired up here): Cloudsmith/packagecloud (managed hosting)
  or a self-hosted `aptly`/`reprepro` repo — say the word and I'll swap the
  publish step.
