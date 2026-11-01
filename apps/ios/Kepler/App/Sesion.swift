import Foundation
import SwiftUI

/// Estado de la app y puente con el núcleo Rust (`Nucleo`).
@MainActor
final class Sesion: ObservableObject {
    enum Fase: Equatable {
        case arrancando
        case login
        /// Hay sesión guardada o en memoria: falta Face ID.
        case bloqueada(usuario: String)
        case dentro
    }

    static let servidorPorDefecto = "http://192.168.68.117:8000"
    /// Tiempo en segundo plano tras el que hay que volver a usar Face ID.
    static let bloqueoTras: TimeInterval = 15 * 60

    @Published private(set) var fase: Fase = .arrancando
    @Published private(set) var perfil: PerfilMovil?
    @Published private(set) var resumen: Resumen?
    @Published private(set) var servidorEstado: EstadoServidor?
    @Published var error: String?
    @Published private(set) var ocupada = false

    @AppStorage("kepler.servidor") var servidor = Sesion.servidorPorDefecto

    let llavero = LlaveroKeychain()
    private(set) var nucleo: Nucleo
    private var enSegundoPlanoDesde: Date?
    /// Sesión abierta en memoria (bloquear no la cierra).
    private var abierta = false

    init() {
        let url = UserDefaults.standard.string(forKey: "kepler.servidor") ?? Sesion.servidorPorDefecto
        nucleo = Nucleo(servidor: url, llavero: llavero)
    }

    func arrancar() async {
        #if DEBUG
        // Pruebas en el simulador sin teclear: `scripts/ios.sh sim` con KEPLER_DEMO_USUARIO/CONTRASENA
        let entorno = ProcessInfo.processInfo.environment
        if let u = entorno["KEPLER_DEMO_USUARIO"], let c = entorno["KEPLER_DEMO_CONTRASENA"], !u.isEmpty {
            await entrar(usuario: u, contrasena: c)
            return
        }
        #endif
        if let u = llavero.usuarioGuardado {
            fase = .bloqueada(usuario: u)
            await desbloquear()
        } else {
            fase = .login
        }
        await comprobarServidor()
    }

    func entrar(usuario: String, contrasena: String) async {
        guard usuarioValido(usuario: usuario) else {
            error = "Usuario: 3 a 30 caracteres (letras, números o _)"
            return
        }
        await trabajar {
            _ = try await self.nucleo.entrar(usuario: usuario, contrasena: contrasena)
            self.abierta = true
            self.fase = .dentro
            await self.cargar()
        }
    }

    /// Face ID: con la sesión en memoria solo verifica; si no, la restaura del Llavero.
    func desbloquear() async {
        if abierta {
            if await llavero.verificarDueno(motivo: "Desbloquear KEPLER") {
                fase = .dentro
                await cargar()
            }
            return
        }
        await trabajar {
            let token = try await self.llavero.leerToken(motivo: "Abrir tu sesión de KEPLER")
            _ = try await self.nucleo.restaurar(refreshToken: token)
            self.abierta = true
            self.fase = .dentro
            await self.cargar()
        }
    }

    func salir() async {
        await nucleo.salir()
        llavero.olvidar()
        abierta = false
        perfil = nil
        resumen = nil
        fase = .login
    }

    /// Otra cuenta desde la pantalla de bloqueo.
    func usarOtraCuenta() {
        llavero.olvidar()
        abierta = false
        fase = .login
    }

    func cambiarServidor(_ url: String) async {
        let limpio = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty, limpio != servidor else { return }
        await nucleo.salir()
        llavero.olvidar()
        abierta = false
        servidor = limpio
        nucleo = Nucleo(servidor: limpio, llavero: llavero)
        fase = .login
        await comprobarServidor()
    }

    func cargar() async {
        async let p = try? nucleo.perfil()
        async let r = try? nucleo.resumen()
        async let s = nucleo.estadoServidor()
        let (perfil, resumen, estado) = await (p, r, s)
        if let perfil { self.perfil = perfil }
        if let resumen { self.resumen = resumen }
        servidorEstado = estado
    }

    func comprobarServidor() async {
        servidorEstado = await nucleo.estadoServidor()
    }

    // MARK: - Ciclo de vida

    func cambioDeEscena(_ fase: ScenePhase) {
        switch fase {
        case .background:
            enSegundoPlanoDesde = Date()
        case .active:
            if let desde = enSegundoPlanoDesde, Date().timeIntervalSince(desde) > Sesion.bloqueoTras,
               self.fase == .dentro, let u = perfil?.usuario ?? llavero.usuarioGuardado {
                self.fase = .bloqueada(usuario: u)
            }
            enSegundoPlanoDesde = nil
        default:
            break
        }
    }

    private func trabajar(_ accion: @escaping () async throws -> Void) async {
        ocupada = true
        error = nil
        do {
            try await accion()
        } catch {
            self.error = Sesion.mensaje(error)
        }
        ocupada = false
    }

    static func mensaje(_ e: Error) -> String {
        switch e {
        case let k as ErrorKepler:
            switch k {
            case let .Red(m), let .NoAutorizado(m), let .Servidor(m): return m
            }
        case let e as LocalizedError:
            return e.errorDescription ?? "\(e)"
        default:
            return e.localizedDescription
        }
    }
}
