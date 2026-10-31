# Construir desde la raíz del repo:
#   docker build -f services/kepler-server/Dockerfile -t kepler-server .

FROM rust:1.99-slim-trixie AS compilacion
WORKDIR /src
# Sin rust-toolchain.toml: la imagen ya trae la versión fijada.
COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY services/kepler-server services/kepler-server
RUN cargo build --release --locked -p kepler-server

FROM debian:trixie-slim
# Certificados raíz para HTTPS (Open-Meteo, Nominatim, ipapi)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home kepler
COPY --from=compilacion /src/target/release/kepler-server /usr/local/bin/kepler-server
USER kepler
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/kepler-server"]
