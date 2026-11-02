import SwiftUI

struct PrincipalView: View {
    @EnvironmentObject private var sesion: Sesion
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
            CortexView()
                .tabItem { Label("Cortex", systemImage: "sparkles") }
                .tag(3)
            MasView()
                .tabItem { Label("Base", systemImage: "tray.full") }
                .badge(Int(sesion.noLeidas))
                .tag(4)
        }
        #if DEBUG
        .onAppear {
            let s = ProcessInfo.processInfo.environment["KEPLER_DEMO_SECCION"] ?? ""
            if s.hasPrefix("mision") { pestana = 1 }
            if s.hasPrefix("mapa") { pestana = 2 }
            if s.hasPrefix("cortex") { pestana = 3 }
            if s.hasPrefix("base") { pestana = 4 }
        }
        #endif
    }
}
