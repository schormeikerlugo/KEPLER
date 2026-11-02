import AVFoundation
import CoreImage
import CoreML
import OSLog
import UIKit

private let registro = Logger(subsystem: "dev.schormeiker.kepler", category: "camara")

/// Cámara trasera + YOLO en CoreML (Neural Engine). Vision escala el fotograma
/// dentro del cuadrado de 640 (letterbox) y el núcleo Rust interpreta la salida.
/// Sin cámara (simulador) puede usar una foto fija: `KEPLER_DEMO_IMAGEN`.
@MainActor
final class Camara: NSObject, ObservableObject {
    enum Estado: Equatable {
        case apagada
        case encendida
        case sinPermiso
        case sinCamara
        case error(String)
    }

    @Published private(set) var estado: Estado = .apagada
    /// Objetos seguidos entre fotogramas (ids estables, cajas suavizadas, distancia).
    @Published private(set) var rastreadas: [Rastreada] = []
    /// Tamaño del fotograma ya orientado (vertical), para colocar las cajas.
    @Published private(set) var tamanoImagen = CGSize(width: 1080, height: 1920)
    /// Detecciones por segundo reales (medidas cada segundo) y latencia por fotograma.
    @Published private(set) var fps: Double = 0
    @Published private(set) var latenciaMs: Double = 0
    private var cuenta = 0
    private var ventana = Date()
    @Published private(set) var imagenFija: UIImage?
    /// Aumentos que ofrece la cámara (1× y, con teleobjetivo, 3× en el 13 Pro Max).
    @Published private(set) var zoomsDisponibles: [Double] = [1]
    @Published private(set) var zoom: Double = 1
    private var dispositivo: AVCaptureDevice?
    private var baseZoom: CGFloat = 1

    let sesion = AVCaptureSession()
    /// Umbral del detector: las detecciones dudosas (0.25-0.35) solo mantienen
    /// objetos ya seguidos; para aparecer hace falta 0.35 (`Seguidor`).
    nonisolated static let umbral: Float = 0.25
    nonisolated let seguidor = Seguidor()
    /// Focal en píxeles (alto de la imagen vertical) con zoom 1.0 del dispositivo.
    nonisolated(unsafe) private var focalBase: Float = 0
    nonisolated(unsafe) private var dispositivoCaptura: AVCaptureDevice?

    private let cola = DispatchQueue(label: "dev.schormeiker.kepler.camara")
    private let detector = Detector()
    private var configurada = false
    private var demo: Task<Void, Never>?

    /// Último fotograma orientado, para recortar las capturas.
    nonisolated(unsafe) private var ultimo: CIImage?

    func encender() async {
        if let ruta = ProcessInfo.processInfo.environment["KEPLER_DEMO_IMAGEN"], !ruta.isEmpty,
           let img = UIImage(contentsOfFile: ruta) {
            encenderDemo(img)
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else { estado = .sinPermiso; return }
        case .authorized: break
        default:
            estado = .sinPermiso
            return
        }
        if !configurada {
            guard configurar() else { return }
        }
        let s = sesion
        cola.async { s.startRunning() }
        estado = .encendida
    }

    func apagar() {
        demo?.cancel()
        demo = nil
        let s = sesion
        cola.async { if s.isRunning { s.stopRunning() } }
        rastreadas = []
        seguidor.reiniciar()
        if estado == .encendida { estado = .apagada }
    }

