#!/bin/bash
# ============================================================
# KEPLER Remote Access - Tunnel Activation Script
# ============================================================
# Este script inicia un túnel para acceder a KEPLER desde cualquier lugar
# 
# USO: ./tunnel.sh [start|stop|status]
# ============================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Puertos
FRONTEND_PORT=5180
BACKEND_PORT=8000
OLLAMA_PORT=11434

# Archivos de log
TUNNEL_DIR="$HOME/.kepler-tunnel"
FRONTEND_LOG="$TUNNEL_DIR/frontend.log"
BACKEND_LOG="$TUNNEL_DIR/backend.log"
PID_FILE="$TUNNEL_DIR/tunnel.pid"
URL_FILE="$TUNNEL_DIR/urls.txt"

# Crear directorio si no existe
mkdir -p "$TUNNEL_DIR"

# Función para verificar si cloudflared está instalado
check_cloudflared() {
    if ! command -v cloudflared &> /dev/null; then
        echo -e "${YELLOW}⚠️  cloudflared no está instalado. Instalando...${NC}"
        
        # Detectar arquitectura
        ARCH=$(uname -m)
        case $ARCH in
            x86_64) ARCH_NAME="amd64" ;;
            aarch64) ARCH_NAME="arm64" ;;
            armv7l) ARCH_NAME="arm" ;;
            *) echo -e "${RED}❌ Arquitectura no soportada: $ARCH${NC}"; exit 1 ;;
        esac
        
        # Descargar cloudflared
        DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$ARCH_NAME"
        echo -e "${BLUE}📥 Descargando desde: $DOWNLOAD_URL${NC}"
        
        sudo curl -fsSL "$DOWNLOAD_URL" -o /usr/local/bin/cloudflared
        sudo chmod +x /usr/local/bin/cloudflared
        
        echo -e "${GREEN}✅ cloudflared instalado correctamente${NC}"
    fi
}

# Función para iniciar túneles
start_tunnels() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║       🔭 KEPLER - Iniciando Acceso Remoto                ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Verificar que los servicios locales estén corriendo
    echo -e "${BLUE}🔍 Verificando servicios locales...${NC}"
    
    FRONTEND_OK=false
    BACKEND_OK=false
    
    if curl -sk "https://localhost:$FRONTEND_PORT" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Frontend activo en puerto $FRONTEND_PORT (HTTPS)${NC}"
        FRONTEND_OK=true
    else
        echo -e "${YELLOW}⚠️  Frontend no detectado en puerto $FRONTEND_PORT${NC}"
        echo -e "${YELLOW}   Ejecuta primero: cd frontend && npm run dev${NC}"
    fi
    
    if curl -s "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend activo en puerto $BACKEND_PORT${NC}"
        BACKEND_OK=true
    else
        echo -e "${YELLOW}⚠️  Backend no detectado en puerto $BACKEND_PORT${NC}"
        echo -e "${YELLOW}   Ejecuta primero: cd backend && uvicorn app.main:app${NC}"
    fi

    # Verificar Ollama
    if curl -s "http://localhost:$OLLAMA_PORT" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Ollama activo en puerto $OLLAMA_PORT${NC}"
    else
        echo -e "${YELLOW}⚠️  Ollama no detectado - Chat IA no funcionará remotamente${NC}"
    fi
    
    # Si ningún servicio está activo, salir
    if ! $FRONTEND_OK && ! $BACKEND_OK; then
        echo ""
        echo -e "${RED}❌ No hay servicios activos para exponer${NC}"
        echo -e "${YELLOW}   Inicia al menos el frontend o backend primero${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${BLUE}🚀 Iniciando túneles Cloudflare...${NC}"
    echo -e "${YELLOW}   (Esto puede tomar 10-15 segundos...)${NC}"
    echo ""
    
    # Función para extraer URL del log
    extract_url() {
        local log_file="$1"
        local max_attempts=10
        local attempt=0
        local url=""
        
        while [ $attempt -lt $max_attempts ] && [ -z "$url" ]; do
            sleep 2
            url=$(grep -o 'https://[^[:space:]]*\.trycloudflare\.com' "$log_file" 2>/dev/null | head -1)
            attempt=$((attempt + 1))
        done
        
        echo "$url"
    }
    
    FRONTEND_URL=""
    BACKEND_URL=""
    
    # Iniciar túnel para Frontend (si está activo)
    if $FRONTEND_OK; then
        echo -e "${CYAN}📡 Creando túnel para Frontend (HTTPS)...${NC}"
        cloudflared tunnel --url "https://localhost:$FRONTEND_PORT" --no-tls-verify > "$FRONTEND_LOG" 2>&1 &
        FRONTEND_PID=$!
        echo "$FRONTEND_PID" > "$PID_FILE"
        
        FRONTEND_URL=$(extract_url "$FRONTEND_LOG")
        
        if [ -n "$FRONTEND_URL" ]; then
            echo -e "${GREEN}✅ Frontend: $FRONTEND_URL${NC}"
        else
            echo -e "${YELLOW}⚠️  Túnel frontend en proceso... (puede aparecer después)${NC}"
        fi
    fi
    
    # Iniciar túnel para Backend (si está activo)
    if $BACKEND_OK; then
        echo -e "${CYAN}📡 Creando túnel para Backend...${NC}"
        cloudflared tunnel --url "http://localhost:$BACKEND_PORT" > "$BACKEND_LOG" 2>&1 &
        BACKEND_PID=$!
        echo "$BACKEND_PID" >> "$PID_FILE"
        
        BACKEND_URL=$(extract_url "$BACKEND_LOG")
        
        if [ -n "$BACKEND_URL" ]; then
            echo -e "${GREEN}✅ Backend: $BACKEND_URL${NC}"
        else
            echo -e "${YELLOW}⚠️  Túnel backend en proceso... (puede aparecer después)${NC}"
        fi
    fi
    
    # Si ninguna URL se obtuvo, esperar un poco más
    if [ -z "$FRONTEND_URL" ] && [ -z "$BACKEND_URL" ]; then
        echo -e "${YELLOW}⏳ Esperando a que los túneles se establezcan...${NC}"
        sleep 10
        
        if $FRONTEND_OK; then
            FRONTEND_URL=$(grep -o 'https://[^[:space:]]*\.trycloudflare\.com' "$FRONTEND_LOG" 2>/dev/null | head -1)
        fi
        if $BACKEND_OK; then
            BACKEND_URL=$(grep -o 'https://[^[:space:]]*\.trycloudflare\.com' "$BACKEND_LOG" 2>/dev/null | head -1)
        fi
    fi
    
    # Guardar URLs
    echo "FRONTEND=$FRONTEND_URL" > "$URL_FILE"
    echo "BACKEND=$BACKEND_URL" >> "$URL_FILE"
    echo "CREATED=$(date '+%Y-%m-%d %H:%M:%S')" >> "$URL_FILE"
    
    echo ""
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║               🌐 KEPLER REMOTO ACTIVADO                  ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${GREEN}🔭 Frontend:${NC} $FRONTEND_URL"
    echo -e "${GREEN}⚙️  Backend:${NC}  $BACKEND_URL"
    echo ""
    echo -e "${YELLOW}📱 Abre el enlace del Frontend en tu móvil para usar KEPLER${NC}"
    echo ""
    echo -e "${BLUE}ℹ️  Los túneles permanecerán activos mientras este terminal esté abierto${NC}"
    echo -e "${BLUE}   Para detener: ./tunnel.sh stop${NC}"
    echo ""
    
    # Generar QR code para el móvil (si qrencode está instalado)
    if command -v qrencode &> /dev/null; then
        echo -e "${CYAN}📱 Escanea este QR con tu móvil:${NC}"
        qrencode -t ANSIUTF8 "$FRONTEND_URL"
    fi
    
    # Mantener el script corriendo
    echo -e "${YELLOW}Presiona Ctrl+C para detener los túneles...${NC}"
    wait
}

