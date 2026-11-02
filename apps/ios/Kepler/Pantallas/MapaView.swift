import MapLibre
import SwiftUI

/// Mapa offline: MapLibre con el estilo Odradek sobre el PMTiles descargado,
/// los elementos de KEPLER (POIs, alertas, hallazgos, rutas), el rastro de la
/// misión en curso y la posición del explorador.
struct MapaView: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var estilo: String?
    @State private var regiones: [RegionMapa] = []
    @State private var progreso: Double?
    @State private var error: String?
    @State private var elementos = "{\"type\":\"FeatureCollection\",\"features\":[]}"
    @State private var rastro = "{\"type\":\"FeatureCollection\",\"features\":[]}"
    @State private var capas: Set<String> = ["poi", "persona", "objeto", "alerta", "ruta"]
    @State private var seleccion: [String: String]?
    @State private var centrar = 0

    var body: some View {
        ZStack {
            FondoKepler()
            if let estilo {
                MapaLibre(estilo: estilo, elementos: filtrarElementos(geojson: elementos, tipos: Array(capas)),
                          rastro: rastro, centrar: centrar) { seleccion = $0 }
                    .ignoresSafeArea(edges: .top)
                VStack {
                    HStack(alignment: .top) {
                        SelectorCapas(capas: $capas)
                        Spacer()
                        VStack(spacing: Tema.Espacio.sm) {
                            IndicadorSync()
                            Button { centrar += 1 } label: {
                                Image(systemName: "location.fill")
                                    .foregroundStyle(Tema.Color.acento)
                                    .frame(width: 44, height: 44)
                                    .background(.black.opacity(0.7), in: Circle())
                                    .overlay(Circle().stroke(Tema.Color.bordeHolo, lineWidth: 1))
                            }
                        }
                    }
                    Spacer()
                    if let m = sesion.mision {
                        Pastilla(texto: "\(m.titulo) · \(Medida.km(m.distanciaM)) · \(m.puntos) puntos", tono: Tema.Color.exito)
                            .background(.black.opacity(0.7), in: Capsule())
                            .padding(.bottom, Tema.Espacio.md)
                    }
                }
                .padding(Tema.Espacio.md)
            } else {
                descarga
            }
        }
        .task { await preparar() }
        // Elementos cada minuto y rastro cada 5 s (se ve crecer mientras se camina)
        .task(id: estilo) {
            guard estilo != nil else { return }
            var ciclo = 0
            while !Task.isCancelled {
                if ciclo % 12 == 0, let e = try? await sesion.nucleo.elementosMapa() { elementos = e }
                if let r = try? sesion.nucleo.rastroMision() { rastro = r }
                ciclo += 1
                try? await Task.sleep(for: .seconds(5))
            }
        }
        .sheet(isPresented: Binding(get: { seleccion != nil }, set: { if !$0 { seleccion = nil } })) {
            if let s = seleccion { FichaMapa(propiedades: s).presentationDetents([.medium]) }
        }
    }

    private var descarga: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tema.Espacio.lg) {
                Titulo(texto: "Mapa offline").padding(.top, Tema.Espacio.xl)
                Text("El mapa se guarda en el iPhone para usarlo sin cobertura. Descárgalo con Wi-Fi, en la red de la base.")
                    .font(Jura.fuente(Tema.Tamano.cuerpo))
                    .foregroundStyle(Tema.Color.textoSecundario)
                if regiones.isEmpty && error == nil { ProgressView().frame(maxWidth: .infinity) }
                ForEach(regiones, id: \.id) { r in
                    Tarjeta {
                        VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                            HStack {
                                Text(r.id.capitalized)
                                    .font(Jura.fuente(Tema.Tamano.tituloTarjeta, .semibold))
                                    .foregroundStyle(Tema.Color.texto)
                                Spacer()
                                Etiqueta(texto: String(format: "%.0f MB", r.tamanoMb))
                            }
                            if let progreso {
                                ProgressView(value: progreso).tint(Tema.Color.acento)
                                Etiqueta(texto: String(format: "%.0f de %.0f MB · se reanuda si se corta",
                                                       progreso * r.tamanoMb, r.tamanoMb))
                            } else {
                                Button("DESCARGAR") { Task { await descargar(r.id) } }
                                    .buttonStyle(BotonKepler())
                            }
                        }
                    }
                }
                if let error {
                    Text(error).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.peligro)
                    Button("REINTENTAR") { Task { await preparar() } }.buttonStyle(BotonKepler(principal: false))
                }
            }
            .padding(.horizontal, Tema.Espacio.lg)
        }
    }

    private func preparar() async {
        error = nil
        if let e = sesion.nucleo.estiloMapa() {
            estilo = e
            return
        }
        do {
            regiones = try await sesion.nucleo.regionesMapa()
            if regiones.isEmpty { error = "El servidor no tiene mapas offline." }
            #if DEBUG
            if ProcessInfo.processInfo.environment["KEPLER_DEMO_SECCION"] == "mapa-descargar", let r = regiones.first {
                await descargar(r.id)
            }
            #endif
        } catch {
            self.error = Sesion.mensaje(error)
        }
    }

    private func descargar(_ region: String) async {
        progreso = 0
        error = nil
        let aviso = AvisoProgreso { hecho, total in
            Task { @MainActor in progreso = total > 0 ? Double(hecho) / Double(total) : 0 }
        }
        do {
            estilo = try await sesion.nucleo.descargarMapa(region: region, progreso: aviso)
        } catch {
            self.error = Sesion.mensaje(error)
        }
        progreso = nil
    }
}

