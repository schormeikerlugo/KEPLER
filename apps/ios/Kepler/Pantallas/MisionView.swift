import AVFoundation
import SwiftUI

/// Vista de campo: cámara con detección YOLO en vivo, captura rápida del
/// objetivo (objeto o persona) y reporte de puntos de interés.
struct MisionView: View {
    @EnvironmentObject private var sesion: Sesion
    @StateObject private var camara = Camara()
    @State private var mision: MisionFila?
    @State private var aviso: (texto: String, tono: Color)?
    @State private var guardando = false
    @State private var capturas = 0
    @State private var ultimaFoto: UIImage?
    @State private var poi = false
    @State private var destello = false

    private var objetivo: Deteccion? { elegirObjetivo(detecciones: camara.detecciones) }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            vista.ignoresSafeArea()
            CajasDeteccion(detecciones: camara.detecciones, objetivo: objetivo, tamanoImagen: camara.tamanoImagen)
                .ignoresSafeArea()
                .allowsHitTesting(false)
            if destello { Color.white.opacity(0.35).ignoresSafeArea().allowsHitTesting(false) }
            VStack(spacing: Tema.Espacio.md) {
                hudSuperior
                Spacer()
                if let aviso {
                    Text(aviso.texto)
                        .font(Jura.fuente(Tema.Tamano.pequeno, .semibold))
                        .foregroundStyle(aviso.tono)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(.black.opacity(0.75), in: Capsule())
                        .overlay(Capsule().stroke(aviso.tono.opacity(0.4), lineWidth: 1))
                        .transition(.opacity)
                }
                if camara.zoomsDisponibles.count > 1 { selectorZoom }
                controles
            }
            .padding(.horizontal, Tema.Espacio.lg)
            .padding(.bottom, Tema.Espacio.md)
            estadoCamara
        }
        .task {
            await camara.encender()
            mision = try? await sesion.nucleo.misionActiva()
            #if DEBUG
            await demo()
            #endif
        }
        .onDisappear { camara.apagar() }
        .sheet(isPresented: $poi) {
            ReportarPoiView(camara: camara, mision: mision, sugerencia: objetivo) { mostrar($0, Tema.Color.exito) }
                .presentationDetents([.large])
        }
    }

    @ViewBuilder private var vista: some View {
        if let img = camara.imagenFija {
            GeometryReader { g in
                Image(uiImage: img).resizable().scaledToFill().frame(width: g.size.width, height: g.size.height).clipped()
            }
        } else {
            VistaPrevia(sesion: camara.sesion)
        }
    }

    private var hudSuperior: some View {
        HStack(spacing: Tema.Espacio.sm) {
            Pastilla(texto: mision.map { "Misión · \($0.titulo)" } ?? "Sin misión activa",
                     tono: mision == nil ? Tema.Color.textoTenue : Tema.Color.exito)
                .background(.black.opacity(0.6), in: Capsule())
                .lineLimit(1)
            Spacer()
            Pastilla(texto: "\(camara.detecciones.count) obj · \(Int(camara.fps.rounded())) fps · \(Int(camara.latenciaMs.rounded())) ms", tono: Tema.Color.acento)
                .background(.black.opacity(0.6), in: Capsule())
        }
        .padding(.top, Tema.Espacio.sm)
    }

    /// 1× / 3× (teleobjetivo), como en la cámara del iPhone.
    private var selectorZoom: some View {
        HStack(spacing: Tema.Espacio.sm) {
            ForEach(camara.zoomsDisponibles, id: \.self) { z in
                let activo = abs(camara.zoom - z) < 0.01
                Button {
                    UISelectionFeedbackGenerator().selectionChanged()
                    camara.cambiarZoom(z)
                } label: {
                    Text(z == z.rounded() ? "\(Int(z))×" : String(format: "%.1f×", z))
                        .font(Jura.fuente(activo ? 13 : 11, .bold))
                        .foregroundStyle(activo ? Tema.Color.aviso : Tema.Color.texto)
                        .frame(width: activo ? 42 : 34, height: activo ? 42 : 34)
                        .background(.black.opacity(0.6), in: Circle())
                }
            }
        }
        .padding(4)
        .background(.black.opacity(0.35), in: Capsule())
        .animation(.easeOut(duration: Tema.Movimiento.rapido), value: camara.zoom)
    }

    private var controles: some View {
        HStack(alignment: .center) {
            Button { poi = true } label: {
                VStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse").font(.system(size: 22))
                    Text("POI").font(Jura.fuente(Tema.Tamano.etiqueta, .semibold)).tracking(1)
                }
                .foregroundStyle(Tema.Color.aviso)
                .frame(width: 64, height: 64)
                .background(.black.opacity(0.6), in: Circle())
                .overlay(Circle().stroke(Tema.Color.aviso.opacity(0.5), lineWidth: 1))
            }
            Spacer()
            Button { Task { await capturar() } } label: {
                ZStack {
                    Circle().stroke(objetivo == nil ? Tema.Color.textoTenue : Tema.Color.acento, lineWidth: 3)
                        .frame(width: 82, height: 82)
                    Circle().fill(objetivo == nil ? Color.white.opacity(0.15) : Tema.Color.acento.opacity(0.85))
                        .frame(width: 66, height: 66)
                    if guardando { ProgressView().tint(.white) }
                }
                .shadow(color: Tema.Color.acento.opacity(objetivo == nil ? 0 : 0.6), radius: 14)
            }
            .disabled(guardando || objetivo == nil)
            Spacer()
            ZStack(alignment: .topTrailing) {
                Group {
                    if let ultimaFoto {
                        Image(uiImage: ultimaFoto).resizable().scaledToFill()
                    } else {
                        Image(systemName: "photo.stack").foregroundStyle(Tema.Color.textoTenue)
                    }
                }
                .frame(width: 56, height: 56)
                .background(.black.opacity(0.6))
                .clipShape(RoundedRectangle(cornerRadius: Tema.Radio.medio))
                .overlay(RoundedRectangle(cornerRadius: Tema.Radio.medio).stroke(Tema.Color.bordeHolo, lineWidth: 1))
                if capturas > 0 {
                    Text("\(capturas)")
                        .font(Jura.fuente(11, .bold))
                        .foregroundStyle(.black)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(Tema.Color.acento, in: Circle())
                        .offset(x: 6, y: -6)
                }
            }
            .frame(width: 64)
        }
    }

    @ViewBuilder private var estadoCamara: some View {
        let texto: String? = switch camara.estado {
        case .sinPermiso: "KEPLER no tiene permiso para usar la cámara. Actívalo en Ajustes → Privacidad → Cámara."
        case .sinCamara: "Este dispositivo no tiene cámara trasera."
        case let .error(e): e
        default: nil
        }
        if let texto {
            Tarjeta {
                Text(texto)
                    .font(Jura.fuente(Tema.Tamano.cuerpo))
                    .foregroundStyle(Tema.Color.textoSecundario)
            }
            .padding(Tema.Espacio.xl)
        }
    }

    /// Captura rápida: recorta el objetivo y lo guarda como objeto o persona.
    private func capturar() async {
        guard let o = objetivo, let jpeg = camara.jpeg(de: o) else { return }
        guardando = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        withAnimation(.easeOut(duration: 0.08)) { destello = true }
        Task { try? await Task.sleep(for: .milliseconds(120)); withAnimation { destello = false } }
        let esPersona = o.clase == "person"
        let hora = Date().formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
        let p = await sesion.ubicacion.actual()
        let nueva = NuevaCaptura(
            tipo: esPersona ? .persona : .objeto, nombre: esPersona ? "Persona \(hora)" : o.nombre,
            clase: o.clase, confianza: o.confianza, lat: p?.latitude, lng: p?.longitude,
            misionId: mision?.id, nivelRiesgo: nil, categoriaId: nil, descripcion: nil, compartir: false)
        do {
            let r = try await sesion.nucleo.capturar(captura: nueva, jpeg: jpeg)
            capturas += 1
            ultimaFoto = UIImage(data: jpeg)
            mostrar(r.mensaje, r.coincideCon == nil ? Tema.Color.exito : Tema.Color.acento)
        } catch {
            mostrar("⚠ \(Sesion.mensaje(error))", Tema.Color.peligro)
        }
        guardando = false
    }

    private func mostrar(_ texto: String, _ tono: Color) {
        withAnimation { aviso = (texto, tono) }
        Task {
            try? await Task.sleep(for: .seconds(4))
            withAnimation { if aviso?.texto == texto { aviso = nil } }
        }
    }

    #if DEBUG
    /// Pruebas en el simulador: `KEPLER_DEMO_SECCION=mision-captura|mision-poi|mision-poi-guardar`.
    private func demo() async {
        let entorno = ProcessInfo.processInfo.environment
        if let z = entorno["KEPLER_DEMO_ZOOM"].flatMap(Double.init) {
            try? await Task.sleep(for: .seconds(8))
            camara.cambiarZoom(z)
        }
        let s = entorno["KEPLER_DEMO_SECCION"] ?? ""
        guard s.hasPrefix("mision-") else { return }
        try? await Task.sleep(for: .seconds(3))
        if s == "mision-captura" { await capturar() }
        if s.hasPrefix("mision-poi") { poi = true }
    }
    #endif
}

