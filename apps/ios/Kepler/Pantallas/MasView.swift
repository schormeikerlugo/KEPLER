import SwiftUI

/// Revisión en la base: archivos, comparador de identidades, bitácora y ajustes.
struct MasView: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var demo: String?

    var body: some View {
        NavigationStack {
            ZStack {
                FondoKepler()
                ScrollView {
                    VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                        Titulo(texto: "Base").padding(.top, Tema.Espacio.lg)
                        Opcion(destino: ArchivosView(), simbolo: "square.grid.3x3", titulo: "Archivos",
                               detalle: "Objetos, personas y POIs: revisar y editar")
                        Opcion(destino: IdentidadesView(), simbolo: "person.2", titulo: "Comparador de identidades",
                               detalle: "¿Es la misma persona? Confirma los parecidos")
                        Opcion(destino: BitacoraView(), simbolo: "list.bullet.rectangle", titulo: "Bitácora",
                               detalle: "Avisos y eventos · Deep-Dive con Cortex", globo: sesion.noLeidas)
                        Opcion(destino: AjustesView(), simbolo: "gearshape", titulo: "Ajustes",
                               detalle: "Servidor, sesión y versión")
                    }
                    .padding(.horizontal, Tema.Espacio.lg)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            #if DEBUG
            // Capturas: KEPLER_DEMO_SECCION=base-archivos|base-identidades|base-bitacora
            .navigationDestination(item: $demo) { d in
                switch d {
                case "base-archivos": ArchivosView()
                case "base-identidades": IdentidadesView()
                default: BitacoraView()
                }
            }
            .onAppear {
                let s = ProcessInfo.processInfo.environment["KEPLER_DEMO_SECCION"] ?? ""
                if s.hasPrefix("base-") { demo = s }
            }
            #endif
        }
    }
}

private struct Opcion<Destino: View>: View {
    let destino: Destino
    let simbolo: String
    let titulo: String
    let detalle: String
    var globo: UInt32 = 0