# Función para detener túneles
stop_tunnels() {
    echo -e "${YELLOW}🛑 Deteniendo túneles...${NC}"
    
    if [ -f "$PID_FILE" ]; then
        while read pid; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
                echo -e "${GREEN}✅ Proceso $pid detenido${NC}"
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    
    # Matar cualquier proceso cloudflared residual
    pkill -f "cloudflared tunnel" 2>/dev/null || true
    
    echo -e "${GREEN}✅ Túneles detenidos${NC}"
}

# Función para ver estado
show_status() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║            🔭 KEPLER - Estado del Túnel                  ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    if [ -f "$URL_FILE" ]; then
        source "$URL_FILE"
        echo -e "${GREEN}🔭 Frontend:${NC} $FRONTEND"
        echo -e "${GREEN}⚙️  Backend:${NC}  $BACKEND"
        echo -e "${BLUE}📅 Creado:${NC}   $CREATED"
        
        # Verificar si están activos
        if [ -f "$PID_FILE" ]; then
            ACTIVE=true
            while read pid; do
                if ! kill -0 "$pid" 2>/dev/null; then
                    ACTIVE=false
                fi
            done < "$PID_FILE"
            
            if $ACTIVE; then
                echo -e "${GREEN}✅ Estado: ACTIVO${NC}"
            else
                echo -e "${RED}❌ Estado: INACTIVO (procesos terminados)${NC}"
            fi
        else
            echo -e "${RED}❌ Estado: INACTIVO${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  No hay túneles configurados${NC}"
        echo -e "${BLUE}   Ejecuta: ./tunnel.sh start${NC}"
    fi
}

# Verificar cloudflared al inicio
check_cloudflared

# Manejo de señales para limpieza
trap stop_tunnels EXIT INT TERM

# Comandos
case "${1:-start}" in
    start)
        stop_tunnels 2>/dev/null || true
        start_tunnels
        ;;
    stop)
        stop_tunnels
        ;;
    status)
        show_status
        ;;
    *)
        echo "Uso: $0 [start|stop|status]"
        exit 1
        ;;
esac
