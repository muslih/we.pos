#!/usr/bin/env bash
# Menjalankan Fara Wash di komputer ini.
#   ./jalankan.sh          -> mode development (http://localhost:4321)
#   ./jalankan.sh build    -> build produksi + preview (dengan service worker / PWA)
set -e
cd "$(dirname "$0")"

# 1. Cek Node.js (butuh >= 22.12)
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js belum terpasang."
  echo "   Pasang dengan nvm:"
  echo "     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
  echo "     source ~/.bashrc && nvm install 22"
  exit 1
fi
NODE_VER=$(node -p 'process.versions.node')
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)'; then
  echo "❌ Node.js $NODE_VER terlalu lama. Butuh versi 22.12 atau lebih baru."
  echo "   Jika memakai nvm:  nvm install 22 && nvm use 22"
  exit 1
fi
echo "✅ Node.js $NODE_VER"

# 2. Install dependency (sekali saja)
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "📦 Menginstal dependency..."
  npm install
  touch node_modules
fi

# 3. Info mode
if [ -f .env ] && grep -qE '^PUBLIC_DEXIE_CLOUD_URL=https://[a-z0-9]+\.dexie\.cloud' .env; then
  echo "☁️  Mode Dexie Cloud: $(grep '^PUBLIC_DEXIE_CLOUD_URL=' .env | cut -d= -f2)"
else
  echo "💾 Mode LOKAL (tanpa login & sinkron). Untuk login/sinkron jalankan: ./setup-cloud.sh"
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ "$1" = "build" ]; then
  npm run build
  echo ""
  echo "🚀 Landing page: http://localhost:4321   ·   Aplikasi: http://localhost:4321/app/"
  echo "   Dari HP (Wi-Fi sama): http://$IP:4321/app/"
  npx astro preview --host --port 4321
else
  echo ""
  echo "🚀 Landing page: http://localhost:4321   ·   Aplikasi: http://localhost:4321/app/"
  echo "   Dari HP (Wi-Fi sama): http://$IP:4321/app/"
  echo "   Tekan Ctrl+C untuk berhenti."
  npx astro dev --host --port 4321
fi