    var body: some View {
        NavigationLink { destino } label: {
            Tarjeta {
                HStack(spacing: Tema.Espacio.md) {
                    Image(systemName: simbolo)
                        .font(.system(size: 20))
                        .foregroundStyle(Tema.Color.acento)
                        .frame(width: 32)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(titulo).font(Jura.fuente(Tema.Tamano.cuerpo, .semibold)).foregroundStyle(Tema.Color.texto)
                        Text(detalle).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.textoTenue)
                    }
                    Spacer()
                    if globo > 0 {
                        Text("\(globo)")
                            .font(Jura.fuente(11, .bold))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 7)
                            .frame(minHeight: 20)
                            .background(Tema.Color.peligro, in: Capsule())
                    }
                    Image(systemName: "chevron.right").foregroundStyle(Tema.Color.textoTenue)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

/// Cabecera con «volver» para las pantallas de la pestaña (la barra de iOS va oculta).
struct CabeceraVolver: View {
    @Environment(\.dismiss) private var volver
    let titulo: String

    var body: some View {
        VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
            Button { volver() } label: {
                Label("Base", systemImage: "chevron.left")
                    .font(Jura.fuente(Tema.Tamano.cuerpo))
                    .foregroundStyle(Tema.Color.acento)
            }
            Titulo(texto: titulo)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Archivos

struct ArchivosView: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var tipo: TipoHallazgo = .objetos
    @State private var busqueda = ""
    @State private var items: [Hallazgo] = []
    @State private var hayMas = false
    @State private var cargando = false
    @State private var error: String?
    @State private var detalle: Hallazgo?

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                    CabeceraVolver(titulo: "Archivos")
                    Chips(opciones: [("objetos", "Objetos", Tema.Color.exito), ("personas", "Personas", Tema.Color.aviso),
                                     ("pois", "POIs", Tema.Color.acento)],
                          valor: Binding(get: { clave(tipo) }, set: { tipo = desde($0 ?? "objetos") }))
                    CampoKepler(etiqueta: "Buscar", texto: $busqueda, marcador: "nombre o descripción")
                        .onSubmit { Task { await cargar(reiniciar: true) } }
                    if let error { Vacio(texto: "⚠ \(error)") }
                    if items.isEmpty && !cargando && error == nil { Vacio(texto: "Nada por aquí todavía.") }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Tema.Espacio.sm), count: 3),
                              spacing: Tema.Espacio.sm) {
                        ForEach(items, id: \.id) { h in
                            Button { detalle = h } label: { Celda(h: h) }.buttonStyle(.plain)
                        }
                    }
                    if cargando { ProgressView().frame(maxWidth: .infinity) }
                    if hayMas && !cargando {
                        Button("CARGAR MÁS") { Task { await cargar(reiniciar: false) } }
                            .buttonStyle(BotonKepler(principal: false))
                    }
                }
                .padding(Tema.Espacio.lg)
            }
            .refreshable { await cargar(reiniciar: true) }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task(id: tipo) { await cargar(reiniciar: true) }
        .sheet(item: Binding(get: { detalle.map(Identificado.init) }, set: { detalle = $0?.h })) { i in
            DetalleHallazgoView(h: i.h) { cambio in
                switch cambio {
                case let .editado(n): if let k = items.firstIndex(where: { $0.id == n.id }) { items[k] = n }
                case let .borrado(id): items.removeAll { $0.id == id }
                }
            }
        }
    }

    private func clave(_ t: TipoHallazgo) -> String {
        switch t { case .objetos: "objetos"; case .personas: "personas"; case .puntosInteres: "pois" }
    }

    private func desde(_ s: String) -> TipoHallazgo {
        switch s { case "personas": .personas; case "pois": .puntosInteres; default: .objetos }
    }

    private func cargar(reiniciar: Bool) async {
        cargando = true
        error = nil
        do {
            let p = try await sesion.nucleo.archivos(tipo: tipo, busqueda: busqueda, mision: nil,
                                                     antes: reiniciar ? nil : items.last?.capturadoEn)
            items = reiniciar ? p.items : items + p.items
            hayMas = p.hayMas
        } catch {
            self.error = Sesion.mensaje(error)
        }
        cargando = false
    }

    private struct Celda: View {
        let h: Hallazgo

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                Color.clear
                    .aspectRatio(1, contentMode: .fit)
                    .overlay { ImagenRemota(ruta: h.imagenPath, lado: 120, simbolo: h.tipo == .personas ? "person.fill" : "photo") }
                    .clipShape(RoundedRectangle(cornerRadius: Tema.Radio.medio))
                    .overlay(alignment: .topTrailing) {
                        Circle().fill(Tono.de(h.nivel)).frame(width: 8, height: 8).padding(6)
                    }
                Text(h.nombre)
                    .font(Jura.fuente(11.5, .semibold))
                    .foregroundStyle(Tema.Color.texto)
                    .lineLimit(1)
                Text(Fecha.corta(h.capturadoEn))
                    .font(Jura.fuente(9.5))
                    .foregroundStyle(Tema.Color.textoEtiqueta)
            }
        }
    }
}

private struct Identificado: Identifiable {
    let h: Hallazgo
    var id: String { h.id }
}

enum CambioHallazgo {
    case editado(Hallazgo)
    case borrado(String)
}

