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
