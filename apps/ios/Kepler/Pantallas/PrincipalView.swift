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
            MapaView()
                .tabItem { Label("Mapa", systemImage: "map") }
                .tag(2)
            AjustesView()
                .tabItem { Label("Ajustes", systemImage: "gearshape") }
                .tag(3)
        }
        #if DEBUG
        .onAppear {
            let s = ProcessInfo.processInfo.environment["KEPLER_DEMO_SECCION"] ?? ""
            if s.hasPrefix("mision") { pestana = 1 }
            if s.hasPrefix("mapa") { pestana = 2 }
        }
        #endif
    }
}