/// Puente del avance de la descarga (lo llama Rust desde su hilo).
final class AvisoProgreso: ProgresoDescarga, @unchecked Sendable {
    private let f: (UInt64, UInt64) -> Void
    private var ultimo: UInt64 = 0

    init(_ f: @escaping (UInt64, UInt64) -> Void) { self.f = f }

    func avance(hecho: UInt64, total: UInt64) {
        // ~200 avisos en toda la descarga
        guard hecho - ultimo >= max(total / 200, 1) || hecho == total else { return }
        ultimo = hecho
        f(hecho, total)
    }
}

private struct SelectorCapas: View {
    @Binding var capas: Set<String>
    private let opciones: [(String, String, Color)] = [
        ("poi", "POIs", Tema.Color.aviso), ("alerta", "Alertas", Tema.Color.peligro),
        ("persona", "Personas", Tema.Color.acento), ("objeto", "Objetos", Tema.Color.exito),
        ("ruta", "Rutas", Tema.Color.textoSecundario),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(opciones, id: \.0) { id, texto, tono in
                let activa = capas.contains(id)
                Button {
                    if activa { capas.remove(id) } else { capas.insert(id) }
                } label: {
                    HStack(spacing: 6) {
                        Circle().fill(activa ? tono : .clear).frame(width: 7, height: 7)
                            .overlay(Circle().stroke(tono, lineWidth: 1))
                        Text(texto.uppercased())
                            .font(Jura.fuente(Tema.Tamano.etiqueta, .semibold))
                            .tracking(1)
                            .foregroundStyle(activa ? Tema.Color.texto : Tema.Color.textoTenue)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.black.opacity(0.7), in: Capsule())
                }
            }
        }
    }
}

/// MLNMapView con las fuentes GeoJSON `kepler` y `rastro` del estilo de KEPLER.
private struct MapaLibre: UIViewRepresentable {
    let estilo: String
    let elementos: String
    let rastro: String
    let centrar: Int
    let alTocar: ([String: String]) -> Void

    func makeCoordinator() -> Coordinador { Coordinador(alTocar: alTocar) }

