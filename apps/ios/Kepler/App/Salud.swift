import Foundation
import HealthKit

/// Lectura de Apple Salud: lo que escriben el reloj (Carbinox Max), el iPhone y
/// el explorador (estado de ánimo). Solo lectura salvo el estado de ánimo.
@MainActor
final class Salud {
    let almacen = HKHealthStore()

    struct Tipo {
        let clave: String
        let nombre: String
        let tipo: HKSampleType
        /// Unidad para las cantidades (nil = categoría).
        let unidad: HKUnit?
        let unidadTexto: String
    }

    static var disponible: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Lo que KEPLER quiere leer de Salud.
    static let tipos: [Tipo] = {
        func c(_ id: HKQuantityTypeIdentifier, _ clave: String, _ nombre: String, _ u: HKUnit, _ ut: String) -> Tipo {
            Tipo(clave: clave, nombre: nombre, tipo: HKQuantityType(id), unidad: u, unidadTexto: ut)
        }
        let lpm = HKUnit.count().unitDivided(by: .minute())
        var t: [Tipo] = [
            c(.stepCount, "pasos", "Pasos", .count(), "pasos"),
            c(.distanceWalkingRunning, "distancia", "Distancia a pie", .meter(), "m"),
            c(.activeEnergyBurned, "energia_activa", "Energía activa", .kilocalorie(), "kcal"),
            c(.basalEnergyBurned, "energia_basal", "Energía en reposo", .kilocalorie(), "kcal"),
            c(.flightsClimbed, "pisos", "Pisos subidos", .count(), "pisos"),
            c(.heartRate, "pulso", "Ritmo cardíaco", lpm, "lpm"),
            c(.restingHeartRate, "pulso_reposo", "Pulso en reposo", lpm, "lpm"),
            c(.walkingHeartRateAverage, "pulso_caminando", "Pulso caminando", lpm, "lpm"),
            c(.heartRateVariabilitySDNN, "vfc", "Variabilidad cardíaca (SDNN)", .secondUnit(with: .milli), "ms"),
            c(.oxygenSaturation, "spo2", "Oxígeno en sangre", .percent(), "%"),
            c(.respiratoryRate, "respiracion", "Frecuencia respiratoria", lpm, "rpm"),
            c(.bodyTemperature, "temperatura", "Temperatura corporal", .degreeCelsius(), "°C"),
            c(.vo2Max, "vo2max", "VO₂ máx.", HKUnit(from: "ml/kg*min"), "ml/kg·min"),
            c(.bodyMass, "peso", "Peso", .gramUnit(with: .kilo), "kg"),
            c(.height, "altura", "Altura", .meter(), "m"),
            Tipo(clave: "sueno", nombre: "Sueño", tipo: HKCategoryType(.sleepAnalysis), unidad: nil, unidadTexto: "h"),
            Tipo(clave: "consciencia", nombre: "Minutos de atención plena", tipo: HKCategoryType(.mindfulSession),
                 unidad: nil, unidadTexto: "min"),
        ]
        if #available(iOS 18.0, *) {
            t.append(Tipo(clave: "animo", nombre: "Estado de ánimo", tipo: HKSampleType.stateOfMindType(),
                          unidad: nil, unidadTexto: "valencia"))
        }
        return t
    }()

    /// Pide permiso de lectura (y de escritura del estado de ánimo).
    func pedirPermiso() async throws {
        var escribir: Set<HKSampleType> = []
        if #available(iOS 18.0, *) { escribir.insert(HKSampleType.stateOfMindType()) }
        try await almacen.requestAuthorization(toShare: escribir, read: Set(Salud.tipos.map(\.tipo)))
    }

    struct Fila: Codable, Identifiable {
        var id: String { clave }
        let clave: String
        let nombre: String
        /// Muestras en los últimos 7 días.
        let muestras7d: Int
        /// Apps o dispositivos que las escribieron.
        let fuentes: [String]
        let ultimoValor: String?
        let ultimaFecha: Date?
    }

    /// Qué hay de cada tipo en los últimos 7 días y de dónde viene. iOS no dice
    /// si se negó el permiso de lectura: sin permiso, simplemente no hay muestras.
    func diagnostico() async -> [Fila] {
        let desde = Calendar.current.date(byAdding: .day, value: -7, to: Date())!
        var filas: [Fila] = []
        for t in Salud.tipos {
            let muestras = (try? await self.muestras(t.tipo, desde: desde, limite: 5000)) ?? []
            let fuentes = Set(muestras.map { m -> String in
                let d = m.device.map { " · \($0.name ?? $0.model ?? "?")" } ?? ""
                return m.sourceRevision.source.name + d
            })
            filas.append(Fila(clave: t.clave, nombre: t.nombre, muestras7d: muestras.count,
                              fuentes: fuentes.sorted(), ultimoValor: muestras.first.map { Salud.valor($0, t) },
                              ultimaFecha: muestras.first?.endDate))
        }
        return filas
    }

    /// Muestras desde una fecha, las más recientes primero.
    func muestras(_ tipo: HKSampleType, desde: Date, limite: Int) async throws -> [HKSample] {
        try await withCheckedThrowingContinuation { c in
            let q = HKSampleQuery(sampleType: tipo,
                                  predicate: HKQuery.predicateForSamples(withStart: desde, end: nil),
                                  limit: limite,
                                  sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]) { _, r, e in
                if let e { c.resume(throwing: e) } else { c.resume(returning: r ?? []) }
            }
            almacen.execute(q)
        }
    }

    /// Valor numérico de una muestra en la unidad de KEPLER.
    static func numero(_ m: HKSample, _ t: Tipo) -> Double? {
        if let q = m as? HKQuantitySample, let u = t.unidad {
            let v = q.quantity.doubleValue(for: u)
            return u == .percent() ? v * 100 : v
        }
        if let c = m as? HKCategorySample {
            if c.categoryType == HKCategoryType(.sleepAnalysis) { return Double(c.value) }
            return m.endDate.timeIntervalSince(m.startDate) / 60
        }
        if #available(iOS 18.0, *), let s = m as? HKStateOfMind { return s.valence }
        return nil
    }

    static func valor(_ m: HKSample, _ t: Tipo) -> String {
        if let c = m as? HKCategorySample, c.categoryType == HKCategoryType(.sleepAnalysis) {
            let h = m.endDate.timeIntervalSince(m.startDate) / 3600
            return String(format: "%@ %.1f h", Salud.faseSueno(c.value), h)
        }
        guard let v = numero(m, t) else { return "?" }
        return String(format: v >= 100 ? "%.0f %@" : "%.1f %@", v, t.unidadTexto)
    }

    static func faseSueno(_ v: Int) -> String {
        switch HKCategoryValueSleepAnalysis(rawValue: v) {
        case .inBed: "en cama"
        case .awake: "despierto"
        case .asleepCore: "ligero"
        case .asleepDeep: "profundo"
        case .asleepREM: "REM"
        default: "dormido"
        }
    }

    // MARK: Importar a KEPLER

    /// El explorador ya dio permiso (desde Base › Salud y reloj).
    static var activa: Bool {
        get { UserDefaults.standard.bool(forKey: "kepler.salud") }
        set { UserDefaults.standard.set(newValue, forKey: "kepler.salud") }
    }

    /// Tipos que el reloj Carbinox ya envía por Bluetooth.
    static let delReloj: Set<String> = ["pasos", "distancia", "energia_activa", "sueno", "pulso", "spo2"]

    /// Días hacia atrás en la primera importación.
    static let diasIniciales = 30

    /// Muestras nuevas de cada tipo desde la última vez (consulta con ancla:
    /// también llegan las que el reloj sincroniza tarde con fecha antigua).
    /// Devuelve cuántas se guardaron para enviar.
    func importar(usuario: String, guardar: ([MuestraBio]) throws -> UInt32) async -> UInt32 {
        var total: UInt32 = 0
        let desde = Calendar.current.date(byAdding: .day, value: -Salud.diasIniciales, to: Date())!
        for t in Salud.tipos {
            let clave = "salud.ancla.\(usuario).\(t.clave)"
            let anterior = UserDefaults.standard.data(forKey: clave)
                .flatMap { try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: $0) }
            guard let (muestras, ancla) = try? await nuevas(t.tipo, ancla: anterior, desde: desde) else { continue }
            // Con el reloj descifrado, lo que Carbinox Max copia en Salud llegaría dos veces
            let bio = muestras
                .filter { !(ClavesReloj.vinculo != nil && Salud.delReloj.contains(t.clave)
                    && $0.sourceRevision.source.name.localizedCaseInsensitiveContains("carbinox")) }
                .compactMap { Salud.bio($0, t) }
            if !bio.isEmpty {
                guard let n = try? guardar(bio) else { continue }
                total += n
            }
            if let ancla, let d = try? NSKeyedArchiver.archivedData(withRootObject: ancla, requiringSecureCoding: true) {
                UserDefaults.standard.set(d, forKey: clave)
            }
        }
        return total
    }

    private func nuevas(_ tipo: HKSampleType, ancla: HKQueryAnchor?, desde: Date) async throws -> ([HKSample], HKQueryAnchor?) {
        try await withCheckedThrowingContinuation { c in
            let q = HKAnchoredObjectQuery(type: tipo, predicate: HKQuery.predicateForSamples(withStart: desde, end: nil),
                                          anchor: ancla, limit: HKObjectQueryNoLimit) { _, nuevas, _, ancla, e in
                if let e { c.resume(throwing: e) } else { c.resume(returning: (nuevas ?? [], ancla)) }
            }
            almacen.execute(q)
        }
    }

    /// Muestra de Salud → muestra de KEPLER (el sueño en horas, con su fase).
    static func bio(_ m: HKSample, _ t: Tipo) -> MuestraBio? {
        guard var valor = numero(m, t) else { return nil }
        var detalle: [String: Any] = [:]
        var unidad = t.unidadTexto
        if let c = m as? HKCategorySample, c.categoryType == HKCategoryType(.sleepAnalysis) {
            valor = m.endDate.timeIntervalSince(m.startDate) / 3600
            unidad = "h"
            detalle["fase"] = faseSueno(c.value)
        }
        if #available(iOS 18.0, *), let s = m as? HKStateOfMind {
            detalle["clase"] = s.kind == .dailyMood ? "dia" : "momento"
            detalle["etiquetas"] = s.labels.map(\.rawValue)
        }
        if let d = m.device?.name ?? m.device?.model { detalle["dispositivo"] = d }
        let json = detalle.isEmpty ? nil : (try? JSONSerialization.data(withJSONObject: detalle)).flatMap {
            String(data: $0, encoding: .utf8)
        }
        return MuestraBio(id: m.uuid.uuidString.lowercased(), tipo: t.clave, valor: valor, unidad: unidad,
                          inicio: m.startDate.timeIntervalSince1970, fin: m.endDate.timeIntervalSince1970,
                          fuente: m.sourceRevision.source.name, detalle: json)
    }

    /// Registra el estado de ánimo del explorador (-1 muy mal … 1 muy bien).
    func registrarAnimo(valencia: Double) async throws {
        guard #available(iOS 18.0, *) else { return }
        let estado = HKStateOfMind(date: Date(), kind: .momentaryEmotion, valence: valencia,
                                   labels: [], associations: [.fitness])
        try await almacen.save(estado)
    }
}
