import CoreMotion
import Foundation

/// Sensores del propio iPhone: barómetro (presión y altitud) y podómetro.
@MainActor
final class Sensores: ObservableObject {
    struct Altitud: Equatable {
        /// Presión en hPa.
        var presion: Double?
        /// Cambio de altitud desde que empezó la lectura, en metros.
        var relativa: Double?
        /// Altitud sobre el nivel del mar (GPS + barómetro), en metros.
        var absoluta: Double?
        var precision: Double?
    }

    struct Pasos: Equatable {
        var pasos: Int
        var distancia: Double?
        var pisosSubidos: Int?
        var pisosBajados: Int?
    }

    @Published private(set) var altitud = Altitud()
    @Published private(set) var hoy: Pasos?
    @Published private(set) var error: String?

    private let altimetro = CMAltimeter()
    private let podometro = CMPedometer()
    private(set) var activos = false

    static var hayBarometro: Bool { CMAltimeter.isRelativeAltitudeAvailable() }

    func empezar() {
        guard !activos else { return }
        activos = true
        if CMAltimeter.isRelativeAltitudeAvailable() {
            altimetro.startRelativeAltitudeUpdates(to: .main) { [weak self] d, e in
                guard let d else { self?.error = e?.localizedDescription; return }
                self?.altitud.presion = d.pressure.doubleValue * 10 // kPa → hPa
                self?.altitud.relativa = d.relativeAltitude.doubleValue
            }
        }
        if CMAltimeter.isAbsoluteAltitudeAvailable() {
            altimetro.startAbsoluteAltitudeUpdates(to: .main) { [weak self] d, _ in
                guard let d else { return }
                self?.altitud.absoluta = d.altitude
                self?.altitud.precision = d.accuracy
            }
        }
        if CMPedometer.isStepCountingAvailable() {
            let inicio = Calendar.current.startOfDay(for: Date())
            podometro.startUpdates(from: inicio) { [weak self] d, e in
                Task { @MainActor in
                    guard let d else { self?.error = e?.localizedDescription; return }
                    self?.hoy = Pasos(pasos: d.numberOfSteps.intValue, distancia: d.distance?.doubleValue,
                                      pisosSubidos: d.floorsAscended?.intValue, pisosBajados: d.floorsDescended?.intValue)
                }
            }
        }
    }

    func parar() {
        guard activos else { return }
        activos = false
        altimetro.stopRelativeAltitudeUpdates()
        altimetro.stopAbsoluteAltitudeUpdates()
        podometro.stopUpdates()
    }
}
