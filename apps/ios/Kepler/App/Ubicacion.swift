import CoreLocation

/// Ubicación puntual para el panel (clima, aire, Cortex) y seguimiento continuo
/// del rastro durante una misión, también en segundo plano (indicador azul de
/// iOS). Pide permiso «al usar la app»; sin permiso el núcleo aproxima por IP.
@MainActor
final class Ubicacion: NSObject, CLLocationManagerDelegate {
    private let gestor = CLLocationManager()
    private var esperando: [CheckedContinuation<CLLocationCoordinate2D?, Never>] = []
    private var permiso: CheckedContinuation<Void, Never>?
    private var ultima: (CLLocation, Date)?
    private var alPunto: ((CLLocation) -> Void)?

    /// Rastro de misión: cada posición nueva (≥ 5 m) hasta `dejarDeSeguir`.
    func seguir(_ f: @escaping (CLLocation) -> Void) {
        alPunto = f
        if gestor.authorizationStatus == .notDetermined { gestor.requestWhenInUseAuthorization() }
        gestor.desiredAccuracy = kCLLocationAccuracyBest
        gestor.distanceFilter = 5
        gestor.activityType = .fitness
        gestor.pausesLocationUpdatesAutomatically = false
        gestor.allowsBackgroundLocationUpdates = true
        gestor.showsBackgroundLocationIndicator = true
        gestor.startUpdatingLocation()
    }

    func dejarDeSeguir() {
        guard alPunto != nil else { return }
        alPunto = nil
        gestor.stopUpdatingLocation()
        gestor.allowsBackgroundLocationUpdates = false
        gestor.desiredAccuracy = kCLLocationAccuracyHundredMeters
        gestor.distanceFilter = kCLDistanceFilterNone
    }

    override init() {
        super.init()
        gestor.delegate = self
        gestor.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    /// Posición reciente (≤ 5 min) o una nueva; `nil` sin permiso o si tarda más de 10 s.
    func actual() async -> CLLocationCoordinate2D? {
        if gestor.authorizationStatus == .notDetermined {
            await withCheckedContinuation { c in
                permiso = c
                gestor.requestWhenInUseAuthorization()
            }
        }
        guard [.authorizedWhenInUse, .authorizedAlways].contains(gestor.authorizationStatus) else { return nil }
        if let (l, en) = ultima, Date().timeIntervalSince(en) < 300 { return l.coordinate }
        return await withCheckedContinuation { c in
            esperando.append(c)
            if esperando.count == 1 {
                gestor.requestLocation()
                Task {
                    try? await Task.sleep(for: .seconds(10))
                    self.responder(nil)
                }
            }
        }
    }

    private func responder(_ c: CLLocationCoordinate2D?) {
        let lista = esperando
        esperando.removeAll()
        lista.forEach { $0.resume(returning: c) }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ gestor: CLLocationManager) {
        Task { @MainActor in
            guard gestor.authorizationStatus != .notDetermined else { return }
            permiso?.resume()
            permiso = nil
        }
    }

    nonisolated func locationManager(_ gestor: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let l = locations.last else { return }
        Task { @MainActor in
            ultima = (l, Date())
            responder(l.coordinate)
            if let alPunto { locations.forEach(alPunto) }
        }
    }

    nonisolated func locationManager(_ gestor: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in responder(nil) }
    }
}
