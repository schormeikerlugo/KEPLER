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
            dejarDeSeguir()
            await sincronizar()
            await cargarPanel()
        } catch {
            self.error = Sesion.mensaje(error)
        }
    }

    func sincronizar() async {
        guard fase == .dentro else { return }
        await importarSalud()
        registrarPresion()
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
        if antes != nil, mision == nil { dejarDeSeguir() }
    }

    /// Muestras nuevas de Apple Salud al almacén (cada 5 min o si `ya`).
    func importarSalud(ya: Bool = false) async {
        guard Salud.activa, let u = perfil?.usuario ?? llavero.usuarioGuardado else { return }
        if !ya, let t = ultimaSalud, Date().timeIntervalSince(t) < 300 { return }
        ultimaSalud = Date()
        let n = nucleo
        _ = await salud.importar(usuario: u) { try n.biometriaGuardar(muestras: $0) }
    }

    /// En misión, cada minuto: presión y altitud del barómetro del iPhone.
    private func registrarPresion() {
        guard mision != nil, let p = sensores.altitud.presion else { return }
        if let t = ultimaPresion, Date().timeIntervalSince(t) < 60 { return }
        ultimaPresion = Date()
        let ahora = Date().timeIntervalSince1970
        var muestras = [MuestraBio(id: UUID().uuidString.lowercased(), tipo: "presion", valor: p, unidad: "hPa",
                                   inicio: ahora, fin: ahora, fuente: "Barómetro del iPhone", detalle: nil)]
        if let a = sensores.altitud.absoluta {
            muestras.append(MuestraBio(id: UUID().uuidString.lowercased(), tipo: "altitud", valor: a, unidad: "m",
                                       inicio: ahora, fin: ahora, fuente: "Barómetro del iPhone",
                                       detalle: sensores.altitud.precision.map { "{\"precision_m\":\($0)}" }))
        }
        _ = try? nucleo.biometriaGuardar(muestras: muestras)
    }

    private func dejarDeSeguir() {
        ubicacion.dejarDeSeguir()
        sensores.parar()
    }

    func refrescarSync() async {
        sync = try? await nucleo.estadoSync()
    }

    func detenerCampo() {
        bucleSyncTarea?.cancel()
        dejarDeSeguir()
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
        sensores.empezar()
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
