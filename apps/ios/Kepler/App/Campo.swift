import CoreLocation
import Foundation

/// Trabajo de campo: misión en curso, rastro GPS y sincronización de la cola.
/// La lógica (almacén, cola, orden de envío) está en el núcleo Rust.
extension Sesion {
    /// Cada cuánto se intenta enviar lo pendiente (y al recuperar la red).
    static let intervaloSync: Duration = .seconds(20)

    /// Tras entrar o desbloquear: misión en curso, GPS y sincronización periódica.
    func alEntrar() async {
        mision = try? await nucleo.misionEnCurso()
        if mision != nil { seguirRastro() }
        iniciarBucleSync()
        await sincronizar()
        await cargar()
    }

    func iniciarMision(titulo: String) async {
        let p = await ubicacion.actual()
        do {
            mision = try nucleo.iniciarMision(titulo: titulo, lat: p?.latitude, lng: p?.longitude)
            seguirRastro()
            await sincronizar()
        } catch {
            self.error = Sesion.mensaje(error)
        }
    }

    /// Completa (`true`) o aborta la misión en curso.
    func terminarMision(completar: Bool) async {
        do {
            _ = try nucleo.terminarMision(completar: completar)
            mision = nil
            ubicacion.dejarDeSeguir()
            await sincronizar()
            await cargarPanel()
        } catch {
            self.error = Sesion.mensaje(error)
        }
    }

    func sincronizar() async {
        guard fase == .dentro else { return }
        guard let e = try? await nucleo.sincronizar() else { return }
        sync = e
        if e.enLinea, let n = try? await nucleo.noLeidas() { noLeidas = n }
        if e.enLinea, sinConexion, e.ultimoError == nil {
            // Sesión restaurada al volver la red
            sinConexion = false
            await cargar()
        }
        // La misión pudo cerrarse desde otro dispositivo
        let antes = mision
        mision = try? await nucleo.misionEnCurso()
        if antes != nil, mision == nil { ubicacion.dejarDeSeguir() }
    }

    func refrescarSync() async {
        sync = try? await nucleo.estadoSync()
    }

    func detenerCampo() {
        bucleSyncTarea?.cancel()
        ubicacion.dejarDeSeguir()
        mision = nil
        sync = nil
    }

    private func iniciarBucleSync() {
        bucleSyncTarea?.cancel()
        bucleSyncTarea = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: Sesion.intervaloSync)
                await self?.sincronizar()
            }
        }
    }

    /// GPS continuo mientras hay misión (también en segundo plano): cada punto va al almacén.
    private func seguirRastro() {
        ubicacion.seguir { [weak self] l in
            guard let self else { return }
            let punto = PuntoGps(
                lat: l.coordinate.latitude, lng: l.coordinate.longitude,
                altitud: l.verticalAccuracy >= 0 ? l.altitude : nil,
                velocidad: l.speed >= 0 ? l.speed : nil,
                rumbo: l.course >= 0 ? l.course : nil,
                precisionM: l.horizontalAccuracy >= 0 ? l.horizontalAccuracy : nil,
                en: l.timestamp.timeIntervalSince1970)
            if let m = try? self.nucleo.registrarPunto(punto: punto) { self.mision = m }
        }
    }
}
