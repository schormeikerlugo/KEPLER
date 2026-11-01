#if DEBUG
import CoreML
import CoreVideo
import Foundation
import UIKit

/// Banco de pruebas de YOLO en el dispositivo (`KEPLER_BANCO=1`): mide la
/// latencia por fotograma con cada combinación de unidades de cómputo y
/// resolución de cámara, la imprime por consola y cierra la app.
enum Banco {
    static func ejecutarSiToca() {
        guard ProcessInfo.processInfo.environment["KEPLER_BANCO"] == "1" else { return }
        // Fotograma apaisado de 1080p, como lo entrega el sensor
        var b: CVPixelBuffer?
        CVPixelBufferCreate(nil, 1920, 1080, kCVPixelFormatType_32BGRA,
                            [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &b)
        guard let buffer = b else { return }
        for (nombre, vertical) in [("cuadrado 640×640", false), ("vertical 576×1024", true)] {
            let d = Detector(vertical: vertical)
            var t: [Double] = []
            for i in 0..<150 {
                let inicio = DispatchTime.now().uptimeNanoseconds
                _ = d.detectar(buffer: buffer)
                if i >= 30 { t.append(Double(DispatchTime.now().uptimeNanoseconds - inicio) / 1e6) }
            }
            t.sort()
            print(String(format: "BANCO %@: p50 %.1f ms · p90 %.1f ms · máx %.1f ms", nombre,
                         t[t.count / 2], t[t.count * 9 / 10], t.last ?? 0))
        }
        print("BANCO fin")
        exit(0)
    }

    nonisolated(unsafe) private static var cuadrado640: Detector?

    /// Mismo fotograma real con el modelo cuadrado 640×640 de antes y el vertical:
    /// cuántas detecciones y con qué confianza (a distancia gana el vertical).
    static func compararConCuadrado(_ buffer: CVPixelBuffer, vertical: [Deteccion]) {
        if cuadrado640 == nil { cuadrado640 = Detector(vertical: false) }
        guard let c = cuadrado640 else { return }
        let antes = c.detectar(buffer: buffer)
        let f = { (d: Deteccion) in String(format: "%@ %.2f (%.0f×%.0f px)", d.clase, d.confianza, d.ancho * 1080, d.alto * 1920) }
        print("COMPARA 640: \(antes.count) \(antes.prefix(4).map(f)) · VERTICAL: \(vertical.count) \(vertical.prefix(4).map(f))")
    }

}
#endif
