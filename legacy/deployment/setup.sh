#!/bin/bash
# Mars-Sight AR - Setup Script
# This script automates the initial setup on a new machine

set -e

echo "==================================="
echo "  Mars-Sight AR - Setup Script"
echo "==================================="
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose found"

# Navigate to deployment folder
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$SCRIPT_DIR"

# Create .env if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env from template..."
    cp .env.example .env
    echo "✅ .env created. Please review and update if needed."
fi

# Start infrastructure services first
echo ""
echo "🚀 Starting database and Supabase services..."
docker-compose -f docker-compose.production.yml up -d postgres auth rest kong

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Check if database is healthy
until docker exec mars-sight-db pg_isready -U postgres > /dev/null 2>&1; do
    echo "   Waiting for PostgreSQL..."
    sleep 2
done
echo "✅ Database is ready"

# Run migrations
echo ""
echo "📦 Running database migrations..."

# First run the main migration if it exists
if [ -f "$PROJECT_DIR/backend/migrations/FULL_MIGRATION_EXPORT.sql" ]; then
    echo "   Running main migration..."
    docker exec -i mars-sight-db psql -U postgres -d postgres < "$PROJECT_DIR/backend/migrations/FULL_MIGRATION_EXPORT.sql" 2>/dev/null || true
fi

# Then run the additional setup
echo "   Running additional setup (chat_logs, RPC functions)..."
docker exec -i mars-sight-db psql -U postgres -d postgres < init_additional.sql

# Reload PostgREST schema cache
docker exec -i mars-sight-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true
docker-compose -f docker-compose.production.yml restart rest

echo "✅ Database migrations complete"

# Build and start application services
echo ""
echo "🔨 Building application containers..."
docker-compose -f docker-compose.production.yml build backend frontend

echo ""
echo "🚀 Starting all services..."
docker-compose -f docker-compose.production.yml up -d

echo ""
echo "==================================="
echo "  ✅ Setup Complete!"
echo "==================================="
echo ""
echo "Services running:"
echo "  - Frontend:    http://localhost:80"
echo "  - Backend API: http://localhost:8001"
echo "  - Supabase:    http://localhost:54321"
echo "  - Database:    localhost:54322"
echo ""
echo "Default credentials:"
echo "  Database: postgres / mars2025"
echo ""
echo "⚠️  Remember to:"
echo "  1. Install and run Ollama locally for AI features"
echo "  2. Create a user account through the app"
echo ""
echo "To stop: docker-compose -f docker-compose.production.yml down"
echo "To view logs: docker-compose -f docker-compose.production.yml logs -f"
