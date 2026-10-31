FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements
COPY requirements.txt .

# Instalar PyTorch CPU-only (Mucho más ligero y rápido)
# Se instala ANTES de requirements.txt para que sentence-transformers lo detecte
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Instalar resto de dependencias
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código de la aplicación
COPY . .

# Exponer puerto
EXPOSE 8000

# Comando para ejecutar la aplicación
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