/// Cajas sobre la vista (que llena la pantalla recortando, como `aspectFill`).
struct CajasDeteccion: View {
    let detecciones: [Deteccion]
    let objetivo: Deteccion?
    let tamanoImagen: CGSize

    var body: some View {
        GeometryReader { g in
            let s = max(g.size.width / tamanoImagen.width, g.size.height / tamanoImagen.height)
            let dx = (g.size.width - tamanoImagen.width * s) / 2
            let dy = (g.size.height - tamanoImagen.height * s) / 2
            ForEach(Array(detecciones.enumerated()), id: \.offset) { _, d in
                let r = CGRect(x: CGFloat(d.x) * tamanoImagen.width * s + dx,
                               y: CGFloat(d.y) * tamanoImagen.height * s + dy,
                               width: CGFloat(d.ancho) * tamanoImagen.width * s,
                               height: CGFloat(d.alto) * tamanoImagen.height * s)
                let esObjetivo = d == objetivo
                let tono = d.clase == "person" ? Tema.Color.aviso : Tema.Color.acento
                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(tono.opacity(esObjetivo ? 1 : 0.55), lineWidth: esObjetivo ? 2.5 : 1.2)
                        .shadow(color: tono.opacity(esObjetivo ? 0.8 : 0), radius: 8)
                    Text("\(d.nombre) \(Int((d.confianza * 100).rounded()))%")
                        .font(Jura.fuente(11, .semibold))
                        .foregroundStyle(.black)
                        .lineLimit(1)
                        .fixedSize()
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(tono.opacity(esObjetivo ? 1 : 0.7), in: RoundedRectangle(cornerRadius: 4))
                        // Dentro de la pantalla aunque la caja se salga por arriba o por la izquierda
                        .offset(x: max(0, 8 - r.minX), y: r.minY < 64 ? max(4, 64 - r.minY) : -20)
                }
                .frame(width: r.width, height: r.height)
                .position(x: r.midX, y: r.midY)
            }
        }
    }
}

