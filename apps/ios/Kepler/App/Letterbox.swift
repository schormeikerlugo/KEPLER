import Accelerate
import CoreVideo

/// Letterbox de YOLO sin Vision (que tarda ~10 ms en escalar): el fotograma
/// apaisado del sensor se reduce con vImage, se gira 90° y se centra en un
/// cuadrado de 640×640 relleno de gris 114, igual que en el entrenamiento.
/// Reutiliza los búferes: un objeto por hilo.
final class Letterbox {
    static let lado = 640
    let salida: CVPixelBuffer
    private var intermedio: vImage_Buffer?
    private var tamanoIntermedio = (0, 0)

    init() {
        var b: CVPixelBuffer?
        CVPixelBufferCreate(nil, Letterbox.lado, Letterbox.lado, kCVPixelFormatType_32BGRA,
                            [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &b)
        salida = b!
    }

    deinit { intermedio.map { free($0.data) } }

    /// `buffer` BGRA apaisado; `girar`: el teléfono está en vertical (sensor girado 90° a la derecha).
    /// Devuelve el tamaño de la imagen orientada.
    @discardableResult
    func preparar(_ buffer: CVPixelBuffer, girar: Bool) -> (ancho: Int, alto: Int) {
        let (w, h) = (CVPixelBufferGetWidth(buffer), CVPixelBufferGetHeight(buffer))
        let (ow, oh) = girar ? (h, w) : (w, h)
        let escala = min(Double(Letterbox.lado) / Double(ow), Double(Letterbox.lado) / Double(oh))
        let (dw, dh) = (max(1, Int((Double(ow) * escala).rounded())), max(1, Int((Double(oh) * escala).rounded())))
        // Tamaño reducido antes de girar
        let (sw, sh) = girar ? (dh, dw) : (dw, dh)

        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        CVPixelBufferLockBaseAddress(salida, [])
        defer {
            CVPixelBufferUnlockBaseAddress(salida, [])
            CVPixelBufferUnlockBaseAddress(buffer, .readOnly)
        }
        var origen = vImage_Buffer(data: CVPixelBufferGetBaseAddress(buffer), height: vImagePixelCount(h),
                                   width: vImagePixelCount(w), rowBytes: CVPixelBufferGetBytesPerRow(buffer))
        let filaSalida = CVPixelBufferGetBytesPerRow(salida)
        let base = CVPixelBufferGetBaseAddress(salida)!
        var destino = vImage_Buffer(data: base, height: vImagePixelCount(Letterbox.lado),
                                    width: vImagePixelCount(Letterbox.lado), rowBytes: filaSalida)
        var gris: [UInt8] = [114, 114, 114, 255]
        vImageBufferFill_ARGB8888(&destino, &gris, vImage_Flags(kvImageNoFlags))

        // Zona centrada donde va la imagen
        let (x0, y0) = ((Letterbox.lado - dw) / 2, (Letterbox.lado - dh) / 2)
        var zona = vImage_Buffer(data: base.advanced(by: y0 * filaSalida + x0 * 4), height: vImagePixelCount(dh),
                                 width: vImagePixelCount(dw), rowBytes: filaSalida)
        if girar {
            if tamanoIntermedio != (sw, sh) {
                intermedio.map { free($0.data) }
                intermedio = vImage_Buffer(data: malloc(sw * sh * 4), height: vImagePixelCount(sh),
                                           width: vImagePixelCount(sw), rowBytes: sw * 4)
                tamanoIntermedio = (sw, sh)
            }
            vImageScale_ARGB8888(&origen, &intermedio!, nil, vImage_Flags(kvImageNoFlags))
            var fondo: [UInt8] = [0, 0, 0, 0]
            // kRotate270DegreesClockwise en vImage = 90° en sentido horario de la imagen
            vImageRotate90_ARGB8888(&intermedio!, &zona, UInt8(kRotate270DegreesClockwise), &fondo,
                                    vImage_Flags(kvImageNoFlags))
        } else {
            vImageScale_ARGB8888(&origen, &zona, nil, vImage_Flags(kvImageNoFlags))
        }
        return (ow, oh)
    }
}
