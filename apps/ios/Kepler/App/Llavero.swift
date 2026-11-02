import Foundation
import LocalAuthentication
import OSLog
import Security

private let registro = Logger(subsystem: "dev.schormeiker.kepler", category: "llavero")

/// Sesión guardada en el Llavero del iPhone. El refresh token solo se puede leer
/// tras Face ID (o el código del iPhone); Rust lo reescribe en cada renovación
/// porque Auth lo rota.
final class LlaveroKeychain: Llavero, @unchecked Sendable {
    private let servicio = "dev.schormeiker.kepler.sesion"
    private let claveUsuario = "kepler.usuario_guardado"

    /// Usuario con sesión guardada (sin pedir Face ID: va en UserDefaults).
    var usuarioGuardado: String? {
        UserDefaults.standard.string(forKey: claveUsuario)
    }

    func guardarSesion(usuario: String, refreshToken: String) {
        borrarToken()
        guard let control = SecAccessControlCreateWithFlags(
            nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .userPresence, nil
        ) else { return }
        let atributos: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecAttrAccount as String: usuario,
            kSecAttrAccessControl as String: control,
            kSecValueData as String: Data(refreshToken.utf8),
        ]
        var estado = SecItemAdd(atributos as CFDictionary, nil)
        if estado != errSecSuccess {
            registro.notice("Llavero con Face ID no disponible (\(estado)): se guarda sin control biométrico")
            // Sin código en el dispositivo (simulador): sin control biométrico
            var simple = atributos
            simple.removeValue(forKey: kSecAttrAccessControl as String)
            simple[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            estado = SecItemAdd(simple as CFDictionary, nil)
        }
        if estado == errSecSuccess {
            UserDefaults.standard.set(usuario, forKey: claveUsuario)
        } else {
            registro.error("No se pudo guardar la sesión en el Llavero: \(estado)")
        }
    }

    /// Pide Face ID y devuelve el refresh token guardado.
    func leerToken(motivo: String) async throws -> String {
        let contexto = LAContext()
        contexto.localizedFallbackTitle = "Usar código"
        var error: NSError?
        if contexto.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) {
            try await contexto.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: motivo)
        }
        let consulta: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseAuthenticationContext as String: contexto,
        ]
        var resultado: AnyObject?
        let estado = SecItemCopyMatching(consulta as CFDictionary, &resultado)
        guard estado == errSecSuccess, let datos = resultado as? Data, let token = String(data: datos, encoding: .utf8) else {
            throw ErrorLlavero.sinSesion
        }
        return token
    }

    /// Desbloqueo sin leer nada (sesión todavía en memoria).
    func verificarDueno(motivo: String) async -> Bool {
        let contexto = LAContext()
        var error: NSError?
        guard contexto.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return true }
        return (try? await contexto.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: motivo)) ?? false
    }

    func olvidar() {
        borrarToken()
        UserDefaults.standard.removeObject(forKey: claveUsuario)
    }

    private func borrarToken() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servicio] as CFDictionary)
    }
}

enum ErrorLlavero: LocalizedError {
    case sinSesion
    var errorDescription: String? { "No hay una sesión guardada en este iPhone" }
}

/// Claves del reloj Carbinox (vínculo y sesión). Sin Face ID: el reloj se
/// escucha también en segundo plano. Solo en este iPhone.
enum ClavesReloj {
    private static let servicio = "dev.schormeiker.kepler.reloj"

    static var vinculo: String? {
        get { leer("vinculo") }
        set { guardar("vinculo", newValue) }
    }

    static var sesion: String? {
        get { leer("sesion") }
        set { guardar("sesion", newValue) }
    }

    /// MAC del reloj vinculado (no es secreta).
    static var mac: String? {
        get { UserDefaults.standard.string(forKey: "kepler.reloj.mac") }
        set { UserDefaults.standard.set(newValue, forKey: "kepler.reloj.mac") }
    }

    static func olvidar() {
        vinculo = nil
        sesion = nil
        mac = nil
    }

    private static func leer(_ cuenta: String) -> String? {
        let consulta: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecAttrAccount as String: cuenta,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var resultado: AnyObject?
        guard SecItemCopyMatching(consulta as CFDictionary, &resultado) == errSecSuccess,
              let datos = resultado as? Data else { return nil }
        return String(data: datos, encoding: .utf8)
    }

    private static func guardar(_ cuenta: String, _ valor: String?) {
        let clave: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecAttrAccount as String: cuenta,
        ]
        SecItemDelete(clave as CFDictionary)
        guard let valor else { return }
        var atributos = clave
        atributos[kSecValueData as String] = Data(valor.utf8)
        atributos[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let estado = SecItemAdd(atributos as CFDictionary, nil)
        if estado != errSecSuccess { registro.error("No se pudo guardar la clave del reloj: \(estado)") }
    }
}
