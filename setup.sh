#!/bin/bash
set -e

echo "==============================="
echo "  Loomify Setup"
echo "==============================="
echo ""

# Check Node.js
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  echo "[OK] Node.js gefunden: $NODE_VERSION"
else
  echo "[!] Node.js nicht gefunden."
  echo "    Bitte installieren: https://nodejs.org/ oder 'brew install node'"
  exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm -v)
  echo "[OK] npm gefunden: $NPM_VERSION"
else
  echo "[!] npm nicht gefunden."
  exit 1
fi

# Check yt-dlp
if command -v yt-dlp &> /dev/null; then
  echo "[OK] yt-dlp gefunden: $(yt-dlp --version)"
else
  echo "[!] yt-dlp nicht gefunden. Wird installiert..."
  if command -v brew &> /dev/null; then
    brew install yt-dlp
    echo "[OK] yt-dlp installiert"
  else
    echo "[!] Homebrew nicht gefunden. Bitte yt-dlp manuell installieren:"
    echo "    brew install yt-dlp"
    echo "    oder: pip install yt-dlp"
    exit 1
  fi
fi

echo ""
echo "Installiere npm Dependencies..."
npm install

echo ""
echo "==============================="
echo "  Setup abgeschlossen!"
echo "==============================="
echo ""
echo "Starte den Server mit:"
echo "  npm run dev"
echo ""
echo "Dann oeffne http://localhost:3002 im Browser"
echo "und gib deine API-Keys in den Einstellungen ein."
echo ""
