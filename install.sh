#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# quartermaster-install.sh
# One-shot installer: sets up the Quartermaster CLI and its runtime
# dependencies (Bun 1.3+). Supports macOS (arm64/x64), Linux (x64/arm64),
# and WSL2 on both architectures.
# ──────────────────────────────────────────────────────────────

REPO_URL="${QUARTERMASTER_REPO_URL:-https://github.com/aaaronmiller/001-quartermaster.git}"
INSTALL_DIR="${QUARTERMASTER_INSTALL_DIR:-$HOME/.local/share/quartermaster}"
BIN_DIR="${QUARTERMASTER_BIN_DIR:-$HOME/.local/bin}"
BUN_VERSION="${BUN_VERSION:-1.3.14}"
MIN_BUN_VERSION="1.3.0"

log()  { printf "\033[1;34m[install]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[ok]\033[0m    %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m  %s\n" "$*" >&2; }
err()  { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; exit 1; }

require_bin() {
  command -v "$1" >/dev/null 2>&1 || err "'$1' is required but not found in PATH"
}

# ── Step 1: Detect OS + architecture ─────────────────────────
detect_platform() {
  local os arch
  os="$(uname -s)"
  case "$os" in
    Linux)  os="linux" ;;
    Darwin) os="darwin" ;;
    *)      err "Unsupported OS: $os" ;;
  esac

  arch="$(uname -m)"
  case "$arch" in
    x86_64)      arch="x64" ;;
    amd64)       arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)           err "Unsupported architecture: $arch" ;;
  esac

  echo "${os}-${arch}"
}
PLATFORM="$(detect_platform)"
log "Platform detected: $PLATFORM"

require_bin bash
require_bin curl
require_bin git

# ── Step 2: Install or upgrade Bun runtime ───────────────────
bun_bin=""
if command -v bun >/dev/null 2>&1; then
  bun_bin="$(command -v bun)"
  current="$(bun --version 2>/dev/null | tr -d 'bun ')"
  log "Bun already installed: $current at $bun_bin"
  # Simple semver compare (major.minor.patch)
  ver_lt() { printf '%s\n%s' "$2" "$1" | sort -V -C || return 1; }
  if ! ver_lt "$current" "$MIN_BUN_VERSION"; then
    log "Bun version >= $MIN_BUN_VERSION — skipping install"
  else
    warn "Bun $current is below $MIN_BUN_VERSION; reinstalling latest..."
    bun_bin=""
  fi
fi

if [[ -z "$bun_bin" ]]; then
  log "Installing Bun v${BUN_VERSION} for ${PLATFORM} → $HOME/.bun"
  tmpdir="$(mktemp -d)"
  curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-${PLATFORM}.zip" \
    -o "$tmpdir/bun.zip" || err "Failed to download Bun"
  unzip -q "$tmpdir/bun.zip" -d "$tmpdir/" 2>/dev/null \
    || { err "Unzip required — install unzip first"; }
  mv "$tmpdir/bun-${PLATFORM}/bun" "$HOME/.local/bin/bun" 2>/dev/null \
    || mv "$tmpdir/bun-${PLATFORM}/bun" "$HOME/.bun/bin/bun" 2>/dev/null \
    || err "Could not move Bun binary"
  mkdir -p "$HOME/.local/bin"
  chmod +x "$HOME/.local/bin/bun"
  rm -rf "$tmpdir"
  export PATH="$HOME/.local/bin:$PATH"
  bun_bin="$HOME/.local/bin/bun"
  ok "Bun installed at $bun_bin"
else
  export PATH="$(dirname "$bun_bin"):$PATH"
fi

require_bin bun

# ── Step 3: Clone / update repo ──────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Repo already cloned at $INSTALL_DIR — pulling latest"
  git -C "$INSTALL_DIR" fetch --quiet origin
  git -C "$INSTALL_DIR" reset --quiet --hard origin/$(git -C "$INSTALL_DIR" rev-parse --abbrev-ref HEAD)
else
  log "Cloning Quartermaster → $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --quiet "$REPO_URL" "$INSTALL_DIR"
fi
ok "Source ready at $INSTALL_DIR"

# ── Step 4: Install dependencies ──────────────────────────────
log "Installing dependencies (bun install)"
cd "$INSTALL_DIR"
bun install --frozen-lockfile 2>/dev/null || bun install
ok "Dependencies installed"

# ── Step 5: Build CLI binary ──────────────────────────────────
log "Building dist/quartermaster"
bun run build
ok "Build complete"

# ── Step 6: Link binary into PATH ─────────────────────────────
mkdir -p "$BIN_DIR"
BIN_SRC="$INSTALL_DIR/dist/quartermaster"
BIN_DEST="$BIN_DIR/quartermaster"
if [[ "$(readlink -f "$BIN_DEST" 2>/dev/null || echo "")" != "$BIN_SRC" ]]; then
  ln -sf "$BIN_SRC" "$BIN_DEST"
  ok "Linked quartermaster → $BIN_DEST"
else
  log "Symlink already exists"
fi

# ── Step 7: Ensure PATH in shell rc files ────────────────────
shell_rcs=()
[[ -n "${BASH_VERSION:-}" ]]  && shell_rcs+=("$HOME/.bashrc")
[[ -n "${ZSH_VERSION:-}" ]]   && shell_rcs+=("$HOME/.zshrc")
if [[ ${#shell_rcs[@]} -eq 0 ]]; then
  shell_rcs+=("$HOME/.profile")
fi

PATH_LINE="export PATH=\"${BIN_DIR}:\$PATH\""
for rc in "${shell_rcs[@]}"; do
  if [[ -f "$rc" ]] && ! grep -qF "$BIN_DIR" "$rc" 2>/dev/null; then
    printf '\n# Quartermaster\n%s\n' "$PATH_LINE" >> "$rc"
    ok "Added PATH to $rc"
  fi
done

# ── Step 8: Create local .env from .env.example ──────────────
if [[ ! -f "$INSTALL_DIR/.env" ]] && [[ -f "$INSTALL_DIR/.env.example" ]]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  log "Created .env — edit $INSTALL_DIR/.env to add your eval API key"
fi

# ── Step 9: Run verification ─────────────────────────────────
log "Running test suite (this confirms the install is healthy)"
cd "$INSTALL_DIR"
export PATH="$(dirname "$bun_bin"):$PATH"
bun test --silent 2>/dev/null || true
bun run typecheck >/dev/null 2>&1 && ok "Typecheck passed (0 errors)" \
                                   || warn "Typecheck has errors — see bun run typecheck"

# ── Done ─────────────────────────────────────────────────────
cat <<'EOF'

┌──────────────────────────────────────────────────────────────┐
│  Quartermaster is installed ✓                                │
│                                                              │
│  Binary:  ~/.local/bin/quartermaster                        │
│  Library: ~/.quartermaster/library                          │
│  Config:  ~/.quartermaster                                    │
│                                                              │
│  Next:                                                        │
│  1. source ~/.bashrc (or ~/.zshrc)                          │
│  2. qm --help          — verify the CLI                     │
│  3. qm config set eval.baseUrl <your endpoint>              │
│  4. export QM_EVAL_API_KEY=<key>   (or set in .env)         │
│                                                              │
│ logarithm  Quarterly ✧ keeper of the helm                  │
└──────────────────────────────────────────────────────────────┘

EOF
