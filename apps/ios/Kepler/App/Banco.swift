#if DEBUG
import CoreML
import CoreVideo
import Foundation
import UIKit
import Vision

/// Banco de pruebas de YOLO en el dispositivo (`KEPLER_BANCO=1`): mide la
/// latencia por fotograma con cada combinación de unidades de cómputo y
/// resolución de cámara, la imprime por consola y cierra la app.
enum Banco {
    static func ejecutarSiToca() {
        guard ProcessInfo.processInfo.environment["KEPLER_BANCO"] == "1" else { return }
        if let ruta = ProcessInfo.processInfo.environment["KEPLER_DEMO_IMAGEN"], !ruta.isEmpty {
            comprobarGiro(ruta)
        }
        let unidades: [(String, MLComputeUnits)] = [("all", .all), ("cpu+ane", .cpuAndNeuralEngine)]
        let tamanos = [(1080, 1920), (720, 1280)]
        for (nombre, u) in unidades {
            let config = MLModelConfiguration()
            config.computeUnits = u
            guard let ml = try? yolo26s(configuration: config).model, let vn = try? VNCoreMLModel(for: ml) else {
                print("BANCO \(nombre): no carga")
                continue
            }
            for (w, h) in tamanos {
                // Búfer apaisado, como lo entrega el sensor
                var b: CVPixelBuffer?
                CVPixelBufferCreate(nil, h, w, kCVPixelFormatType_32BGRA,
                                    [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &b)
                guard let buffer = b else { continue }
                let peticion = VNCoreMLRequest(model: vn)
                peticion.imageCropAndScaleOption = .scaleFit
                var tiempos: [Double] = []
                for i in 0..<120 {
                    let t = DispatchTime.now().uptimeNanoseconds
                    try? VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .right).perform([peticion])
                    if i >= 20 { tiempos.append(Double(DispatchTime.now().uptimeNanoseconds - t) / 1e6) }
                }
                tiempos.sort()
                let p50 = tiempos[tiempos.count / 2], p90 = tiempos[tiempos.count * 9 / 10]
                print(String(format: "BANCO %@ %dx%d: p50 %.1f ms · p90 %.1f ms", nombre, w, h, p50, p90))
            }
            // Letterbox propio (vImage) + modelo, desde el fotograma apaisado de 1080p
            for (w, h) in tamanos {
                var b: CVPixelBuffer?
                CVPixelBufferCreate(nil, h, w, kCVPixelFormatType_32BGRA,
                                    [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &b)
                let lb = Letterbox()
                var tl: [Double] = [], tt: [Double] = []
                for i in 0..<120 {
                    let t = DispatchTime.now().uptimeNanoseconds
                    lb.preparar(b!, girar: true)
                    let t2 = DispatchTime.now().uptimeNanoseconds
                    _ = try? ml.prediction(from: MLDictionaryFeatureProvider(dictionary: ["image": MLFeatureValue(pixelBuffer: lb.salida)]))
                    if i >= 20 {
                        tl.append(Double(t2 - t) / 1e6)
                        tt.append(Double(DispatchTime.now().uptimeNanoseconds - t) / 1e6)
                    }
                }
                tl.sort(); tt.sort()
                print(String(format: "BANCO %@ letterbox %dx%d: letterbox p50 %.1f ms · total p50 %.1f ms · p90 %.1f ms", nombre, w, h,
                             tl[tl.count / 2], tt[tt.count / 2], tt[tt.count * 9 / 10]))
            }
            // Solo el modelo, sin Vision: entrada 640×640 ya escalada
            if let entrada = try? MLDictionaryFeatureProvider(dictionary: ["image": MLFeatureValue(pixelBuffer: cuadrado())]) {
                var tiempos: [Double] = []
                for i in 0..<120 {
                    let t = DispatchTime.now().uptimeNanoseconds
                    _ = try? ml.prediction(from: entrada)
                    if i >= 20 { tiempos.append(Double(DispatchTime.now().uptimeNanoseconds - t) / 1e6) }
                }
                tiempos.sort()
                print(String(format: "BANCO %@ solo modelo: p50 %.1f ms · p90 %.1f ms", nombre,
                             tiempos[tiempos.count / 2], tiempos[tiempos.count * 9 / 10]))
            }
        }
        print("BANCO fin")
        exit(0)
    }

    /// La foto girada como la entregaría el sensor → Letterbox + modelo debe dar
    /// las mismas cajas que Vision sobre la foto derecha.
    private static func comprobarGiro(_ ruta: String) {
        guard let img = UIImage(contentsOfFile: ruta)?.cgImage,
              let ml = try? yolo26s(configuration: MLModelConfiguration()).model else { return }
        let (w, h) = (img.width, img.height)
        var b: CVPixelBuffer?
        CVPixelBufferCreate(nil, h, w, kCVPixelFormatType_32BGRA,
                            [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &b)
        guard let apaisado = b else { return }
        CVPixelBufferLockBaseAddress(apaisado, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(apaisado), width: h, height: w, bitsPerComponent: 8,
                            bytesPerRow: CVPixelBufferGetBytesPerRow(apaisado), space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
        // Girar 90° a la izquierda (lo que hay que deshacer girando a la derecha)
        ctx.translateBy(x: 0, y: CGFloat(w))
        ctx.rotate(by: -.pi / 2)
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
        CVPixelBufferUnlockBaseAddress(apaisado, [])
        let lb = Letterbox()
        let (ow, oh) = lb.preparar(apaisado, girar: true)
        let r = try? ml.prediction(from: MLDictionaryFeatureProvider(dictionary: ["image": MLFeatureValue(pixelBuffer: lb.salida)]))
        let m = r?.featureValue(for: r!.featureNames.first!)?.multiArrayValue
        let vals = (0..<(m?.count ?? 0)).map { m![$0].floatValue }
        for d in interpretarYolo(salida: vals, ancho: UInt32(ow), alto: UInt32(oh), umbral: 0.35).prefix(4) {
            print(String(format: "BANCO giro %@ %.2f x%.2f y%.2f w%.2f h%.2f", d.clase, d.confianza, d.x, d.y, d.ancho, d.alto))
        }
        for d in Detector().detectar(cgImage: img).prefix(4) {
            print(String(format: "BANCO vision %@ %.2f x%.2f y%.2f w%.2f h%.2f", d.clase, d.confianza, d.x, d.y, d.ancho, d.alto))
        }
    }

    private static func cuadrado() -> CVPixelBuffer {
        var b: CVPixelBuffer?
        CVPixelBufferCreate(nil, 640, 640, kCVPixelFormatType_32BGRA,
                            [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &b)
        return b!
    }
}
#endif
