import SwiftUI

struct PrincipalView: View {
    @State private var pestana = 0

    var body: some View {
        TabView(selection: $pestana) {
            PanelView()
                .tabItem { Label("Panel", systemImage: "square.grid.2x2") }
                .tag(0)
            MisionView()
                .tabItem { Label("Misión", systemImage: "scope") }
                .tag(1)
            Pendiente(titulo: "Mapa", detalle: "Mapa offline con POIs, alertas y rutas.", fase: "F5")
                .tabItem { Label("Mapa", systemImage: "map") }
                .tag(2)
            AjustesView()
                .tabItem { Label("Ajustes", systemImage: "gearshape") }
                .tag(3)
        }
        #if DEBUG
        .onAppear {
            if ProcessInfo.processInfo.environment["KEPLER_DEMO_SECCION"]?.hasPrefix("mision") == true { pestana = 1 }
        }
        #endif
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
