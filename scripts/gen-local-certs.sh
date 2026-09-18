#!/usr/bin/env bash
# Generate local CA + TLS cert for *.mini-kbp.site (Apache :443).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/docker/apache/certs"
mkdir -p "$DIR"
cd "$DIR"

if [[ -f mini-kbp.site.crt && -f mini-kbp.site.key && -f ca.crt ]]; then
  if openssl x509 -in mini-kbp.site.crt -noout -checkend 86400 >/dev/null 2>&1; then
    echo "Certs already present and valid: $DIR"
    openssl x509 -in mini-kbp.site.crt -noout -subject -dates -ext subjectAltName 2>/dev/null || true
    exit 0
  fi
fi

echo "Generating MiniKBP local CA + server certificate…"

openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -out ca.crt -subj "/C=BY/O=MiniKBP Local/CN=MiniKBP Local CA"

openssl genrsa -out mini-kbp.site.key 2048
openssl req -new -key mini-kbp.site.key -out mini-kbp.site.csr -config openssl-san.cnf
openssl x509 -req -in mini-kbp.site.csr \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out mini-kbp.site.crt -days 825 -sha256 \
  -extfile openssl-san.cnf -extensions v3_req

# Full chain for Apache (server + CA)
cat mini-kbp.site.crt ca.crt > mini-kbp.site.fullchain.crt
rm -f mini-kbp.site.csr ca.srl

chmod 640 mini-kbp.site.key ca.key
chmod 644 mini-kbp.site.crt ca.crt mini-kbp.site.fullchain.crt

echo "Done."
echo "  Server: $DIR/mini-kbp.site.fullchain.crt"
echo "  Key:    $DIR/mini-kbp.site.key"
echo "  CA:     $DIR/ca.crt  (install into OS/browser trust store for green lock)"
echo
echo "Trust CA (optional):"
echo "  sudo cp $DIR/ca.crt /usr/local/share/ca-certificates/minikbp-local.crt && sudo update-ca-certificates"