struct VistaPrevia: UIViewRepresentable {
    let sesion: AVCaptureSession

    final class Capa: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previa: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> Capa {
        let v = Capa()
        v.previa.session = sesion
        v.previa.videoGravity = .resizeAspectFill
        return v
    }

    func updateUIView(_ uiView: Capa, context: Context) {}
}

/// Reporte de un punto de interés con la foto del encuadre.
struct ReportarPoiView: View {
    @EnvironmentObject private var sesion: Sesion
    @Environment(\.dismiss) private var cerrar
    let camara: Camara
    let mision: MisionFila?
    let sugerencia: Deteccion?
    let alGuardar: (String) -> Void

    @State private var nombre = ""
    @State private var descripcion = ""
    @State private var riesgo = "medio"
    @State private var categoria: String?
    @State private var categorias: [CategoriaConteo] = []
    @State private var compartir = true
    @State private var foto: Data?
    @State private var guardando = false
    @State private var error: String?

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espacio.lg) {
                    Titulo(texto: "Reportar punto de interés").padding(.top, Tema.Espacio.lg)
                    if let foto, let img = UIImage(data: foto) {
                        Image(uiImage: img).resizable().scaledToFill()
                            .frame(height: 180).frame(maxWidth: .infinity).clipped()
                            .clipShape(RoundedRectangle(cornerRadius: Tema.Radio.tarjeta))
                    }
                    CampoKepler(etiqueta: "Nombre", texto: $nombre, marcador: "p. ej. Paso estrecho")
                    VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
                        Etiqueta(texto: "Categoría")
                        Chips(opciones: categorias.map { ($0.id, $0.nombre, Color(hex: $0.color)) }, valor: $categoria)
                    }
                    VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
                        Etiqueta(texto: "Riesgo")
                        Chips(opciones: [("bajo", "Bajo", Tema.Color.exito), ("medio", "Medio", Tema.Color.aviso),
                                         ("alto", "Alto", Color(hex: "#FF8844")), ("critico", "Crítico", Tema.Color.peligro)],
                              valor: Binding(get: { riesgo }, set: { riesgo = $0 ?? "medio" }))
                    }
                    CampoKepler(etiqueta: "Descripción", texto: $descripcion, marcador: "Opcional")
                    Toggle(isOn: $compartir) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Compartir con otros exploradores")
                                .font(Jura.fuente(Tema.Tamano.cuerpo))
                                .foregroundStyle(Tema.Color.texto)
                            Text("Si es un peligro, les llega un aviso.")
                                .font(Jura.fuente(Tema.Tamano.pequeno))
                                .foregroundStyle(Tema.Color.textoTenue)
                        }
                    }
                    .tint(Tema.Color.acento)
                    if let error {
                        Text(error).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.peligro)
                    }
                    HStack(spacing: Tema.Espacio.md) {
                        Button("CANCELAR") { cerrar() }.buttonStyle(BotonKepler(principal: false))
                        Button(guardando ? "GUARDANDO…" : "REPORTAR") { Task { await guardar() } }
                            .buttonStyle(BotonKepler())
                            .disabled(guardando || nombre.trimmingCharacters(in: .whitespaces).isEmpty || foto == nil)
                    }
                }
                .padding(.horizontal, Tema.Espacio.lg)
            }
        }
        .task {
            foto = camara.jpeg(de: nil, ladoMax: 1280)
            if nombre.isEmpty, let s = sugerencia, s.clase != "person" { nombre = s.nombre }
            categorias = (try? await sesion.nucleo.categoriasPoi()) ?? []
            if categoria == nil { categoria = categorias.first?.id }
            #if DEBUG
            if ProcessInfo.processInfo.environment["KEPLER_DEMO_SECCION"] == "mision-poi-guardar" {
                nombre = "Paso inundado"
                riesgo = "alto"
                try? await Task.sleep(for: .seconds(2))
                await guardar()
            }
            #endif
        }
    }

    private func guardar() async {
        guard let foto else { return }
        guardando = true
        error = nil
        let p = await sesion.ubicacion.actual()
        let nueva = NuevaCaptura(
            tipo: .poi, nombre: nombre, clase: sugerencia?.clase, confianza: nil, lat: p?.latitude, lng: p?.longitude,
            misionId: mision?.id, nivelRiesgo: riesgo, categoriaId: categoria,
            descripcion: descripcion.isEmpty ? nil : descripcion, compartir: compartir)
        do {
            let r = try await sesion.nucleo.capturar(captura: nueva, jpeg: foto)
            alGuardar(r.mensaje)
            cerrar()
        } catch {
            self.error = Sesion.mensaje(error)
        }
        guardando = false
    }
}

/// Selector de una opción en fichas.
struct Chips: View {
    let opciones: [(String, String, Color)]
    @Binding var valor: String?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Tema.Espacio.sm) {
                ForEach(opciones, id: \.0) { id, texto, tono in
                    let activa = valor == id
                    Button { valor = id } label: {
                        Text(texto.uppercased())
                            .font(Jura.fuente(Tema.Tamano.etiqueta, .semibold))
                            .tracking(1)
                            .foregroundStyle(activa ? tono : Tema.Color.textoTenue)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(activa ? tono.opacity(0.15) : .clear, in: Capsule())
                            .overlay(Capsule().stroke(activa ? tono : Tema.Color.bordeTenue, lineWidth: 1))
                    }
                }
            }
        }
    }
}
