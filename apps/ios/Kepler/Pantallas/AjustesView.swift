import SwiftUI

struct AjustesView: View {
    @EnvironmentObject private var sesion: Sesion
    @Environment(\.dismiss) private var cerrar
    @State private var url = ""
    @State private var confirmarSalida = false

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espacio.lg) {
                    Titulo(texto: "Ajustes").padding(.top, Tema.Espacio.lg)
                    Tarjeta {
                        VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                            CampoKepler(etiqueta: "Servidor de la base", texto: $url, marcador: Sesion.servidorPorDefecto)
                                .keyboardType(.URL)
                            EstadoServidorFila().frame(maxWidth: .infinity)
                            HStack(spacing: Tema.Espacio.md) {
                                Button("PROBAR") { Task { await sesion.comprobarServidor() } }
                                    .buttonStyle(BotonKepler(principal: false))
                                Button("GUARDAR") { Task { await sesion.cambiarServidor(url) } }
                                    .buttonStyle(BotonKepler())
                                    .disabled(url == sesion.servidor || url.isEmpty)
                            }
                            if url != sesion.servidor && sesion.fase == .dentro {
                                Text("Cambiar de servidor cierra la sesión.")
                                    .font(Jura.fuente(Tema.Tamano.pequeno))
                                    .foregroundStyle(Tema.Color.aviso)
                            }
                        }
                    }
                    if sesion.fase == .dentro, let p = sesion.perfil {
                        Tarjeta {
                            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                                Etiqueta(texto: "Sesión")
                                Text("\(p.nombreVisible) · @\(p.usuario)")
                                    .font(Jura.fuente(Tema.Tamano.cuerpo))
                                    .foregroundStyle(Tema.Color.texto)
                                Text("Se reabre con Face ID; tras 15 min en segundo plano se bloquea.")
                                    .font(Jura.fuente(Tema.Tamano.pequeno))
                                    .foregroundStyle(Tema.Color.textoTenue)
                                Button(confirmarSalida ? "¿CERRAR DE VERDAD?" : "CERRAR SESIÓN") {
                                    if confirmarSalida { Task { await sesion.salir() } } else { confirmarSalida = true }
                                }
                                .buttonStyle(BotonKepler(principal: false))
                            }
                        }
                    }
                    if sesion.fase == .dentro { TarjetaCarbinox() }
                    Tarjeta {
                        VStack(alignment: .leading, spacing: 6) {
                            Etiqueta(texto: "Acerca de")
                            Text("KEPLER \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") · núcleo Rust \(versionNucleo())")
                                .font(Jura.fuente(Tema.Tamano.pequeno))
                                .foregroundStyle(Tema.Color.textoSecundario)
                        }
                    }
                    if sesion.fase != .dentro {
                        Button("CERRAR") { cerrar() }.buttonStyle(BotonKepler(principal: false))
                    }
                }
                .padding(.horizontal, Tema.Espacio.lg)
            }
        }
        .onAppear { url = sesion.servidor }
    }
}

/// Cuenta Carbinox: de ella sale la clave para descifrar el reloj. La contraseña
/// solo se envía a api.amazwear.com y no se guarda; la clave va al Llavero.
private struct TarjetaCarbinox: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var correo = ""
    @State private var contrasena = ""
    @State private var ocupada = false
    @State private var mensaje: String?
    @State private var mac = ClavesReloj.mac
    @State private var vinculado = ClavesReloj.vinculo != nil

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                Etiqueta(texto: "Reloj Carbinox")
                if vinculado {
                    Text("Reloj vinculado\(mac.map { " · \($0)" } ?? "")")
                        .font(Jura.fuente(Tema.Tamano.cuerpo)).foregroundStyle(Tema.Color.exito)
                    Text("KEPLER descifra lo que el reloj envía a Carbinox Max, sin interferir.")
                        .font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.textoTenue)
                    Button("OLVIDAR RELOJ") {
                        ClavesReloj.olvidar()
                        sesion.reloj.cargarClaves()
                        vinculado = false
                        mac = nil
                    }
                    .buttonStyle(BotonKepler(principal: false))
                } else {
                    CampoKepler(etiqueta: "Correo de Carbinox Max", texto: $correo, marcador: "correo@ejemplo.com")
                        .keyboardType(.emailAddress)
                    CampoKepler(etiqueta: "Contraseña", texto: $contrasena, secreto: true)
                    Button(ocupada ? "CONECTANDO…" : "VINCULAR RELOJ") { Task { await vincular() } }
                        .buttonStyle(BotonKepler())
                        .disabled(ocupada || correo.isEmpty || contrasena.isEmpty)
                    Text("La contraseña solo se envía a Carbinox (api.amazwear.com) y no se guarda.")
                        .font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.textoTenue)
                }
                if let mensaje {
                    Text(mensaje).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.aviso)
                }
            }
        }
    }

    private func vincular() async {
        ocupada = true
        defer { ocupada = false }
        do {
            let relojes = try await carbinoxRelojes(correo: correo, contrasena: contrasena)
            contrasena = ""
            guard let r = relojes.first(where: { $0.claveVinculo != nil }) else {
                mensaje = relojes.isEmpty ? "La cuenta no tiene relojes vinculados."
                    : "La cuenta no guarda la clave del reloj (\(relojes.count) reloj/es)."
                return
            }
            ClavesReloj.vinculo = r.claveVinculo
            ClavesReloj.sesion = nil
            ClavesReloj.mac = r.mac
            mac = r.mac
            vinculado = true
            mensaje = "Listo. Para obtener la clave de sesión, cierra y abre Carbinox Max con KEPLER abierto."
            sesion.conectarReloj()
        } catch {
            mensaje = Sesion.mensaje(error)
        }
    }
}