struct DetalleHallazgoView: View {
    @EnvironmentObject private var sesion: Sesion
    @Environment(\.dismiss) private var cerrar
    let h: Hallazgo
    let alCambiar: (CambioHallazgo) -> Void
    @State private var nombre = ""
    @State private var texto = ""
    @State private var notas = ""
    @State private var nivel: String?
    @State private var compartido = false
    @State private var guardando = false
    @State private var confirmarBorrado = false
    @State private var error: String?

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espacio.lg) {
                    ImagenRemota(ruta: h.imagenPath, lado: 600)
                        .frame(height: 260)
                        .frame(maxWidth: .infinity)
                        .clipped()
                        .clipShape(RoundedRectangle(cornerRadius: Tema.Radio.tarjeta))
                        .padding(.top, Tema.Espacio.lg)
                    Etiqueta(texto: datos)
                    CampoKepler(etiqueta: "Nombre", texto: $nombre)
                    if let opciones = niveles {
                        VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
                            Etiqueta(texto: h.tipo == .personas ? "Hostilidad" : "Riesgo")
                            Chips(opciones: opciones, valor: $nivel)
                        }
                    }
                    CampoKepler(etiqueta: h.tipo == .personas ? "Rasgos físicos" : "Descripción", texto: $texto)
                    if h.tipo == .personas { CampoKepler(etiqueta: "Notas", texto: $notas) }
                    if h.tipo != .personas {
                        Toggle("Compartir con otros exploradores", isOn: $compartido)
                            .font(Jura.fuente(Tema.Tamano.cuerpo))
                            .foregroundStyle(Tema.Color.texto)
                            .tint(Tema.Color.acento)
                    }
                    if !h.etiquetas.isEmpty { Etiqueta(texto: "Etiquetas: " + h.etiquetas.joined(separator: " · ")) }
                    if let error { Text(error).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.peligro) }
                    HStack(spacing: Tema.Espacio.md) {
                        Button(confirmarBorrado ? "¿BORRAR?" : "BORRAR") {
                            if confirmarBorrado { Task { await borrar() } } else { confirmarBorrado = true }
                        }
                        .buttonStyle(BotonKepler(principal: false))
                        Button(guardando ? "GUARDANDO…" : "GUARDAR") { Task { await guardar() } }
                            .buttonStyle(BotonKepler())
                            .disabled(guardando || nombre.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                .padding(.horizontal, Tema.Espacio.lg)
            }
        }
        .onAppear {
            nombre = h.nombre
            texto = h.texto
            notas = h.notas
            nivel = h.nivel
            compartido = h.compartido
        }
    }

    private var datos: String {
        var partes = [Fecha.corta(h.capturadoEn)]
        if let c = h.confianza { partes.append("\(Int((c * 100).rounded())) %") }
        if let d = h.distanciaM { partes.append("~\(Medida.metros(d))") }
        if h.tipo == .objetos, !h.nivel.isEmpty { partes.append(h.nivel) }
        if h.vinculada { partes.append("identidad vinculada") }
        return partes.joined(separator: " · ")
    }

    private var niveles: [(String, String, Color)]? {
        switch h.tipo {
        case .personas:
            [("aliado", "Aliado", Tema.Color.exito), ("neutral", "Neutral", Tema.Color.acento),
             ("desconocido", "Desconocido", Color(hex: "#999999")), ("hostil", "Hostil", Tema.Color.peligro)]
        case .puntosInteres:
            [("bajo", "Bajo", Tema.Color.exito), ("medio", "Medio", Tema.Color.aviso),
             ("alto", "Alto", Color(hex: "#FF8844")), ("critico", "Crítico", Tema.Color.peligro)]
        case .objetos: nil
        }
    }

    private func guardar() async {
        guardando = true
        error = nil
        do {
            let n = try await sesion.nucleo.editarHallazgo(edicion: EdicionHallazgo(
                tipo: h.tipo, id: h.id, nombre: nombre, texto: texto, notas: notas, nivel: nivel ?? h.nivel,
                compartido: compartido))
            alCambiar(.editado(n))
            cerrar()
        } catch {
            self.error = Sesion.mensaje(error)
        }
        guardando = false
    }

    private func borrar() async {
        do {
            try await sesion.nucleo.borrarHallazgo(tipo: h.tipo, id: h.id)
            alCambiar(.borrado(h.id))
            cerrar()
        } catch {
            self.error = Sesion.mensaje(error)
        }
    }
}

// MARK: - Comparador de identidades

