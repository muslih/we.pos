#!/usr/bin/env bash
# Menyiapkan database online Dexie Cloud.
#   bash setup-cloud.sh                               -> buat DB (sekali) + izinkan localhost
#   bash setup-cloud.sh https://fara-wash.vercel.app  -> + izinkan alamat produksi
set -e
cd "$(dirname "$0")"

if [ ! -f dexie-cloud.json ]; then
  echo "☁️  Membuat database Dexie Cloud. Masukkan email Anda, lalu kode OTP yang dikirim ke email."
  npx --yes dexie-cloud create
fi

DB_URL=$(grep -oE 'https://[a-z0-9]+\.dexie\.cloud' dexie-cloud.json | head -1)
[ -z "$DB_URL" ] && { echo "❌ URL database tidak ditemukan di dexie-cloud.json"; exit 1; }
echo "✅ Database: $DB_URL"

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
for ORIGIN in http://localhost:4321 ${IP:+http://$IP:4321} "$@"; do
  ORIGIN="${ORIGIN%/}"
  echo "🔓 Izinkan akses dari $ORIGIN"
  npx --yes dexie-cloud whitelist "$ORIGIN" || true
done

# .env (lokal). Build Vercel membaca dexie-cloud.json (ikut di-commit).
for F in .env; do
  if [ -f "$F" ] && grep -q '^PUBLIC_DEXIE_CLOUD_URL=' "$F"; then
    sed -i "s#^PUBLIC_DEXIE_CLOUD_URL=.*#PUBLIC_DEXIE_CLOUD_URL=$DB_URL#" "$F"
  else
    echo "PUBLIC_DEXIE_CLOUD_URL=$DB_URL" >> "$F"
  fi
done
echo "✅ .env berisi URL database. Pastikan dexie-cloud.json ikut di-commit (bukan dexie-cloud.key)."
echo ""
echo "Selanjutnya: git add . && git commit -m 'Aktifkan database online' && git push"
