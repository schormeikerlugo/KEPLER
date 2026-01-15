#!/bin/bash
# ============================================================
# KEPLER - Inicio Rápido para Salidas de Campo
# ============================================================
# Ejecuta: ./start-remote.sh
# 
# Este script:
# 1. Inicia el backend (FastAPI)
# 2. Inicia el frontend (Vite)
# 3. Activa los túneles de acceso remoto
# 4. Muestra las URLs para acceder desde tu móvil
# ============================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║    🔭 KEPLER - Modo Salida de Campo                      ║"
echo "║    Preparando acceso remoto...                           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Función para limpiar al salir
cleanup() {
    echo -e "\n${YELLOW}🛑 Deteniendo servicios...${NC}"
    
    # Detener túneles
    pkill -f "cloudflared tunnel" 2>/dev/null || true
    
    # Detener backend
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
    
    # El frontend de Vite se detendrá automáticamente
    
    echo -e "${GREEN}✅ Servicios detenidos${NC}"
    exit 0
}

trap cleanup INT TERM

# Verificar Ollama
echo -e "${BLUE}🔍 Verificando Ollama...${NC}"
if curl -s "http://localhost:11434" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Ollama está corriendo${NC}"
else
    echo -e "${YELLOW}⚠️  Ollama no está corriendo. Iniciando...${NC}"
    ollama serve &
    sleep 3
    
    # Verificar modelo
    if ! ollama list | grep -q "mistral"; then
        echo -e "${YELLOW}📥 Descargando modelo Mistral 7B...${NC}"
        ollama pull mistral:7b
    fi
fi

# Iniciar Backend
echo -e "${BLUE}🚀 Iniciando Backend...${NC}"
cd backend
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}📦 Creando entorno virtual...${NC}"
    python -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

sleep 3

# Verificar backend
if curl -s "http://localhost:8000/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend iniciado (PID: $BACKEND_PID)${NC}"
else
    echo -e "${RED}❌ Error al iniciar backend${NC}"
    exit 1
fi

# Iniciar Frontend
echo -e "${BLUE}🎨 Iniciando Frontend...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

sleep 5

if curl -s "http://localhost:5180" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend iniciado (PID: $FRONTEND_PID)${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend puede estar iniciando...${NC}"
fi

# Iniciar túneles
echo ""
echo -e "${BLUE}🌐 Activando acceso remoto...${NC}"
echo ""

./tunnel.sh start