struct IdentidadesView: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var pendientes: [IdentidadPendiente]?
    @State private var error: String?
    @State private var aviso: String?

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                    CabeceraVolver(titulo: "Comparador de identidades")
                    Text("Personas con parecidos que no llegan al reconocimiento automático. Toca la que sea la misma.")
                        .font(Jura.fuente(Tema.Tamano.pequeno))
                        .foregroundStyle(Tema.Color.textoTenue)
                    if let aviso { Pastilla(texto: aviso, tono: Tema.Color.exito) }
                    if let error { Vacio(texto: "⚠ \(error)") }
                    if pendientes?.isEmpty == true { Vacio(texto: "No hay identidades por revisar.") }
                    ForEach(pendientes ?? [], id: \.id) { p in
                        Tarjeta {
                            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                                HStack(spacing: Tema.Espacio.md) {
                                    ImagenRemota(ruta: p.imagenPath, lado: 160)
                                        .frame(width: 72, height: 72)
                                        .clipShape(RoundedRectangle(cornerRadius: Tema.Radio.medio))
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(p.nombre).font(Jura.fuente(Tema.Tamano.cuerpo, .semibold)).foregroundStyle(Tema.Color.texto)
                                        Etiqueta(texto: Fecha.corta(p.capturadoEn), color: Tema.Color.textoEtiqueta)
                                        if !p.rasgos.isEmpty {
                                            Text(p.rasgos).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.textoTenue)
                                        }
                                    }
                                }
                                Etiqueta(texto: "¿Es alguna de estas?")
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: Tema.Espacio.sm) {
                                        ForEach(p.candidatos, id: \.id) { c in
                                            Button { Task { await vincular(p, c) } } label: {
                                                VStack(spacing: 4) {
                                                    ImagenRemota(ruta: c.imagenPath, lado: 160)
                                                        .frame(width: 84, height: 84)
                                                        .clipShape(RoundedRectangle(cornerRadius: Tema.Radio.medio))
                                                    Text(c.nombre).font(Jura.fuente(11)).foregroundStyle(Tema.Color.texto).lineLimit(1)
                                                    Text("\(Int((c.similitud * 100).rounded())) %")
                                                        .font(Jura.fuente(11, .semibold)).foregroundStyle(Tema.Color.acento)
                                                }
                                                .frame(width: 90)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(Tema.Espacio.lg)
            }
            .refreshable { await cargar() }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await cargar() }
    }

    private func cargar() async {
        do { pendientes = try await sesion.nucleo.identidadesPendientes() } catch { self.error = Sesion.mensaje(error) }
    }

    private func vincular(_ p: IdentidadPendiente, _ c: Candidato) async {
        do {
            try await sesion.nucleo.vincularPersona(id: p.id, con: c.id)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            aviso = "«\(p.nombre)» ahora es «\(c.nombre)»"
            pendientes?.removeAll { $0.id == p.id }
        } catch {
            self.error = Sesion.mensaje(error)
        }
    }
}

// MARK: - Bitácora

