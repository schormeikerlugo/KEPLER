#!/bin/sh
# Compila y prueba la app del iPhone desde Linux, en el Mac mini por SSH.
#
#   sh scripts/ios.sh nucleo      # núcleo Rust → XCFramework + bindings Swift (UniFFI)
#   sh scripts/ios.sh sim         # app en el simulador + captura en design/reference/ios/
#   sh scripts/ios.sh run         # app firmada en el iPhone (necesita la cuenta en Xcode)
#   sh scripts/ios.sh captura [archivo.png]   # captura del simulador
#   sh scripts/ios.sh logs        # logs de la app en el iPhone
#
# Variables: KEPLER_MAC (ssh, por defecto macmini), KEPLER_EQUIPO (Team ID para
# firmar; si falta se toma el primero de Xcode), KEPLER_SIM (simulador),
# KEPLER_DEMO_USUARIO/KEPLER_DEMO_CONTRASENA (entrada automática en el simulador, solo Debug).
#
# Sincroniza con tar (los archivos de git, incluidos los nuevos sin commit); en el
# Mac el repo vive en ~/kepler y `target/` se conserva entre compilaciones.

set -eu

MAC="${KEPLER_MAC:-macmini}"
SIM="${KEPLER_SIM:-iPhone 17 Pro Max}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
ORDEN="${1:-sim}"

sincronizar() {
    echo "→ Sincronizando con ${MAC}:~/kepler"
    cd "$RAIZ"
    git ls-files -co --exclude-standard -z \
        | grep -zv '^legacy/' \
        | tar --null -czf - -T - \
        | ssh "$MAC" 'mkdir -p ~/kepler && tar -xzf - -C ~/kepler'
}

# Todo lo que corre en el Mac
remoto() {
    ssh "$MAC" "export PATH=\$HOME/.cargo/bin:\$HOME/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin; cd ~/kepler && $1"
}

nucleo() {
    echo "→ Núcleo Rust (iOS + simulador)"
    remoto '
        set -e
        # Misma versión mínima que el proyecto (project.yml); sin ella el enlace falla
        export IPHONEOS_DEPLOYMENT_TARGET=17.0
        cargo build -q --release -p kepler-movil --lib --target aarch64-apple-ios
        cargo build -q --release -p kepler-movil --lib --target aarch64-apple-ios-sim
        cargo build -q --release -p kepler-movil --lib
        rm -rf apps/ios/build/enlaces apps/ios/build/KeplerMovil.xcframework
        mkdir -p apps/ios/build/enlaces apps/ios/Kepler/Nucleo
        cargo run -q --release -p kepler-movil --features bindgen --bin uniffi-bindgen -- \
            generate --library target/release/libkepler_movil.dylib --language swift \
            --out-dir apps/ios/build/enlaces 2>/dev/null
        cp apps/ios/build/enlaces/kepler_movil.swift apps/ios/Kepler/Nucleo/
        mkdir -p apps/ios/build/cabeceras
        cp apps/ios/build/enlaces/kepler_movilFFI.h apps/ios/build/cabeceras/
        cp apps/ios/build/enlaces/kepler_movilFFI.modulemap apps/ios/build/cabeceras/module.modulemap
        xcodebuild -create-xcframework \
            -library target/aarch64-apple-ios/release/libkepler_movil.a -headers apps/ios/build/cabeceras \
            -library target/aarch64-apple-ios-sim/release/libkepler_movil.a -headers apps/ios/build/cabeceras \
            -output apps/ios/build/KeplerMovil.xcframework >/dev/null
        echo "   $(du -sh apps/ios/build/KeplerMovil.xcframework | cut -f1) XCFramework"
    '
}

proyecto() {
    remoto 'cd apps/ios && xcodegen generate --quiet'
}

simulador() {
    echo "→ Simulador (${SIM})"
    remoto "
        set -e
        cd apps/ios
        xcodebuild -quiet -project Kepler.xcodeproj -scheme Kepler -configuration Debug \
            -destination 'platform=iOS Simulator,name=${SIM}' -derivedDataPath build/derivado \
            CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= build 2>&1 | grep -E 'error|warning: unre' || true
        APP=build/derivado/Build/Products/Debug-iphonesimulator/Kepler.app
        test -d \"\$APP\"
        xcrun simctl boot '${SIM}' 2>/dev/null || true
        open -g -a Simulator
        xcrun simctl install '${SIM}' \"\$APP\"
        xcrun simctl terminate '${SIM}' dev.schormeiker.kepler 2>/dev/null || true
        SIMCTL_CHILD_KEPLER_DEMO_USUARIO='${KEPLER_DEMO_USUARIO:-}' SIMCTL_CHILD_KEPLER_DEMO_CONTRASENA='${KEPLER_DEMO_CONTRASENA:-}' \\
            xcrun simctl launch '${SIM}' dev.schormeiker.kepler >/dev/null
    "
}

captura() {
    ARCHIVO="${1:-$RAIZ/design/reference/ios/simulador.png}"
    mkdir -p "$(dirname "$ARCHIVO")"
    remoto "xcrun simctl io '${SIM}' screenshot /tmp/kepler-sim.png >/dev/null 2>&1"
    scp -q "$MAC:/tmp/kepler-sim.png" "$ARCHIVO"
    echo "   captura: $ARCHIVO"
}

dispositivo() {
    echo "→ iPhone"
    remoto "
        set -e
        # Equipo: el OU del certificado «Apple Development» del llavero
        EQUIPO=\${KEPLER_EQUIPO:-\$(security find-certificate -c 'Apple Development' -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | grep -oE 'OU=[A-Z0-9]+' | cut -d= -f2)}
        if [ -z \"\$EQUIPO\" ]; then
            echo 'Falta el certificado: Xcode → Ajustes → Cuentas → Gestionar certificados → Apple Development' >&2
            exit 1
        fi
        ID=\$(xcrun devicectl list devices 2>/dev/null | awk '/available|connected/ {print \$3; exit}')
        # UDID: con el iPhone concreto como destino Xcode lo registra en el equipo y crea el perfil
        UDID=\$(xcrun xctrace list devices 2>/dev/null | grep -v Simulator | grep -oE '[0-9A-F]{8}-[0-9A-F]{16}' | head -1)
        cd apps/ios
        xcodebuild -quiet -project Kepler.xcodeproj -scheme Kepler -configuration Debug \
            -destination \"platform=iOS,id=\$UDID\" -derivedDataPath build/derivado \
            -allowProvisioningUpdates DEVELOPMENT_TEAM=\$EQUIPO build
        xcrun devicectl device install app --device \$ID build/derivado/Build/Products/Debug-iphoneos/Kepler.app >/dev/null
        xcrun devicectl device process launch --device \$ID dev.schormeiker.kepler >/dev/null
        echo '   instalada y abierta'
    "
}

case "$ORDEN" in
    nucleo) sincronizar; nucleo ;;
    sim) sincronizar; nucleo; proyecto; simulador; sleep 4; captura ;;
    run) sincronizar; nucleo; proyecto; dispositivo ;;
    captura) captura "${2:-}" ;;
    logs) ssh "$MAC" "xcrun devicectl device process log stream --device \$(xcrun devicectl list devices | awk '/available|connected/ {print \$3; exit}') 2>&1 | grep -i kepler" ;;
    *) echo "uso: $0 nucleo|sim|run|captura|logs" >&2; exit 2 ;;
esac
