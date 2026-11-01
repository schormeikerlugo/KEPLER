import SwiftUI

/// Sesión guardada: se abre con Face ID.
struct BloqueoView: View {
    @EnvironmentObject private var sesion: Sesion
    let usuario: String

    var body: some View {
        ZStack {
            FondoKepler()
            VStack(spacing: Tema.Espacio.xl) {
                Spacer()
                Logo(tamano: 34)
                VStack(spacing: Tema.Espacio.sm) {
                    Image(systemName: "faceid")
                        .font(.system(size: 54, weight: .light))
                        .foregroundStyle(Tema.Color.acento)
                        .shadow(color: Tema.Color.acento.opacity(0.5), radius: 12)
                    Text("@\(usuario)")
                        .font(Jura.fuente(Tema.Tamano.tituloTarjeta, .semibold))
                        .foregroundStyle(Tema.Color.texto)
                    Etiqueta(texto: "Sesión bloqueada")
                }
                .padding(.vertical, Tema.Espacio.xl)
                if let e = sesion.error {
                    Text(e)
                        .font(Jura.fuente(Tema.Tamano.pequeno))
                        .foregroundStyle(Tema.Color.peligro)
                        .multilineTextAlignment(.center)
                }
                Button(sesion.ocupada ? "ABRIENDO…" : "DESBLOQUEAR") {
                    Task { await sesion.desbloquear() }
                }
                .buttonStyle(BotonKepler())
                .disabled(sesion.ocupada)
                Button("USAR OTRA CUENTA") { sesion.usarOtraCuenta() }
                    .buttonStyle(BotonKepler(principal: false))
                Spacer()
            }
            .padding(.horizontal, Tema.Espacio.xl)
        }
    }
}
