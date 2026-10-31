//! Compila el `.proto` con protox (Rust puro): no hace falta `protoc` instalado.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let archivos = ["proto/kepler/v1/en_vivo.proto"];
    for archivo in archivos {
        println!("cargo:rerun-if-changed={archivo}");
    }

    let descriptores = protox::compile(archivos, ["proto"])?;
    prost_build::Config::new().compile_fds(descriptores)?;
    Ok(())
}
