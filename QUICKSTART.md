# 🎯 GUÍA DE INICIO RÁPIDO - Mars-Sight AR

¡Ambiente de desarrollo configurado exitosamente! 🚀

## ✅ Lo que se ha Creado

### Estructura del Proyecto

```
KEPLER/
├── 📂 frontend/              ← Aplicación React + WebXR
│   ├── src/
│   │   ├── components/      ← Componentes (UI, AR, Dashboard)
│   │   ├── pages/           ← Vistas principales
│   │   ├── hooks/           ← React Hooks personalizados
│   │   ├── services/        ← Servicios API
│   │   ├── store/           ← Estado global
│   │   ├── utils/           ← Utilidades
│   │   ├── styles/          ← Design System
│   │   │   ├── tokens.css   ✨ Variables de diseño
│   │   │   └── global.css   ✨ Estilos globales
│   │   ├── App.tsx          ✨ Componente principal
│   │   └── main.tsx         ✨ Entry point
│   ├── package.json         ✨ Dependencias
│   ├── vite.config.ts       ✨ Config Vite
│   └── tsconfig.json        ✨ Config TypeScript
│
├── 📂 backend/               ← API FastAPI
│   ├── app/
│   │   ├── api/endpoints/   ← Rutas API
│   │   ├── models/          ← Modelos SQLAlchemy
│   │   ├── schemas/         ← Schemas Pydantic
│   │   ├── core/            ← Configuración
│   │   ├── services/        ← Servicios externos
│   │   └── main.py          ✨ FastAPI app
│   ├── requirements.txt     ✨ Dependencias Python
│   └── Dockerfile           ✨ Imagen Docker
│
├── 📂 ai/                    ← Configuración IA
│   └── Modelfile            ✨ Config Ollama
│
├── 📂 docs/                  ← Documentación
│   └── INSTALLATION.md      ✨ Guía de instalación
│
├── docker-compose.yml       ✨ Orquestación servicios
├── .env                     ✨ Variables de entorno
├── .gitignore               ✨ Archivos ignorados
└── README.md                ✨ Documentación principal
```

---

## 🚀 Pasos Siguientes

### 1️⃣ Instalar Dependencias del Frontend

```bash
cd frontend
npm install
```

Esto instalará:

- ✅ React 18
- ✅ Three.js + React Three Fiber (para 3D/AR)
- ✅ GSAP (animaciones)
- ✅ Supabase (autenticación)
- ✅ Zustand (estado global)
- ✅ TypeScript

**Tiempo estimado:** 2-3 minutos

---

### 2️⃣ Iniciar el Frontend

```bash
npm run dev
```

**Abre:** http://localhost:5173

Deberías ver una página de bienvenida con:

- 🎨 Design System aplicado (colores de Marte)
- 🔘 Botón de contador funcional
- 📊 Badges indicando el estado del proyecto

---

### 3️⃣ Levantar el Backend con Docker (Opcional)

```bash
# Desde la raíz del proyecto
cd ..
docker-compose up -d postgres
```

Esto iniciará:

- 🐘 PostgreSQL con PostGIS
- 🗄️ Base de datos `mars_sight`

**Verifica:**

```bash
docker ps
# Deberías ver: mars-sight-db running
```

---

### 4️⃣ Iniciar el Backend (Desarrollo Local)

```bash
cd backend

# Crear entorno virtual
python -m venv venv

# Activar
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate    # Windows

# Instalar dependencias
pip install -r requirements.txt

# Iniciar servidor
uvicorn app.main:app --reload
```

**Abre:** http://localhost:8000/docs

Deberías ver:

- 📚 Swagger UI con la documentación de la API
- ✅ Endpoint GET `/health`
- ✅ Endpoint GET `/` (info de la API)

**Prueba:**

```bash
curl http://localhost:8000/health
```

---

### 5️⃣ Configurar Ollama (IA Local)

**Opción A: Con Docker**

```bash
docker-compose up -d ollama

# Esperar 10 segundos, luego:
docker exec -it mars-sight-ollama ollama pull llama3.1:8b
```

