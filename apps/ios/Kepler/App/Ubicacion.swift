import CoreLocation

/// Ubicación puntual para el panel (clima, aire, Cortex). Pide permiso «al usar
/// la app» la primera vez; sin permiso devuelve `nil` y el núcleo la aproxima por IP.
@MainActor
final class Ubicacion: NSObject, CLLocationManagerDelegate {
    private let gestor = CLLocationManager()
    private var esperando: [CheckedContinuation<CLLocationCoordinate2D?, Never>] = []
    private var permiso: CheckedContinuation<Void, Never>?
    private var ultima: (CLLocation, Date)?

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
        }
    }

    nonisolated func locationManager(_ gestor: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in responder(nil) }
    }
}
