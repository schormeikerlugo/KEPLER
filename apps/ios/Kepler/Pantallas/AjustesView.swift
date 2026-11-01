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
