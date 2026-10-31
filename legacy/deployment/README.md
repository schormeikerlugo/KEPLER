# 🚀 Mars-Sight AR - Guía de Despliegue

Guía completa para desplegar Mars-Sight AR en cualquier máquina con Docker.

---

## 📋 Requisitos Previos

| Requisito | Versión | Notas |
|-----------|---------|-------|
| Docker | 20.10+ | [Instalar Docker](https://docs.docker.com/get-docker/) |
| Docker Compose | 2.0+ | Usualmente incluido con Docker Desktop |
| Git | Cualquiera | Para clonar el repositorio |
| Ollama | Última | **Opcional** - Para funciones de chat con IA |

---

## ⚡ Inicio Rápido (Automático)

```bash
# 1. Clonar o copiar el proyecto
cd "Mars-Sight AR"

# 2. Ejecutar el script de configuración
cd deployment
./setup.sh
```

El script hará:
- ✅ Iniciar todos los servicios Docker
- ✅ Ejecutar migraciones de base de datos
- ✅ Construir contenedores de frontend y backend
- ✅ Configurar todo automáticamente

**Accede a la app en:** http://localhost

---

## 🔧 Configuración Manual

Si prefieres control manual, sigue estos pasos:

### Paso 1: Configurar Variables de Entorno

```bash
cd deployment
cp .env.example .env
```

Edita `.env` si quieres cambiar contraseñas o claves.

### Paso 2: Iniciar Infraestructura

```bash
docker-compose -f docker-compose.production.yml up -d postgres auth rest kong
```

Espera a que la base de datos esté lista:
```bash
docker logs -f mars-sight-db
# Espera hasta ver "database system is ready to accept connections"
```

### Paso 3: Ejecutar Migraciones

```bash
# Migración principal del esquema
docker exec -i mars-sight-db psql -U postgres -d postgres < ../backend/migrations/FULL_MIGRATION_EXPORT.sql

# Funciones adicionales (chat_logs, funciones RPC)
docker exec -i mars-sight-db psql -U postgres -d postgres < init_additional.sql

# Recargar caché de PostgREST
docker-compose -f docker-compose.production.yml restart rest
```

### Paso 4: Construir e Iniciar Aplicación

```bash
docker-compose -f docker-compose.production.yml up -d --build
```

---

## 🌐 URLs de Servicios

| Servicio | URL | Descripción |
|----------|-----|-------------|
| **Frontend** | http://localhost | Aplicación principal |
| **API Backend** | http://localhost:8001 | API REST FastAPI |
| **API Supabase** | http://localhost:54321 | Auth, Storage, PostgREST |
| **Base de Datos** | localhost:54322 | PostgreSQL (postgres/mars2025) |

---

## 🤖 Configuración de Ollama (Funciones IA)

Mars-Sight AR usa Ollama para el chat con Llama 3.

### Opción A: Ollama en Máquina Host (Recomendado)

```bash
# Instalar Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Descargar el modelo
ollama pull llama3:8b-instruct-q6_K

# Iniciar Ollama
ollama serve
```

Los contenedores Docker se conectarán a `http://host.docker.internal:11434`.

### Opción B: Ollama en Docker

Agregar a `docker-compose.production.yml`:
```yaml
ollama:
  image: ollama/ollama:latest
  container_name: mars-sight-ollama
  volumes:
    - ollama_data:/root/.ollama
  ports:
    - "11434:11434"
  networks:
    - mars-network
```

Luego actualizar `.env`:
```
OLLAMA_URL=http://ollama:11434
```

---

## 📁 Estructura del Proyecto

```
Mars-Sight AR/
├── frontend/           # Vite + JavaScript SPA
├── backend/            # FastAPI Python
├── deployment/         # 👈 Estás aquí
│   ├── docker-compose.production.yml
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   ├── nginx.conf
│   ├── init_additional.sql
│   ├── .env.example
│   ├── setup.sh
│   └── README.md
├── docker-compose.yml  # Compose de desarrollo
└── kong.yml            # Configuración API Gateway
```

---

## 🔑 Claves de Seguridad

El proyecto usa estas claves JWT (incluidas en `.env.example`):

| Clave | Propósito |
|-------|-----------|
| `JWT_SECRET` | Firma todos los tokens JWT |
| `SUPABASE_ANON_KEY` | Clave pública para frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave admin para backend |

**⚠️ Para producción:** Genera nuevas claves usando:
```bash
# Generar nuevo secreto JWT
openssl rand -hex 32

# Generar nuevas claves Supabase
# Usa: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
```

---

## 🛠️ Comandos Comunes

```bash
# Ver todos los logs
docker-compose -f docker-compose.production.yml logs -f

# Ver logs de servicio específico
docker-compose -f docker-compose.production.yml logs -f backend

# Detener todos los servicios
docker-compose -f docker-compose.production.yml down

# Detener y eliminar volúmenes (⚠️ borra datos)
docker-compose -f docker-compose.production.yml down -v

# Reconstruir un servicio específico
docker-compose -f docker-compose.production.yml build backend
docker-compose -f docker-compose.production.yml up -d backend

# Acceder a la base de datos
docker exec -it mars-sight-db psql -U postgres -d postgres
```

---

## 🐛 Solución de Problemas

### Errores de conexión a base de datos
```bash
# Verificar si la base de datos está corriendo
docker ps | grep mars-sight-db

# Revisar logs de la base de datos
docker logs mars-sight-db
```

### Frontend no puede alcanzar backend
```bash
# Verificar que todos los servicios están corriendo
docker-compose -f docker-compose.production.yml ps

# Revisar logs de nginx
docker logs mars-sight-frontend
```

### Chat IA no funciona
1. Verificar si Ollama está corriendo: `curl http://localhost:11434/api/tags`
2. Verificar que el modelo está descargado: `ollama list`
3. Revisar logs del backend: `docker logs mars-sight-backend`

---

## 📦 Mover a Otra Máquina

1. Copiar toda la carpeta `Mars-Sight AR`
2. En la nueva máquina:
   ```bash
   cd "Mars-Sight AR/deployment"
   ./setup.sh
   ```

**Para preservar datos**, también respalda el volumen Docker:
```bash
# Exportar
docker run --rm -v mars-sight_db_data:/data -v $(pwd):/backup alpine tar czf /backup/db_backup.tar.gz /data

# Importar (en nueva máquina)
docker run --rm -v mars-sight_db_data:/data -v $(pwd):/backup alpine tar xzf /backup/db_backup.tar.gz -C /
```

---

## ✅ Lista de Verificación

Después de la configuración, verifica que todo funcione:

- [ ] Frontend carga en http://localhost
- [ ] Puedes crear una cuenta de usuario nueva
- [ ] Puedes iniciar sesión correctamente
- [ ] Dashboard carga con telemetría
- [ ] Chat IA responde (requiere Ollama)
- [ ] Vista AR muestra botón de escaneo
- [ ] Sección de taxonomía carga categorías

---

**Hecho con ❤️ para la exploración de Marte**
