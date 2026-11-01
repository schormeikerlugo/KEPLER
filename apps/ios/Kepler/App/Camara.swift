import AVFoundation
import CoreImage
import CoreML
import OSLog
import UIKit
import Vision

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
    @Published private(set) var detecciones: [Deteccion] = []
    /// Tamaño del fotograma ya orientado (vertical), para colocar las cajas.
    @Published private(set) var tamanoImagen = CGSize(width: 1080, height: 1920)
    @Published private(set) var fps: Double = 0
    @Published private(set) var imagenFija: UIImage?

    let sesion = AVCaptureSession()
    nonisolated static let umbral: Float = 0.35

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
        detecciones = []
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

    private func configurar() -> Bool {
        guard let camara = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
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
        let salida = AVCaptureVideoDataOutput()
        salida.alwaysDiscardsLateVideoFrames = true
        salida.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        salida.setSampleBufferDelegate(self, queue: cola)
        if sesion.canAddOutput(salida) { sesion.addOutput(salida) }
        sesion.commitConfiguration()
        configurada = true
        return true
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
                let d = detector.detectar(cgImage: cg, ancho: UInt32(cg.width), alto: UInt32(cg.height))
                await self?.publicar(d, imagen: imagen, tamano: CGSize(width: cg.width, height: cg.height), desde: inicio)
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
    }

    nonisolated private func publicar(_ d: [Deteccion], imagen: CIImage, tamano: CGSize, desde: Date) async {
        ultimo = imagen
        let t = Date().timeIntervalSince(desde)
        await MainActor.run {
            self.detecciones = d
            self.tamanoImagen = tamano
            self.fps = self.fps * 0.8 + (t > 0 ? 1 / t : 0) * 0.2
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
        let d = detector.detectar(buffer: buffer, ancho: UInt32(h), alto: UInt32(w))
        // Retiene solo el último búfer (el que se recortaría al capturar)
        let imagen = CIImage(cvPixelBuffer: buffer).oriented(.right)
        Task { await publicar(d, imagen: imagen, tamano: CGSize(width: h, height: w), desde: inicio) }
    }
}

/// YOLO26s en CoreML.
final class Detector: @unchecked Sendable {
    private let modelo: VNCoreMLModel?

    init() {
        let config = MLModelConfiguration()
        config.computeUnits = .all
        do {
            modelo = try VNCoreMLModel(for: yolo26s(configuration: config).model)
        } catch {
            registro.error("No se pudo cargar YOLO: \(error.localizedDescription)")
            modelo = nil
        }
    }

    func detectar(buffer: CVPixelBuffer, ancho: UInt32, alto: UInt32) -> [Deteccion] {
        ejecutar(VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .right), ancho: ancho, alto: alto)
    }

    func detectar(cgImage: CGImage, ancho: UInt32, alto: UInt32) -> [Deteccion] {
        ejecutar(VNImageRequestHandler(cgImage: cgImage, orientation: .up), ancho: ancho, alto: alto)
    }

    private func ejecutar(_ handler: VNImageRequestHandler, ancho: UInt32, alto: UInt32) -> [Deteccion] {
        guard let modelo else { return [] }
        let peticion = VNCoreMLRequest(model: modelo)
        peticion.imageCropAndScaleOption = .scaleFit
        do {
            try handler.perform([peticion])
        } catch {
            return []
        }
        guard let obs = peticion.results?.first as? VNCoreMLFeatureValueObservation,
              let matriz = obs.featureValue.multiArrayValue else { return [] }
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
        return interpretarYolo(salida: valores, ancho: ancho, alto: alto, umbral: Camara.umbral)
    }
}