    /// JPEG del recorte de una detección (con margen) o del encuadre completo.
    nonisolated func jpeg(de d: Deteccion?, ladoMax: CGFloat = 1024) -> Data? {
        guard let imagen = ultimo else { return nil }
        let e = imagen.extent
        var zona = e
        if let d {
            let margen: CGFloat = 0.08
            let x = CGFloat(d.x) - margen * CGFloat(d.ancho)
            let y = CGFloat(d.y) - margen * CGFloat(d.alto)
            let w = CGFloat(d.ancho) * (1 + 2 * margen)
            let h = CGFloat(d.alto) * (1 + 2 * margen)
            // Core Image tiene el origen abajo a la izquierda
            zona = CGRect(x: e.minX + x * e.width, y: e.minY + (1 - y - h) * e.height,
                          width: w * e.width, height: h * e.height).intersection(e)
        }
        var recorte = imagen.cropped(to: zona)
        let escala = min(1, ladoMax / max(zona.width, zona.height))
        if escala < 1 {
            recorte = recorte.transformed(by: CGAffineTransform(scaleX: escala, y: escala))
        }
        recorte = recorte.transformed(by: CGAffineTransform(translationX: -recorte.extent.minX, y: -recorte.extent.minY))
        return Camara.contexto.jpegRepresentation(of: recorte, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                                                  options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.85])
    }

    nonisolated private static let contexto = CIContext()
    nonisolated(unsafe) static var contador = 0

    /// Cámara virtual con teleobjetivo si la hay (el sistema cambia de lente según
    /// el zoom); si no, la gran angular.
    private func elegirCamara() -> AVCaptureDevice? {
        let tipos: [AVCaptureDevice.DeviceType] = [.builtInTripleCamera, .builtInDualCamera, .builtInWideAngleCamera]
        let candidatas = AVCaptureDevice.DiscoverySession(deviceTypes: tipos, mediaType: .video, position: .back).devices
        for tipo in tipos {
            if let c = candidatas.first(where: { $0.deviceType == tipo }), formato60(c) != nil { return c }
        }
        return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
    }

    /// Zoom del dispositivo para «1×» y los aumentos disponibles (1× y el del teleobjetivo).
    private func niveles(_ c: AVCaptureDevice) -> (base: CGFloat, aumentos: [Double]) {
        let cambios = c.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat($0.doubleValue) }
        let lentes = c.constituentDevices.map(\.deviceType)
        // Con ultra gran angular, el zoom 1.0 del dispositivo es ella (0.5×): «1×» es el primer cambio
        let base = lentes.contains(.builtInUltraWideCamera) ? (cambios.first ?? 1) : 1
        var aumentos: [Double] = [1]
        if lentes.contains(.builtInTelephotoCamera), let tele = cambios.last {
            aumentos.append(Double(tele / base))
        }
        return (base, aumentos)
    }

    func cambiarZoom(_ aumento: Double) {
        guard let c = dispositivo, (try? c.lockForConfiguration()) != nil else { return }
        let destino = min(max(baseZoom * CGFloat(aumento), c.minAvailableVideoZoomFactor), c.maxAvailableVideoZoomFactor)
        c.ramp(toVideoZoomFactor: destino, withRate: 12)
        c.unlockForConfiguration()
        zoom = aumento
    }

    private func configurar() -> Bool {
        guard let camara = elegirCamara(),
              let entrada = try? AVCaptureDeviceInput(device: camara) else {
            estado = .sinCamara
            return false
        }
        sesion.beginConfiguration()
        sesion.sessionPreset = .hd1920x1080
        guard sesion.canAddInput(entrada) else {
            sesion.commitConfiguration()
            estado = .error("no se pudo usar la cámara")
            return false
        }
        sesion.addInput(entrada)
        fijar60fps(camara)
        dispositivo = camara
        dispositivoCaptura = camara
        // El campo de visión del formato es el horizontal del sensor = el vertical en la imagen
        let fov = Float(camara.activeFormat.videoFieldOfView) * .pi / 180
        focalBase = 1920 / 2 / tan(fov / 2)
        (baseZoom, zoomsDisponibles) = niveles(camara)
        if (try? camara.lockForConfiguration()) != nil {
            camara.videoZoomFactor = baseZoom
            camara.unlockForConfiguration()
        }
        registro.notice("Cámara \(camara.deviceType.rawValue): aumentos \(self.zoomsDisponibles)")
        #if DEBUG
        print("TRAZA cámara \(camara.deviceType.rawValue) · aumentos \(zoomsDisponibles) · base \(baseZoom) · formato \(camara.activeFormat)")
        #endif
        let salida = AVCaptureVideoDataOutput()
        salida.alwaysDiscardsLateVideoFrames = true
        salida.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        salida.setSampleBufferDelegate(self, queue: cola)
        if sesion.canAddOutput(salida) { sesion.addOutput(salida) }
        sesion.commitConfiguration()
        configurada = true
        return true
    }

    private func formato60(_ camara: AVCaptureDevice) -> AVCaptureDevice.Format? {
        camara.formats.first { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return d.width == 1920 && d.height == 1080
                && CMFormatDescriptionGetMediaSubType(f.formatDescription) == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
                && f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= 60 }
        }
    }

    /// 1080p a 60 fps (el preset de 1080p trae 30). YOLO vertical tarda ~12 ms: cabe.
    private func fijar60fps(_ camara: AVCaptureDevice) {
        guard let formato = formato60(camara), (try? camara.lockForConfiguration()) != nil else {
            registro.notice("Sin formato 1080p a 60 fps: se queda el del preset")
            return
        }
        camara.activeFormat = formato
        camara.activeVideoMinFrameDuration = CMTime(value: 1, timescale: 60)
        camara.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: 60)
        camara.unlockForConfiguration()
    }

    private func encenderDemo(_ img: UIImage) {
        imagenFija = img
        tamanoImagen = img.size
        estado = .encendida
        guard let cg = img.cgImage else { return }
        let imagen = CIImage(cgImage: cg)
        demo = Task.detached { [weak self, detector] in
            while !Task.isCancelled {
                let inicio = Date()
                let d = detector.detectar(cgImage: cg)
                // Sin datos de la lente: sin distancia
                let r = self?.seguidor.actualizar(detecciones: d, focalPx: 0, altoPx: Float(cg.height)) ?? []
                await self?.publicar(r, imagen: imagen, tamano: CGSize(width: cg.width, height: cg.height), desde: inicio)
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
    }

    nonisolated private func publicar(_ d: [Rastreada], imagen: CIImage, tamano: CGSize, desde: Date,
                                      deteccion: TimeInterval? = nil) async {
        ultimo = imagen
        // Latencia = lo que tarda la detección (sin la espera al hilo principal)
        let t = deteccion ?? Date().timeIntervalSince(desde)
        await MainActor.run {
            self.rastreadas = d
            self.tamanoImagen = tamano
            self.latenciaMs = self.latenciaMs * 0.9 + t * 1000 * 0.1
            self.cuenta += 1
            let pasado = Date().timeIntervalSince(self.ventana)
            if pasado >= 1 {
                self.fps = Double(self.cuenta) / pasado
                #if DEBUG
                if ProcessInfo.processInfo.environment["KEPLER_TRAZA"] == "1" {
                    let lente = self.dispositivo?.activePrimaryConstituent?.deviceType.rawValue
                        .replacingOccurrences(of: "AVCaptureDeviceTypeBuiltIn", with: "") ?? "-"
                    print(String(format: "TRAZA %.1f fps · %.1f ms · %d obj · %.0f× · %@", self.fps, self.latenciaMs,
                                 d.count, self.zoom, lente))
                    for r in d.prefix(3) {
                        print(String(format: "TRAZA   #%llu %@ %.2f edad %u · %@", r.id, r.deteccion.clase, r.deteccion.confianza,
                                     r.edad, r.distanciaM.map { String(format: "%.1f m", $0) } ?? "sin distancia"))
                    }
                }
                #endif
                self.cuenta = 0
                self.ventana = Date()
            }
        }
    }
}

extension Camara: AVCaptureVideoDataOutputSampleBufferDelegate {
    nonisolated func captureOutput(_ output: AVCaptureOutput, didOutput muestra: CMSampleBuffer,
                                   from connection: AVCaptureConnection) {
        guard let buffer = CMSampleBufferGetImageBuffer(muestra) else { return }
        let inicio = Date()
        // Teléfono en vertical: el sensor entrega apaisado, girado 90° a la derecha
        let (w, h) = (CVPixelBufferGetWidth(buffer), CVPixelBufferGetHeight(buffer))
        let detectadas = detector.detectar(buffer: buffer)
        let zoom = Float(dispositivoCaptura?.videoZoomFactor ?? 1)
        let d = seguidor.actualizar(detecciones: detectadas, focalPx: focalBase * zoom, altoPx: Float(w))
        let duracion = Date().timeIntervalSince(inicio)
        #if DEBUG
        if ProcessInfo.processInfo.environment["KEPLER_COMPARAR"] == "1" {
            Camara.contador += 1
            if Camara.contador % 60 == 0 { Banco.compararConCuadrado(buffer, vertical: detectadas) }
        }
        #endif
        // Retiene solo el último búfer (el que se recortaría al capturar)
        let imagen = CIImage(cvPixelBuffer: buffer).oriented(.right)
        Task { await publicar(d, imagen: imagen, tamano: CGSize(width: h, height: w), desde: inicio, deteccion: duracion) }
    }
}

/// YOLO26s en CoreML, sin Vision: letterbox propio con vImage y el modelo en
/// el Neural Engine. Entrada vertical 576×1024 (la cámara la llena sin bandas:
/// los objetos llegan 1.6× más grandes que con 640×640).
final class Detector: @unchecked Sendable {
    private let modelo: MLModel?
    private let salida: String
    private let letterbox: Letterbox

    init(vertical: Bool = true) {
        let config = MLModelConfiguration()
        config.computeUnits = .all
        var m: MLModel?
        do {
            m = vertical ? try yolo26s_vertical(configuration: config).model : try yolo26s(configuration: config).model
        } catch {
            registro.error("No se pudo cargar YOLO: \(error.localizedDescription)")
        }
        modelo = m
        salida = m?.modelDescription.outputDescriptionsByName.keys.first ?? ""
        let entrada = m?.modelDescription.inputDescriptionsByName["image"]?.imageConstraint
        letterbox = Letterbox(ancho: entrada?.pixelsWide ?? 576, alto: entrada?.pixelsHigh ?? 1024)
    }

    /// Fotograma del sensor (apaisado); `girar`: teléfono en vertical.
    func detectar(buffer: CVPixelBuffer, girar: Bool = true) -> [Deteccion] {
        guard let modelo else { return [] }
        let (ancho, alto) = letterbox.preparar(buffer, girar: girar)
        guard let r = try? modelo.prediction(from: MLDictionaryFeatureProvider(
            dictionary: ["image": MLFeatureValue(pixelBuffer: letterbox.salida)])),
              let matriz = r.featureValue(for: salida)?.multiArrayValue else { return [] }
        let n = matriz.count
        var valores = [Float](repeating: 0, count: n)
        switch matriz.dataType {
        case .float32:
            matriz.withUnsafeBufferPointer(ofType: Float.self) { p in
                for i in 0..<n { valores[i] = p[i] }
            }
        case .float16:
            matriz.withUnsafeBufferPointer(ofType: Float16.self) { p in
                for i in 0..<n { valores[i] = Float(p[i]) }
            }
        default:
            for i in 0..<n { valores[i] = matriz[i].floatValue }
        }
        return interpretarYolo(salida: valores, ancho: UInt32(ancho), alto: UInt32(alto),
                               entradaAncho: UInt32(letterbox.ancho), entradaAlto: UInt32(letterbox.alto),
                               umbral: Camara.umbral)
    }

    /// Foto fija (simulador): se pasa a un búfer BGRA y se detecta sin girar.
    func detectar(cgImage: CGImage) -> [Deteccion] {
        var b: CVPixelBuffer?
        CVPixelBufferCreate(nil, cgImage.width, cgImage.height, kCVPixelFormatType_32BGRA,
                            [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &b)
        guard let buffer = b else { return [] }
        CVPixelBufferLockBaseAddress(buffer, [])
        CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: cgImage.width, height: cgImage.height,
                  bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
                  space: CGColorSpaceCreateDeviceRGB(),
                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)?
            .draw(cgImage, in: CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height))
        CVPixelBufferUnlockBaseAddress(buffer, [])
        return detectar(buffer: buffer, girar: false)
    }
}
