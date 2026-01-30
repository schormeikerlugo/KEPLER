#!/bin/bash
# KEPLER - Script para Detener Desarrollo
# Detiene todos los servicios (Full Stack + Desktop + Mobile)

echo "========================================"
echo "  🛑 KEPLER System - Deteniendo..."
echo "========================================"
echo ""

# Detener Frontend Web
echo "🌐 Deteniendo Frontend Web..."
pkill -f "vite" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true

# Detener Electron Desktop
echo "🖥️  Deteniendo Electron Desktop..."
pkill -f "electron" 2>/dev/null || true
pkill -f "electron-builder" 2>/dev/null || true

# Detener React Native / Expo
echo "📱 Deteniendo React Native / Expo..."
pkill -f "expo" 2>/dev/null || true
pkill -f "react-native" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true

# Detener Backend
echo "🐍 Deteniendo Backend..."
pkill -f "uvicorn app.main:app" 2>/dev/null || true

# Detener Supabase
echo "📦 Deteniendo Supabase..."
# Manteniendo referencias a contenedores legacy
docker stop mars-sight-kong mars-sight-rest mars-sight-auth mars-sight-storage mars-sight-meta mars-sight-studio realtime-dev.supabase-realtime mars-sight-db 2>/dev/null || true

echo ""
echo "✅ Todos los servicios detenidos"
