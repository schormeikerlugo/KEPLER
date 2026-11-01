import SwiftUI

struct PrincipalView: View {
    var body: some View {
        TabView {
            PanelView()
                .tabItem { Label("Panel", systemImage: "square.grid.2x2") }
            Pendiente(titulo: "Misión", detalle: "Cámara con detección, GPS y capturas offline.", fase: "F3 · F4")
                .tabItem { Label("Misión", systemImage: "scope") }
            Pendiente(titulo: "Mapa", detalle: "Mapa offline con POIs, alertas y rutas.", fase: "F5")
                .tabItem { Label("Mapa", systemImage: "map") }
            AjustesView()
                .tabItem { Label("Ajustes", systemImage: "gearshape") }
        }
    }
}

/// Pestañas que llegan en fases siguientes del paso 7.
struct Pendiente: View {
    let titulo: String
    let detalle: String
    let fase: String

    var body: some View {
        ZStack {
            FondoKepler()
            VStack(spacing: Tema.Espacio.md) {
                Titulo(texto: titulo)
                Text(detalle)
                    .font(Jura.fuente(Tema.Tamano.cuerpo))
                    .foregroundStyle(Tema.Color.textoTenue)
                    .multilineTextAlignment(.center)
                Pastilla(texto: "En desarrollo · \(fase)", tono: Tema.Color.aviso)
            }
            .padding(Tema.Espacio.xl)
        }
    }
}
