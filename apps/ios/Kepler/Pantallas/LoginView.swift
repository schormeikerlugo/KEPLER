import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var usuario = ""
    @State private var contrasena = ""
    @State private var ajustes = false

    var body: some View {
        ZStack {
            FondoKepler()
            VStack(spacing: Tema.Espacio.xxl) {
                Spacer()
                VStack(spacing: Tema.Espacio.md) {
                    Logo(tamano: 34)
                    Etiqueta(texto: "Unidad de campo")
                }
                Tarjeta(relleno: Tema.Espacio.xl) {
                    VStack(spacing: Tema.Espacio.lg) {
                        CampoKepler(etiqueta: "Usuario", texto: $usuario, marcador: "explorador")
                        CampoKepler(etiqueta: "Contraseña", texto: $contrasena, secreto: true)
                        if let e = sesion.error {
                            Text(e)
                                .font(Jura.fuente(Tema.Tamano.pequeno))
                                .foregroundStyle(Tema.Color.peligro)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        Button(sesion.ocupada ? "ENTRANDO…" : "ENTRAR") {
                            Task { await sesion.entrar(usuario: usuario, contrasena: contrasena) }
                        }
                        .buttonStyle(BotonKepler())
                        .disabled(sesion.ocupada || usuario.isEmpty || contrasena.isEmpty)
                    }
                }
                Spacer()
                Button { ajustes = true } label: {
                    EstadoServidorFila()
                }
            }
            .padding(.horizontal, Tema.Espacio.xl)
            .padding(.bottom, Tema.Espacio.lg)
        }
        .sheet(isPresented: $ajustes) { AjustesView() }
    }
}

/// «SERVIDOR · 12 ms» o «SIN CONEXIÓN», con la URL.
struct EstadoServidorFila: View {
    @EnvironmentObject private var sesion: Sesion

    var body: some View {
        VStack(spacing: 6) {
            if let s = sesion.servidorEstado {
                Pastilla(texto: s.enLinea ? "Servidor · \(s.latenciaMs) ms" : "Sin conexión",
                         tono: s.enLinea ? Tema.Color.exito : Tema.Color.peligro)
            } else {
                Pastilla(texto: "Comprobando…", tono: Tema.Color.textoTenue)
            }
            Text(sesion.servidor)
                .font(Jura.fuente(Tema.Tamano.etiqueta))
                .foregroundStyle(Tema.Color.textoEtiqueta)
        }
    }
}
