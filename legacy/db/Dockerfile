FROM postgis/postgis:15-3.3

# Instalar dependencias de compilación
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    make \
    gcc \
    postgresql-server-dev-15 \
    ca-certificates

# Clonar e instalar pgvector
RUN git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git /tmp/pgvector && \
    cd /tmp/pgvector && \
    make && \
    make install && \
    rm -rf /tmp/pgvector

# Limpieza
RUN apt-get remove -y git make gcc postgresql-server-dev-15 && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*
