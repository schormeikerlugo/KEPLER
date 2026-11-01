import SwiftUI

@main
struct KeplerApp: App {
    @StateObject private var sesion = Sesion()
    @Environment(\.scenePhase) private var escena

    init() {
        #if DEBUG
        Banco.ejecutarSiToca()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            Raiz()
                .environmentObject(sesion)
                .preferredColorScheme(.dark)
                .tint(Tema.Color.acento)
                .task { await sesion.arrancar() }
        }
        .onChange(of: escena) { _, nueva in sesion.cambioDeEscena(nueva) }
    }
}

struct Raiz: View {
    @EnvironmentObject private var sesion: Sesion

    var body: some View {
        ZStack {
            switch sesion.fase {
            case .arrancando:
                FondoKepler().overlay(Logo())
            case .login:
                LoginView().transition(.opacity)
            case let .bloqueada(usuario):
                BloqueoView(usuario: usuario).transition(.opacity)
            case .dentro:
                PrincipalView().transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: Tema.Movimiento.normal), value: sesion.fase)
    }
}
