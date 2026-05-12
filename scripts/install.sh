#!/bin/sh
set -eu

REPO="${FERMI_REPO:-FelixRuiGao/Fermi}"
INSTALL_DIR="${FERMI_INSTALL_DIR:-$HOME/.fermi/bin}"

os="$(uname -s)"
arch="$(uname -m)"

# Normalize arch labels to what we publish.
case "$arch" in
  arm64|aarch64) arch_label="arm64" ;;
  x86_64|amd64)  arch_label="x64" ;;
  *) echo "fermi: unsupported architecture: $arch" >&2; exit 1 ;;
esac

# Map OS + arch to the published tarball name.
asset=""
case "$os" in
  Darwin)
    if [ "$arch_label" != "arm64" ]; then
      echo "fermi: macOS x64 is not published in this release; only Apple Silicon (arm64) is supported." >&2
      exit 1
    fi
    asset="fermi-darwin-arm64.tar.gz"
    ;;
  Linux)
    if [ "$arch_label" != "x64" ]; then
      echo "fermi: Linux arm64 is not published in this release; only Linux x64 is supported." >&2
      exit 1
    fi
    asset="fermi-linux-x64.tar.gz"
    ;;
  *)
    echo "fermi: unsupported OS: $os (this script supports Darwin and Linux; Windows users should download fermi-win32-x64.tar.gz directly from Releases)" >&2
    exit 1
    ;;
esac

if [ "${FERMI_VERSION:-}" ]; then
  url="https://github.com/${REPO}/releases/download/${FERMI_VERSION}/${asset}"
else
  url="https://github.com/${REPO}/releases/latest/download/${asset}"
fi

tmp="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp"
}
trap cleanup EXIT INT TERM

echo "Downloading $url"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$url" -o "$tmp/$asset"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$tmp/$asset" "$url"
else
  echo "fermi: curl or wget is required" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
tar -xzf "$tmp/$asset" -C "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/fermi" 2>/dev/null || true

# macOS only: strip Gatekeeper quarantine off the unsigned binary so
# it can launch without a manual right-click → Open dance.
if [ "$os" = "Darwin" ]; then
  xattr -dr com.apple.quarantine "$INSTALL_DIR/fermi" 2>/dev/null || true
fi

path_line='export PATH="$HOME/.fermi/bin:$PATH"'
profile=""
if [ -n "${SHELL:-}" ]; then
  case "$(basename "$SHELL")" in
    zsh) profile="$HOME/.zshrc" ;;
    bash) profile="$HOME/.bashrc" ;;
  esac
fi
[ -n "$profile" ] || profile="$HOME/.profile"

needs_source=0
if [ "$INSTALL_DIR" = "$HOME/.fermi/bin" ] && ! printf '%s' ":$PATH:" | grep -q ":$HOME/.fermi/bin:"; then
  touch "$profile"
  if ! grep -Fq "$path_line" "$profile"; then
    printf '\n%s\n' "$path_line" >> "$profile"
  fi
  needs_source=1
fi

if version=$("$INSTALL_DIR/fermi" --version 2>/dev/null); then
  installed_label="Installed Fermi $version"
else
  installed_label="Installed Fermi"
fi

echo
echo "✓ $installed_label"
echo
echo "To get started:"
if [ "$needs_source" = "1" ]; then
  echo "  source $profile"
fi
echo "  fermi init"
