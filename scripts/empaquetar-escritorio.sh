#!/bin/sh
# Empaqueta el Centro de Control (Linux x86_64) en dist/:
#   kepler-centro-<versión>-linux-x86_64.tar.gz con el binario, el acceso
#   directo, el icono, un instalador (~/.local) y las licencias de terceros
#   (MapLibre Native BSD-2, Jura OFL y la lista de crates con su licencia).
#
#   sh scripts/empaquetar-escritorio.sh
#
# Dependencias del sistema en destino: las de MapLibre/Slint (OpenGL, ICU,
# libcurl, fontconfig, X11/Wayland); en Arch ya están con el escritorio.

set -eu

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"
VERSION=$(cargo metadata --no-deps --format-version 1 | python3 -c 'import json,sys; print(next(p["version"] for p in json.load(sys.stdin)["packages"] if p["name"] == "kepler-desktop"))')
NOMBRE="kepler-centro-${VERSION}-linux-$(uname -m)"
DIST="$RAIZ/dist/$NOMBRE"

echo "→ Compilando kepler-centro $VERSION"
CMAKE_GENERATOR=Ninja cargo build -q --release -p kepler-desktop

rm -rf "$DIST"
mkdir -p "$DIST/bin" "$DIST/share/applications" "$DIST/share/icons/hicolor/256x256/apps" "$DIST/licencias"
install -m 755 target/release/kepler-centro "$DIST/bin/"
strip "$DIST/bin/kepler-centro" 2>/dev/null || true
python3 -I - "$RAIZ/design/assets/kepler-logo.png" "$DIST/share/icons/hicolor/256x256/apps/kepler-centro.png" <<'EOF' 2>/dev/null || cp design/assets/kepler-logo.png "$DIST/share/icons/hicolor/256x256/apps/kepler-centro.png"
import sys
from PIL import Image
Image.open(sys.argv[1]).convert("RGBA").resize((256, 256)).save(sys.argv[2])
EOF

cat > "$DIST/share/applications/kepler-centro.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=KEPLER · Centro de Control
Comment=Centro de Control del ecosistema de exploración KEPLER
Exec=kepler-centro
Icon=kepler-centro
Terminal=false
Categories=Utility;Maps;
StartupWMClass=kepler-centro
EOF

cat > "$DIST/instalar.sh" <<'EOF'
#!/bin/sh
# Instala el Centro de Control para el usuario actual (~/.local).
set -eu
cd "$(dirname "$0")"
PREFIJO="${PREFIJO:-$HOME/.local}"
install -Dm755 bin/kepler-centro "$PREFIJO/bin/kepler-centro"
install -Dm644 share/applications/kepler-centro.desktop "$PREFIJO/share/applications/kepler-centro.desktop"
install -Dm644 share/icons/hicolor/256x256/apps/kepler-centro.png "$PREFIJO/share/icons/hicolor/256x256/apps/kepler-centro.png"
mkdir -p "$PREFIJO/share/doc/kepler-centro"
cp -r licencias "$PREFIJO/share/doc/kepler-centro/"
command -v update-desktop-database >/dev/null && update-desktop-database "$PREFIJO/share/applications" || true
echo "Instalado en $PREFIJO/bin/kepler-centro"
EOF
chmod 755 "$DIST/instalar.sh"

echo "→ Licencias"
cp apps/desktop/licencias/* "$DIST/licencias/"
{
    echo "Componentes de terceros de kepler-centro $VERSION (crates de Rust y su licencia)."
    echo "MapLibre Native (núcleo C++ enlazado estáticamente): BSD-2-Clause, ver maplibre-native.md."
    echo "Fuente Jura: SIL Open Font License 1.1, ver jura-OFL.txt."
    echo "Slint: licencia Royalty-free 2.0 (atribución en «Acerca de»)."
    echo
    cargo tree -q -p kepler-desktop -e normal --prefix none --format '{p} · {l}' \
        | sed 's/ (\*)$//; s/ (proc-macro)//' | grep -v '^kepler-' | sort -u
} > "$DIST/licencias/TERCEROS.txt"

cd "$RAIZ/dist"
tar czf "$NOMBRE.tar.gz" "$NOMBRE"
echo "   dist/$NOMBRE.tar.gz ($(du -h "$NOMBRE.tar.gz" | cut -f1))"