    func makeUIView(context: Context) -> MLNMapView {
        let mapa = MLNMapView(frame: .zero, styleURL: URL(fileURLWithPath: estilo))
        mapa.delegate = context.coordinator
        mapa.backgroundColor = .black
        mapa.showsUserLocation = true
        mapa.compassViewPosition = .bottomRight
        mapa.logoViewPosition = .bottomLeft
        mapa.attributionButtonPosition = .bottomLeft
        mapa.minimumZoomLevel = 3
        // Caracas hasta tener la posición del GPS
        mapa.setCenter(CLLocationCoordinate2D(latitude: 10.49, longitude: -66.88), zoomLevel: 12, animated: false)
        mapa.addGestureRecognizer(UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinador.tocar(_:))))
        context.coordinator.mapa = mapa
        return mapa
    }

    func updateUIView(_ mapa: MLNMapView, context: Context) {
        let c = context.coordinator
        c.alTocar = alTocar
        c.poner("kepler", elementos)
        c.poner("rastro", rastro)
        if c.centrado != centrar {
            c.centrado = centrar
            if let u = mapa.userLocation?.location {
                mapa.setCenter(u.coordinate, zoomLevel: max(mapa.zoomLevel, 15), animated: true)
            }
        }
    }

    final class Coordinador: NSObject, MLNMapViewDelegate {
        var alTocar: ([String: String]) -> Void
        weak var mapa: MLNMapView?
        var centrado = 0
        private var listo = false
        private var pendientes: [String: String] = [:]
        private var aplicados: [String: String] = [:]
        private var primeraPosicion = true

        init(alTocar: @escaping ([String: String]) -> Void) { self.alTocar = alTocar }

        func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
            listo = true
            for (fuente, geojson) in pendientes { poner(fuente, geojson) }
            pendientes.removeAll()
        }

        func mapView(_ mapView: MLNMapView, didUpdate userLocation: MLNUserLocation?) {
            guard primeraPosicion, let c = userLocation?.location?.coordinate else { return }
            primeraPosicion = false
            mapView.setCenter(c, zoomLevel: 15, animated: true)
        }

        /// GeoJSON a una fuente del estilo (cuando esté cargado; solo si cambió).
        func poner(_ fuente: String, _ geojson: String) {
            guard listo, let estilo = mapa?.style else {
                pendientes[fuente] = geojson
                return
            }
            guard aplicados[fuente] != geojson,
                  let s = estilo.source(withIdentifier: fuente) as? MLNShapeSource,
                  let datos = geojson.data(using: .utf8),
                  let forma = try? MLNShape(data: datos, encoding: String.Encoding.utf8.rawValue) else { return }
            s.shape = forma
            aplicados[fuente] = geojson
        }

        @objc func tocar(_ g: UITapGestureRecognizer) {
            guard let mapa else { return }
            let p = g.location(in: mapa)
            let zona = CGRect(x: p.x - 18, y: p.y - 18, width: 36, height: 36)
            guard let f = mapa.visibleFeatures(in: zona, styleLayerIdentifiers: ["kepler-puntos", "kepler-halo", "kepler-rutas"]).first
            else { return }
            var propiedades: [String: String] = [:]
            for (k, v) in f.attributes {
                if let s = v as? String { propiedades[k] = s } else if let n = v as? NSNumber { propiedades[k] = n.stringValue }
            }
            alTocar(propiedades)
        }
    }
}

/// Ficha de un elemento tocado en el mapa.
private struct FichaMapa: View {
    let propiedades: [String: String]

    var body: some View {
        let tipo = propiedades["tipo"] ?? ""
        let nivel = propiedades["nivel"] ?? ""
        ZStack {
            FondoKepler()
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                HStack(alignment: .top, spacing: Tema.Espacio.md) {
                    if let ruta = propiedades["imagen_path"] {
                        ImagenRemota(ruta: ruta, lado: 120)
                            .frame(width: 96, height: 96)
                            .clipShape(RoundedRectangle(cornerRadius: Tema.Radio.medio))
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Etiqueta(texto: nombreTipo(tipo), color: Tema.Color.acento)
                        Titulo(texto: propiedades["nombre"] ?? "—")
                        if !nivel.isEmpty { Pastilla(texto: Tono.texto(nivel), tono: Tono.de(nivel)) }
                    }
                }
                if let autor = propiedades["autor"], propiedades["propio"] != "1" {
                    Text("Reportado por @\(autor)")
                        .font(Jura.fuente(Tema.Tamano.cuerpo))
                        .foregroundStyle(Tema.Color.textoSecundario)
                }
                if let km = propiedades["distancia_km"] {
                    Etiqueta(texto: "\(km) km")
                }
                if let fecha = propiedades["capturado_en"] {
                    Etiqueta(texto: String(fecha.prefix(16)).replacingOccurrences(of: "T", with: " · "))
                }
                Spacer()
            }
            .padding(Tema.Espacio.xl)
        }
    }

    private func nombreTipo(_ t: String) -> String {
        switch t {
        case "poi": "Punto de interés"
        case "alerta": "Alerta de otro explorador"
        case "persona": "Persona"
        case "objeto": "Objeto"
        case "ruta": "Ruta"
        default: t
        }
    }
}
