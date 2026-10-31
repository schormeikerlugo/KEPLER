# 🚀 Guía de Inicio - Mars-Sight AR

Esta guía explica cómo iniciar todos los servicios del proyecto para desarrollo local.

---

## 📋 Orden de Dependencias

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Supabase   │ ──▶ │   Backend   │ ──▶ │  Frontend   │
│  (Docker)   │     │  (FastAPI)  │     │   (Vite)    │
└─────────────┘     └─────────────┘     └─────────────┘
     ⬇️
┌─────────────┐
│   Ollama    │ (Opcional, para IA)
└─────────────┘
```

**¿Por qué este orden?**
- El **Backend** necesita la base de datos de Supabase para funcionar
- El **Frontend** hace llamadas al Backend y Supabase
- **Ollama** es independiente pero necesario para el chat con IA

---

## ⚡ Método Automático (Recomendado)

### Iniciar todo:
```bash
cd "/home/lenovics/portafolio Dev/KEPLER"
./start-dev.sh
```

### Detener todo:
```bash
./stop-dev.sh
```

---

## 🔧 Método Manual

### Paso 1: Iniciar Supabase

```bash
cd "/home/lenovics/portafolio Dev/KEPLER"

# Iniciar servicios principales
docker start mars-sight-db mars-sight-auth mars-sight-rest mars-sight-kong

# Esperar ~10 segundos a que la DB esté lista

# (Opcional) Servicios adicionales
docker start mars-sight-storage mars-sight-meta mars-sight-studio
```

**Verificar que estén corriendo:**
```bash
docker ps | grep mars-sight
```

### Paso 2: Iniciar Backend

Abrir una **nueva terminal**:
```bash
cd "/home/lenovics/portafolio Dev/Mars‑Sight AR/backend"
./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Verificar:** Ir a http://localhost:8001/docs

### Paso 3: Iniciar Frontend

Abrir una **nueva terminal**:
```bash
cd "/home/lenovics/portafolio Dev/Mars‑Sight AR/frontend"
npm run dev
```

**Verificar:** Ir a https://localhost:5180

### Paso 4 (Opcional): Iniciar Ollama

Para funciones de chat con IA:
```bash
ollama serve
```

---

## 🌐 URLs de Servicios

| Servicio | URL | Descripción |
|----------|-----|-------------|
| **Frontend** | https://localhost:5180 | Aplicación principal |
| **Backend API** | http://localhost:8001 | API REST FastAPI |
| **API Docs** | http://localhost:8001/docs | Documentación Swagger |
| **Supabase** | http://localhost:54321 | API Gateway (Kong) |
| **Studio** | http://localhost:3001 | Panel de administración |
| **Database** | localhost:54322 | PostgreSQL |
| **Ollama** | http://localhost:11434 | Servidor de IA |

---

## 🛑 Detener Servicios

### Método 1: Script automático
```bash
./stop-dev.sh
```

### Método 2: Manual

```bash
# Frontend: Ctrl+C en su terminal

# Backend: Ctrl+C en su terminal

# Supabase:
docker stop mars-sight-kong mars-sight-rest mars-sight-auth mars-sight-db
```

---

## 🐛 Solución de Problemas

### El backend no conecta a la base de datos
```bash
# Verificar que la DB esté corriendo
docker ps | grep mars-sight-db

# Ver logs
docker logs mars-sight-db
```

### Puerto ya en uso
```bash
# Ver qué proceso usa el puerto 8001
lsof -i:8001

# Matar el proceso
kill -9 <PID>
```

### Servicios Docker no inician
```bash
# Reiniciar todos los servicios
docker-compose down
docker-compose up -d postgres auth rest kong
```

---

## 📂 Logs

| Servicio | Ubicación |
|----------|-----------|
| Backend (script) | `/tmp/mars-backend.log` |
| Frontend (script) | `/tmp/mars-frontend.log` |
| Supabase | `docker-compose logs -f` |

---

**Última actualización:** Diciembre 2025
