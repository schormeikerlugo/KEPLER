<div align="center">

# 🔭 K E P L E R

### Plataforma de exploración de campo asistida por IA

**v0.8 — rewrite en Rust (en curso)**

</div>

---

KEPLER une visión artificial (YOLO + CLIP), geolocalización, telemetría en vivo y un copiloto LLM (Cortex) en un solo flujo de trabajo para exploración de campo. Funciona sin conexión en terreno y sincroniza al volver.

## 🧭 Componentes

| Componente | Tecnología | Rol |
|---|---|---|
| **Unidad de Campo** | SwiftUI + núcleo Rust (UniFFI) | iPhone: AR, YOLO on-device (CoreML), LiDAR, GPS, offline-first |
| **Centro de Control** | Rust UI nativa | Escritorio: dashboard en vivo, archivos, mapa, chat IA |
| **kepler-server** | Rust (axum) | API REST + WebSocket |
| **Base de datos** | Supabase (Postgres + pgvector) | Datos, auth, storage |
| **IA (LLM)** | Ollama local (`mistral:7b`) | Solo en equipos de escritorio |

## 📁 Estructura

```
KEPLER/
├── legacy/       ← v0.7 (JS/Python), congelada como referencia
├── infra/        ← stack Docker "kepler", migraciones, backups
├── design/       ← tokens, fuentes, logo, capturas de referencia
├── models/       ← modelos ONNX / CoreML + exportación
├── crates/       ← librerías Rust compartidas (kepler-core, …)
├── services/     ← kepler-server
└── apps/         ← desktop (Rust), ios (SwiftUI), android (futuro)
```

## 🚀 Desarrollo

```bash
cargo check --workspace
cargo test --workspace
cargo clippy --workspace --all-targets
```

La toolchain se fija en `rust-toolchain.toml`.

## 📚 Documentación

La documentación del proyecto vive en la bóveda de Obsidian (`KEPLER/`). La documentación de la versión anterior está en [`legacy/docs`](legacy/docs).

## 🗄️ Versión anterior

La v0.7.0 (Vite + Electron + React Native + FastAPI) está en [`legacy/`](legacy) y marcada con el tag `v0.7.0-legacy`.

## 📄 Licencia

MIT