struct BitacoraView: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var items: [EntradaBitacora] = []
    @State private var error: String?
    @State private var analizar: EntradaBitacora?

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Tema.Espacio.sm) {
                    HStack(alignment: .bottom) {
                        CabeceraVolver(titulo: "Bitácora")
                        Button("LEER TODO") { Task { await leerTodo() } }
                            .font(Jura.fuente(Tema.Tamano.etiqueta, .semibold))
                            .foregroundStyle(Tema.Color.acento)
                    }
                    if let error { Vacio(texto: "⚠ \(error)") }
                    ForEach(items, id: \.id) { e in
                        HStack(alignment: .top, spacing: Tema.Espacio.md) {
                            Circle().fill(color(e.tipo)).frame(width: 8, height: 8).padding(.top, 6)
                                .shadow(color: color(e.tipo).opacity(0.7), radius: 4)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(e.mensaje)
                                    .font(Jura.fuente(Tema.Tamano.cuerpo))
                                    .foregroundStyle(e.leida ? Tema.Color.textoSecundario : Tema.Color.texto)
                                HStack {
                                    Etiqueta(texto: Fecha.corta(e.creadoEn), color: Tema.Color.textoEtiqueta)
                                    Spacer()
                                    Button("ANALIZAR") { analizar = e }
                                        .font(Jura.fuente(Tema.Tamano.etiqueta, .semibold))
                                        .foregroundStyle(Tema.Color.acento)
                                }
                            }
                        }
                        .padding(Tema.Espacio.md)
                        .background(e.leida ? Color.clear : Tema.Color.acentoSuave.opacity(0.5),
                                    in: RoundedRectangle(cornerRadius: Tema.Radio.medio))
                        .onTapGesture { Task { await leer(e) } }
                    }
                    if items.count >= 40 {
                        Button("CARGAR MÁS") { Task { await cargar(mas: true) } }.buttonStyle(BotonKepler(principal: false))
                    }
                }
                .padding(Tema.Espacio.lg)
            }
            .refreshable { await cargar(mas: false) }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await cargar(mas: false) }
        .sheet(item: Binding(get: { analizar.map(EntradaId.init) }, set: { analizar = $0?.e })) { i in
            DeepDiveView(entrada: i.e).presentationDetents([.large])
        }
    }

    private func color(_ tipo: String) -> Color {
        switch tipo {
        case "critical": Tema.Color.peligro
        case "warning": Tema.Color.aviso
        case "success": Tema.Color.exito
        default: Tema.Color.acento
        }
    }

    private func cargar(mas: Bool) async {
        do {
            let p = try await sesion.nucleo.bitacora(antes: mas ? items.last?.creadoEn : nil, soloNoLeidas: false)
            items = mas ? items + p.items : p.items
            sesion.noLeidas = p.noLeidas
            error = nil
        } catch {
            self.error = Sesion.mensaje(error)
        }
    }

    private func leer(_ e: EntradaBitacora) async {
        guard !e.leida else { return }
        try? await sesion.nucleo.marcarLeidas(ids: [e.id])
        await cargar(mas: false)
    }

    private func leerTodo() async {
        try? await sesion.nucleo.marcarLeidas(ids: [])
        await cargar(mas: false)
    }
}

private struct EntradaId: Identifiable {
    let e: EntradaBitacora
    var id: String { e.id }
}

/// Análisis en profundidad de una entrada de la bitácora (streaming).
struct DeepDiveView: View {
    @EnvironmentObject private var sesion: Sesion
    @Environment(\.dismiss) private var cerrar
    let entrada: EntradaBitacora
    @State private var texto = ""
    @State private var estado = "Cortex está pensando…"
    @State private var error: String?

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espacio.lg) {
                    HStack(spacing: Tema.Espacio.md) {
                        Text(sesion.perfil?.avatarIa ?? "🤖").font(.system(size: 24))
                        Titulo(texto: "Deep-Dive")
                    }
                    .padding(.top, Tema.Espacio.lg)
                    Text(entrada.mensaje)
                        .font(Jura.fuente(Tema.Tamano.pequeno))
                        .foregroundStyle(Tema.Color.textoTenue)
                    Tarjeta {
                        VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                            if !texto.isEmpty { MarkdownCortex(texto: texto) }
                            if !estado.isEmpty {
                                Text(estado).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.acento)
                            }
                            if let error { Text("⚠ \(error)").font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.peligro) }
                        }
                    }
                    Button("CERRAR") { cerrar() }.buttonStyle(BotonKepler(principal: false))
                }
                .padding(.horizontal, Tema.Espacio.lg)
            }
        }
        .task {
            let oyente = OyenteVista(estado: { estado = $0 }, texto: { texto = $0 })
            let p = await sesion.ubicacion.actual()
            do {
                let fin = try await sesion.nucleo.cortexAnalizar(notificacionId: entrada.id, lat: p?.latitude,
                                                                lng: p?.longitude, oyente: oyente)
                texto = fin.texto
                estado = String(format: "Analizado en %.1f s", fin.segundos)
            } catch {
                self.error = Sesion.mensaje(error)
                estado = ""
            }
        }
    }
}
