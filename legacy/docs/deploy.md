# KEPLER — Guia de Deploy y Portabilidad

## Modos de Ejecucion

### Modo Dev (tu PC — lo que usas normalmente)
```bash
./start-dev.sh          # Levanta todo: Supabase Docker + Backend local + Frontend local
./stop-dev.sh           # Detiene todo
./tunnel.sh start       # Expone via Cloudflare tunnel para acceso remoto/movil
```

Servicios en modo dev:
- **Supabase**: Docker (postgres, kong, auth, rest, storage, meta, studio, realtime)
- **Backend**: Local venv Python (`backend/venv/bin/python`)
- **Frontend**: Local Node.js Vite (`apps/web/node_modules`)
- **Ollama**: Local nativo (acceso directo a GPU)

### Modo Portable CPU (otra PC sin GPU)
```bash
docker compose --profile portable up -d
```

Backend usa PyTorch CPU-only. Funciona en cualquier PC con Docker.

### Modo Portable GPU (otra PC con NVIDIA)
```bash
docker compose --profile portable-gpu up -d
```

Backend usa PyTorch CUDA 12.1 + acceso a GPU NVIDIA del host.
Requiere: `nvidia-container-toolkit` instalado en la PC.

```bash
# Instalar nvidia-container-toolkit (una vez)
sudo apt install nvidia-container-toolkit
sudo systemctl restart docker
```

### Modo Portable con Ollama en Docker
```bash
docker compose --profile portable --profile portable-ollama up -d
# O con GPU:
docker compose --profile portable-gpu --profile portable-ollama up -d
```

Incluye Ollama en Docker. Si Ollama ya corre local, no usar este perfil.

---

## Puertos

| Servicio | Dev Local | Docker Portable |
|---|---|---|
| Frontend (Vite) | `https://localhost:5180` | `http://localhost:5180` |
| Backend (FastAPI) | `http://localhost:8000` | `http://localhost:8000` |
| Supabase API (Kong) | `http://localhost:54321` | `http://localhost:54321` |
| Supabase Studio | `http://localhost:3001` | `http://localhost:3001` |
| Supabase DB | `localhost:54322` | `localhost:54322` |
| Ollama | `http://localhost:11434` | `http://localhost:11434` |
| Realtime WS | `http://localhost:4000` | `http://localhost:4000` |

---

## Requisitos por Modo

### Dev Local
- Docker + Docker Compose
- Node.js 18+
- Python 3.10+ con venv
- Ollama instalado localmente
- NVIDIA GPU (opcional, mejora CLIP/YOLO)

### Portable (Docker)
- Docker + Docker Compose
- ~8GB RAM libre
- Ollama en host (o usar perfil `portable-ollama`)

---

## Setup en PC Nueva (Portable)

```bash
# 1. Clonar repositorio
git clone <repo-url> KEPLER
cd KEPLER

# 2. Levantar todo
docker compose --profile portable up -d --build

# 3. Esperar a que la DB este lista (~30s)
docker exec mars-sight-db pg_isready -U postgres

# 4. Ejecutar migraciones
docker exec mars-sight-db psql -U postgres -f /docker-entrypoint-initdb.d/schema.sql
# O manualmente con los archivos en database/

# 5. Instalar Ollama en el host (para IA)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull mistral:7b
ollama pull llama3:8b-instruct-q6_K

# 6. Acceder
# Frontend: http://localhost:5180
# Supabase Studio: http://localhost:3001
```

---

## Errores Comunes

### `iptables: No chain/target/match by that name`
Docker no puede crear redes. Reiniciar Docker:
```bash
sudo systemctl restart docker
```

### `port 11434 already allocated`
Ollama ya corre localmente. No usar perfil `portable-ollama`:
```bash
docker compose --profile portable up -d  # sin portable-ollama
```

### `pmtiles not found` en frontend Docker
Reconstruir imagen:
```bash
docker compose --profile portable build frontend
```

### Backend no conecta a Supabase
Verificar que Kong esta corriendo:
```bash
docker ps | grep kong
curl http://localhost:54321/rest/v1/
```

---

## Estructura Docker

```
docker-compose.yml
├── postgres (mars-sight-db)        Puerto 54322  — Siempre activo
├── kong (mars-sight-kong)          Puerto 54321  — Siempre activo
├── auth (mars-sight-auth)          Interno       — Siempre activo
├── rest (mars-sight-rest)          Interno       — Siempre activo
├── storage (mars-sight-storage)    Interno       — Siempre activo
├── meta (mars-sight-meta)          Interno       — Siempre activo
├── studio (mars-sight-studio)      Puerto 3001   — Siempre activo
├── realtime                        Puerto 4000   — Siempre activo
├── backend [portable]              Puerto 8000   — CPU-only, sin GPU
├── backend-gpu [portable-gpu]      Puerto 8000   — CUDA, con GPU NVIDIA
├── frontend [portable]             Puerto 5180   — Solo en modo portable
└── ollama [portable-ollama]        Puerto 11434  — Solo si no hay Ollama local
```

`profiles: ["portable"]` significa que solo se levanta con `--profile portable`.
En modo dev, backend y frontend corren localmente fuera de Docker.