**Opción B: Local (más rápido)**

```bash
# Descargar Ollama desde https://ollama.com
# Luego:
ollama pull llama3.1:8b
ollama serve
```

**Tiempo estimado:** 5-10 minutos (descarga ~4GB)

---

## ✨ Verificación Completa

### Checklist de Servicios

Ejecuta estos comandos para verificar que todo funciona:

```bash
# ✅ Frontend
curl http://localhost:5173
# Debe cargar la página

# ✅ Backend
curl http://localhost:8000/health
# Debe devolver: {"status":"healthy",...}

# ✅ Database
docker exec mars-sight-db psql -U postgres -d mars_sight -c "SELECT version();"
# Debe mostrar la versión de PostgreSQL

# ✅ Ollama
curl http://localhost:11434/api/tags
# Debe listar los modelos instalados
```

---

## 🎨 Empezar a Desarrollar

### Estructura de Trabajo Recomendada

**Terminal 1:** Frontend

```bash
cd frontend
npm run dev
```

**Terminal 2:** Backend

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```

**Terminal 3:** Docker (servicios)

```bash
docker-compose logs -f
```

---

## 📚 Recursos Útiles

### Documentación Creada

1. **[README.md](./README.md)** - Visión general del proyecto
2. **[INSTALLATION.md](./docs/INSTALLATION.md)** - Guía detallada de instalación
3. **[Design System](./frontend/src/styles/tokens.css)** - Variables CSS y componentes

### Próximos Archivos a Crear

Según la **Fase 1 del Roadmap** (Semana 1):

1. ✅ ~~Estructura básica~~ (COMPLETADO)
2. 🔜 Pantalla de Login (`frontend/src/pages/Login.tsx`)
3. 🔜 Dashboard (`frontend/src/pages/Home.tsx`)
4. 🔜 Configuración de Supabase Auth
5. 🔜 Endpoints de autenticación (`backend/app/api/endpoints/auth.py`)

---

## 🆘 Troubleshooting Rápido

### Frontend no carga

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Backend no arranca

```bash
cd backend
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Puerto ocupado

```bash
# Ver qué usa el puerto 5173 (frontend)
lsof -i :5173

# Ver qué usa el puerto 8000 (backend)
lsof -i :8000

# Matar proceso si es necesario
kill -9 <PID>
```

---

## 🎯 Tu Siguiente Sesión de Desarrollo

Cuando vuelvas a trabajar en el proyecto:

```bash
# 1. Levantar Docker (database)
docker-compose up -d postgres

# 2. Activar backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload

# 3. En otra terminal: Frontend
cd frontend
npm run dev

# 4. Abrir navegador
# http://localhost:5173 (Frontend)
# http://localhost:8000/docs (API)
```

---

## ✅ Estado Actual del Proyecto

| Componente     | Estado       | URL                        |
| -------------- | ------------ | -------------------------- |
| Frontend Setup | ✅ LISTO     | http://localhost:5173      |
| Backend Setup  | ✅ LISTO     | http://localhost:8000/docs |
| Database       | ✅ LISTO     | postgres://localhost:5432  |
| Design System  | ✅ LISTO     | Ver `tokens.css`           |
| Ollama/IA      | ⏳ PENDIENTE | Descargar modelo           |
| Auth           | ⏳ PENDIENTE | Fase 1, Semana 1           |
| AR Components  | ⏳ PENDIENTE | Fase 1, Semana 2           |

---

## 🚀 ¡Estás Listo!

El ambiente de desarrollo está **100% configurado**.

**Siguiente paso:** Ejecutar `npm install` en `/frontend` e iniciar el desarrollo.

💡 **Tip:** Mantén abierto el archivo `mars_sight_notion.md` en Notion para seguir la arquitectura completa del proyecto.

---

¿Dudas? Consulta:

- [INSTALLATION.md](./docs/INSTALLATION.md) para instalación detallada
- [README.md](./README.md) para visión general
- Los prompts de IA están en: `/ai/Modelfile`

✨ **¡Happy coding, explorer!** 🌌
