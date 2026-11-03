import SwiftUI

/// Panel de la Unidad de Campo, en el orden del dashboard móvil de la PWA:
/// telemetría → consejo → avisos → explorador → misiones → objetos → POIs →
/// personas → rutas → distancia semanal → novedades de Cortex.
struct PanelView: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var reporte = false
    @State private var ruta: [CategoriaConteo] = []

    var body: some View {
        NavigationStack(path: $ruta) {
            ZStack {
                FondoKepler()
                ScrollViewReader { desplazar in
                ScrollView {
                    LazyVStack(spacing: Tema.Espacio.md) {
                        cabecera
                        if let e = sesion.errorPanel {
                            Pastilla(texto: e, tono: Tema.Color.peligro)
                        }
                        if let p = sesion.panel {
                            TarjetaTelemetria(panel: p)
                            TarjetaConsejo(texto: p.consejo)
                            if let e = sesion.estadoFisico { TarjetaPreparacion(estado: e).id("preparacion") }
                            if !p.atenciones.isEmpty { TarjetaAtencion(atenciones: p.atenciones) }
                            TarjetaExplorador(panel: p)
                            TarjetaMisiones(misiones: p.misiones, resumen: p.resumen).id("misiones")
                            TarjetaObjetos(categorias: p.objetosPorCategoria, frecuentes: p.objetosFrecuentes).id("objetos")
                            TarjetaPois(categorias: p.poisPorCategoria).id("pois")
                            TarjetaPersonas(personas: p.personas).id("personas")
                            TarjetaRutas(rutas: p.rutas)
                            TarjetaSemana(dias: p.semana, total: p.semanaTotalKm).id("semana")
                            TarjetaNovedades { reporte = true }
                            TarjetaBase()
                        } else if sesion.errorPanel == nil {
                            Tarjeta { ProgressView().frame(maxWidth: .infinity) }
                        }
                    }
                    .padding(.horizontal, Tema.Espacio.lg)
                    .padding(.bottom, Tema.Espacio.xl)
                }
                .refreshable { await sesion.cargar() }
                #if DEBUG
                // Capturas sin tocar la pantalla: KEPLER_DEMO_SECCION=objetos|pois|…|reporte
                .onChange(of: sesion.panel != nil) { _, listo in
                    guard listo, let s = ProcessInfo.processInfo.environment["KEPLER_DEMO_SECCION"], !s.isEmpty else { return }
                    switch s {
                    case "reporte": reporte = true
                    case "categoria": ruta = sesion.panel?.poisPorCategoria.filter { $0.total > 0 }.prefix(1).map { $0 } ?? []
                    default: desplazar.scrollTo(s, anchor: .top)
                    }
                }
                #endif
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: CategoriaConteo.self) { PoisCategoriaView(categoria: $0) }
            .sheet(isPresented: $reporte) { ReporteView() }
        }
    }

    private var cabecera: some View {
        HStack(spacing: Tema.Espacio.md) {
            VStack(alignment: .leading, spacing: 4) {
                Logo(tamano: 20)
                Etiqueta(texto: "Unidad de campo")
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(sesion.perfil?.nombreVisible ?? "—")
                    .font(Jura.fuente(Tema.Tamano.cuerpo, .semibold))
                    .foregroundStyle(Tema.Color.texto)
                Etiqueta(texto: sesion.perfil?.rol ?? "")
            }
            Group {
                if let ruta = sesion.perfil?.avatarPath {
                    ImagenRemota(ruta: ruta, lado: 44)
                } else {
                    Text(sesion.perfil?.avatarIa ?? "🤖").font(.system(size: 22))
                }
            }
            .frame(width: 44, height: 44)
            .background(Tema.Color.acentoSuave)
            .clipShape(Circle())
            .overlay(Circle().stroke(Tema.Color.acentoBorde, lineWidth: 1))
        }
        .padding(.top, Tema.Espacio.sm)
    }
}

// MARK: - Tarjetas

/// Cabecera de tarjeta: título y, opcional, algo a la derecha.
struct CabezaTarjeta<Derecha: View>: View {
    let titulo: String
    @ViewBuilder var derecha: Derecha

    var body: some View {
        HStack {
            Titulo(texto: titulo)
            Spacer()
            derecha
        }
    }
}

extension CabezaTarjeta where Derecha == EmptyView {
    init(titulo: String) {
        self.init(titulo: titulo) { EmptyView() }
    }
}

struct Vacio: View {
    let texto: String

    var body: some View {
        Text(texto)
            .font(Jura.fuente(Tema.Tamano.pequeno))
            .foregroundStyle(Tema.Color.textoTenue)
            .padding(.vertical, Tema.Espacio.sm)
    }
}

struct TarjetaTelemetria: View {
    let panel: Panel

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                HStack(spacing: 6) {
                    Image(systemName: panel.ubicacionGps ? "location.fill" : "location.slash")
                        .font(.system(size: 11))
                        .foregroundStyle(panel.ubicacionGps ? Tema.Color.acento : Tema.Color.textoTenue)
                    Text(panel.ubicacion)
                        .font(Jura.fuente(Tema.Tamano.pequeno, .semibold))
                        .foregroundStyle(Tema.Color.textoSecundario)
                        .lineLimit(1)
                    Spacer()
                    Image(systemName: panel.esDia ? "sun.max" : "moon.stars")
                        .foregroundStyle(Tema.Color.aviso)
                    Text(panel.clima ?? "sin datos")
                        .font(Jura.fuente(Tema.Tamano.pequeno))
                        .foregroundStyle(Tema.Color.textoTenue)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Tema.Espacio.sm), count: 4),
                          spacing: Tema.Espacio.sm) {
                    ForEach(panel.indicadores, id: \.etiqueta) { CeldaIndicador(indicador: $0) }
                }
            }
        }
    }
}

struct CeldaIndicador: View {
    let indicador: Indicador

    var body: some View {
        VStack(spacing: 4) {
            Text(indicador.valor)
                .font(Jura.fuente(15, .semibold))
                .foregroundStyle(indicador.nivel == .sinDato ? Tema.Color.textoEtiqueta : Tema.Color.texto)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            HStack(spacing: 3) {
                Circle().fill(indicador.nivel.color).frame(width: 5, height: 5)
                Text(indicador.etiqueta.uppercased())
                    .font(Jura.fuente(8.5, .semibold))
                    .tracking(0.6)
                    .foregroundStyle(Tema.Color.textoTenue)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 54)
        .background(Color.white.opacity(0.03), in: RoundedRectangle(cornerRadius: Tema.Radio.pequeno))
        .overlay(RoundedRectangle(cornerRadius: Tema.Radio.pequeno).stroke(Tema.Color.bordeSutil, lineWidth: 1))
    }
}

struct TarjetaConsejo: View {
    let texto: String

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
                Etiqueta(texto: "Consejo del día", color: Tema.Color.acento)
                Text(texto)
                    .font(Jura.fuente(Tema.Tamano.cuerpo))
                    .foregroundStyle(Tema.Color.textoSecundario)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct TarjetaAtencion: View {
    let atenciones: [Atencion]

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                CabezaTarjeta(titulo: "Requiere atención")
                ForEach(atenciones, id: \.texto) { a in
                    HStack(spacing: Tema.Espacio.md) {
                        Image(systemName: a.simbolo)
                            .foregroundStyle(Tema.Color.aviso)
                            .frame(width: 22)
                        (Text("\(a.cantidad) \(a.resaltado) ").foregroundStyle(Tema.Color.texto)
                            + Text(a.texto).foregroundStyle(Tema.Color.textoTenue))
                            .font(Jura.fuente(Tema.Tamano.cuerpo))
                    }
                }
            }
        }
    }
}

struct TarjetaExplorador: View {
    let panel: Panel

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                CabezaTarjeta(titulo: "Explorador") {
                    Etiqueta(texto: "\(panel.misionesCompletadas) \(panel.misionesCompletadas == 1 ? "completada" : "completadas") · \(String(format: "%.1f", panel.distanciaTotalKm)) km")
                }
                Barra(etiqueta: "Calzado", valor: panel.desgasteCalzado.map { 100 - $0 }, umbralAviso: 30, umbralPeligro: 15)
                Barra(etiqueta: "Resistencia", valor: panel.resistencia, umbralAviso: 40, umbralPeligro: 20)
                if let h = panel.recuperacionH, h >= 1 {
                    Text("Recuperado en ~\(Int(h.rounded())) h (sin nuevas misiones)")
                        .font(Jura.fuente(11)).foregroundStyle(Tema.Color.textoTenue)
                }
            }
        }
    }
}

/// Barra de porcentaje (más es mejor), verde → ámbar → rojo bajo los umbrales.
struct Barra: View {
    let etiqueta: String
    let valor: Double?
    let umbralAviso: Double
    let umbralPeligro: Double

    var body: some View {
        let v = valor ?? 0
        let tono = valor == nil ? Tema.Color.textoEtiqueta
            : v < umbralPeligro ? Tema.Color.peligro : v < umbralAviso ? Tema.Color.aviso : Tema.Color.progresoOk
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Etiqueta(texto: etiqueta)
                Spacer()
                Text(valor.map { String(format: "%.0f %%", $0) } ?? "—")
                    .font(Jura.fuente(Tema.Tamano.pequeno, .semibold))
                    .foregroundStyle(tono)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Tema.Color.pistaProgreso)
                    Capsule().fill(tono)
                        .frame(width: g.size.width * min(max(v / 100, 0), 1))
                        .shadow(color: tono.opacity(0.6), radius: 4)
                }
            }
            .frame(height: 6)
        }
    }
}

struct TarjetaMisiones: View {
    let misiones: [MisionFila]
    let resumen: Resumen

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                CabezaTarjeta(titulo: "Misiones") {
                    Etiqueta(texto: "\(resumen.misiones) en total · \(resumen.misionesActivas) activa\(resumen.misionesActivas == 1 ? "" : "s")")
                }
                if misiones.isEmpty { Vacio(texto: "Aún no hay misiones.") }
                ForEach(misiones, id: \.id) { m in
                    HStack(spacing: Tema.Espacio.md) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(m.titulo)
                                .font(Jura.fuente(Tema.Tamano.cuerpo))
                                .foregroundStyle(Tema.Color.texto)
                                .lineLimit(1)
                            Etiqueta(texto: "\(m.codigo) · \(Fecha.corta(m.creadoEn))", color: Tema.Color.textoEtiqueta)
                        }
                        Spacer()
                        Pastilla(texto: m.estado, tono: Tono.de(m.estado))
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }
}

struct TarjetaObjetos: View {
    let categorias: [CategoriaConteo]
    let frecuentes: [ObjetoFila]

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                CabezaTarjeta(titulo: "Objetos")
                if categorias.isEmpty {
                    Vacio(texto: "Sin objetos registrados.")
                } else {
                    Radar(valores: categorias.prefix(8).map { ($0.nombre, Double($0.total)) })
                        .frame(height: 210)
                        .frame(maxWidth: .infinity)
                }
                ForEach(frecuentes, id: \.id) { o in
                    HStack {
                        Text(o.nombre)
                            .font(Jura.fuente(Tema.Tamano.cuerpo))
                            .foregroundStyle(Tema.Color.texto)
                            .lineLimit(1)
                        Spacer()
                        Text(o.categoria)
                            .font(Jura.fuente(Tema.Tamano.pequeno))
                            .foregroundStyle(Color(hex: o.color))
                            .lineLimit(1)
                        Text("×\(o.total)")
                            .font(Jura.fuente(Tema.Tamano.pequeno, .semibold))
                            .foregroundStyle(Tema.Color.textoSecundario)
                            .frame(width: 34, alignment: .trailing)
                    }
                }
            }
        }
    }
}

/// Radar por categoría (mínimo cinco ejes, como en el escritorio).
struct Radar: View {
    let valores: [(String, Double)]

    var body: some View {
        let ejes = valores + Array(repeating: ("", 0), count: max(0, 5 - valores.count))
        let maximo = max(ejes.map(\.1).max() ?? 1, 1)
        GeometryReader { g in
            let c = CGPoint(x: g.size.width / 2, y: g.size.height / 2)
            let r = min(g.size.width, g.size.height) / 2 - 26
            let punto = { (i: Int, f: Double) -> CGPoint in
                let a = -Double.pi / 2 + 2 * Double.pi * Double(i) / Double(ejes.count)
                return CGPoint(x: c.x + cos(a) * r * f, y: c.y + sin(a) * r * f)
            }
            let poligono = { (f: (Int) -> Double) -> Path in
                Path { p in
                    for i in ejes.indices { i == 0 ? p.move(to: punto(i, f(i))) : p.addLine(to: punto(i, f(i))) }
                    p.closeSubpath()
                }
            }
            ZStack {
                ForEach(1...4, id: \.self) { k in
                    poligono { _ in Double(k) / 4 }.stroke(Color.white.opacity(0.08), lineWidth: 1)
                }
                Path { p in
                    for i in ejes.indices { p.move(to: c); p.addLine(to: punto(i, 1)) }
                }
                .stroke(Color.white.opacity(0.05), lineWidth: 1)
                let datos = poligono { i in ejes[i].1 > 0 ? max(ejes[i].1 / maximo, 0.08) : 0 }
                datos.fill(Tema.Color.acento.opacity(0.2))
                datos.stroke(Tema.Color.acento, lineWidth: 2)
                ForEach(ejes.indices, id: \.self) { i in
                    if !ejes[i].0.isEmpty {
                        Text(ejes[i].0)
                            .font(Jura.fuente(9.5))
                            .foregroundStyle(Tema.Color.textoTenue)
                            .lineLimit(1)
                            .frame(width: 86)
                            .position(punto(i, 1.2))
                    }
                }
            }
        }
    }
}

struct TarjetaPois: View {
    let categorias: [CategoriaConteo]

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
                CabezaTarjeta(titulo: "Puntos de interés")
                ForEach(categorias, id: \.id) { k in
                    NavigationLink(value: k) {
                        HStack(spacing: Tema.Espacio.md) {
                            Circle().fill(Color(hex: k.color)).frame(width: 9, height: 9)
                                .shadow(color: Color(hex: k.color).opacity(0.6), radius: 4)
                            Text(String(format: "%02d", k.total))
                                .font(Jura.fuente(11, .semibold))
                                .foregroundStyle(Tema.Color.acento)
                                .frame(width: 38, height: 20)
                                .background(Tema.Color.acentoSuave, in: Capsule())
                            Text(k.nombre)
                                .font(Jura.fuente(Tema.Tamano.cuerpo))
                                .foregroundStyle(Tema.Color.texto)
                            Spacer()
                            if k.compartidos > 0 {
                                Text("+\(k.compartidos) de otros")
                                    .font(Jura.fuente(11))
                                    .foregroundStyle(Tema.Color.textoTenue)
                            }
                            Image(systemName: "chevron.right")
                                .font(.system(size: 11))
                                .foregroundStyle(Tema.Color.textoTenue)
                        }
                        .padding(.vertical, 8)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

struct FilaHallazgo: View {
    let h: HallazgoFila
    var foto = false

    var body: some View {
        HStack(spacing: Tema.Espacio.md) {
            if foto {
                ImagenRemota(ruta: h.imagenPath, lado: 40)
                    .frame(width: 40, height: 40)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(Tono.de(h.nivel).opacity(0.6), lineWidth: 1))
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(h.nombre)
                    .font(Jura.fuente(Tema.Tamano.cuerpo))
                    .foregroundStyle(Tema.Color.texto)
                    .lineLimit(1)
                Etiqueta(texto: Fecha.corta(h.capturadoEn), color: Tema.Color.textoEtiqueta)
            }
            Spacer()
            Text(Tono.texto(h.nivel).uppercased())
                .font(Jura.fuente(10.5, .semibold))
                .foregroundStyle(Tono.de(h.nivel))
        }
    }
}

struct TarjetaPersonas: View {
    let personas: [HallazgoFila]

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                CabezaTarjeta(titulo: "Personas")
                if personas.isEmpty { Vacio(texto: "Sin personas registradas.") }
                ForEach(personas, id: \.id) { FilaHallazgo(h: $0, foto: true) }
            }
        }
    }
}

struct TarjetaRutas: View {
    let rutas: [RutaFila]

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                CabezaTarjeta(titulo: "Rutas")
                if rutas.isEmpty { Vacio(texto: "Sin rutas. Se planifican desde el Centro de Control.") }
                ForEach(Array(rutas.enumerated()), id: \.offset) { _, r in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(r.nombre)
                                .font(Jura.fuente(Tema.Tamano.cuerpo))
                                .foregroundStyle(Tema.Color.texto)
                                .lineLimit(1)
                            Etiqueta(texto: "\(r.distanciaKm.map { String(format: "%.1f km", $0) } ?? "— km") · \(r.registrada ? "registrada en campo" : "planificada")",
                                     color: Tema.Color.textoEtiqueta)
                        }
                        Spacer()
                        Pastilla(texto: Tono.texto(r.seguridad), tono: Tono.de(r.seguridad))
                    }
                }
            }
        }
    }
}

struct TarjetaSemana: View {
    let dias: [DiaSemana]
    let total: Double

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                CabezaTarjeta(titulo: "Distancia semanal") {
                    Text(String(format: "%.1f km", total))
                        .font(Jura.fuente(Tema.Tamano.cuerpo, .semibold))
                        .foregroundStyle(Tema.Color.acento)
                }
                let maximo = max(dias.map(\.km).max() ?? 0, 0.1)
                HStack(alignment: .bottom, spacing: Tema.Espacio.sm) {
                    ForEach(Array(dias.enumerated()), id: \.offset) { i, d in
                        VStack(spacing: 6) {
                            Text(d.km > 0 ? String(format: "%.1f", d.km) : "")
                                .font(Jura.fuente(9))
                                .foregroundStyle(Tema.Color.textoTenue)
                            RoundedRectangle(cornerRadius: 3)
                                .fill(i == dias.count - 1 ? Tema.Color.acento : Tema.Color.acento.opacity(0.45))
                                .frame(height: max(3, 80 * d.km / maximo))
                            Text(d.etiqueta)
                                .font(Jura.fuente(10))
                                .foregroundStyle(i == dias.count - 1 ? Tema.Color.texto : Tema.Color.textoTenue)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 120, alignment: .bottom)
            }
        }
    }
}

struct TarjetaNovedades: View {
    let abrir: () -> Void

    var body: some View {
        Button(action: abrir) {
            Tarjeta {
                VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
                    CabezaTarjeta(titulo: "Novedades de Cortex") {
                        Image(systemName: "sparkles").foregroundStyle(Tema.Color.acento)
                    }
                    ForEach(["Lecturas del tiempo en tu zona", "Noticias sobre tus hallazgos", "Sugerencia de exploración"], id: \.self) { t in
                        HStack(spacing: Tema.Espacio.sm) {
                            Text("•").foregroundStyle(Tema.Color.acento)
                            Text(t)
                                .font(Jura.fuente(Tema.Tamano.cuerpo))
                                .foregroundStyle(Tema.Color.textoSecundario)
                        }
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }
}

struct TarjetaBase: View {
    @EnvironmentObject private var sesion: Sesion

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                CabezaTarjeta(titulo: "Base")
                let s = sesion.servidorEstado
                FilaEstado(nombre: "Servidor", ok: s?.enLinea,
                           detalle: s.map { $0.enLinea ? "\($0.latenciaMs) ms" : "sin conexión" } ?? "…")
                FilaEstado(nombre: "Cortex (IA)", ok: s.map { $0.enLinea && $0.ia },
                           detalle: s.map { $0.ia ? "disponible" : "no disponible" } ?? "…")
                FilaEstado(nombre: "Visión", ok: s.map { $0.enLinea && $0.vision },
                           detalle: s.map { $0.vision ? "YOLO + CLIP" : "no disponible" } ?? "…")
                let p = sesion.sync
                FilaEstado(nombre: "Pendiente de enviar", ok: p.map { $0.pendientes == 0 && $0.rastro == 0 },
                           detalle: p.map { q in
                               q.pendientes == 0 && q.rastro == 0 ? "nada"
                                   : "\(q.pendientes) envíos · \(q.rastro) puntos GPS" + (q.apartadas > 0 ? " · \(q.apartadas) con error" : "")
                           } ?? "…")
            }
        }
    }
}

struct FilaEstado: View {
    let nombre: String
    let ok: Bool?
    let detalle: String

    var body: some View {
        HStack(spacing: Tema.Espacio.md) {
            let tono = ok.map { $0 ? Tema.Color.exito : Tema.Color.peligro } ?? Tema.Color.textoEtiqueta
            Circle().fill(tono).frame(width: 8, height: 8).shadow(color: tono.opacity(0.7), radius: 4)
            Text(nombre)
                .font(Jura.fuente(Tema.Tamano.cuerpo))
                .foregroundStyle(Tema.Color.texto)
            Spacer()
            Text(detalle)
                .font(Jura.fuente(Tema.Tamano.pequeno))
                .foregroundStyle(Tema.Color.textoTenue)
        }
    }
}

// MARK: - Pantallas que se abren desde el panel

struct PoisCategoriaView: View {
    @EnvironmentObject private var sesion: Sesion
    @Environment(\.dismiss) private var volver
    let categoria: CategoriaConteo
    @State private var pois: [HallazgoFila]?
    @State private var error: String?

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                    Button { volver() } label: {
                        Label("Panel", systemImage: "chevron.left")
                            .font(Jura.fuente(Tema.Tamano.cuerpo))
                            .foregroundStyle(Tema.Color.acento)
                    }
                    HStack {
                        Circle().fill(Color(hex: categoria.color)).frame(width: 10, height: 10)
                        Titulo(texto: categoria.nombre)
                    }
                    Tarjeta {
                        VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                            if let error { Vacio(texto: "⚠ \(error)") }
                            if let pois {
                                if pois.isEmpty { Vacio(texto: "Ningún POI propio en esta categoría.") }
                                ForEach(pois, id: \.id) { FilaHallazgo(h: $0) }
                            } else if error == nil {
                                ProgressView().frame(maxWidth: .infinity)
                            }
                        }
                    }
                    if categoria.compartidos > 0 {
                        Etiqueta(texto: "+\(categoria.compartidos) reportes de otros exploradores en el mapa")
                    }
                }
                .padding(Tema.Espacio.lg)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task {
            do {
                pois = try await sesion.nucleo.poisDeCategoria(categoriaId: categoria.id)
            } catch {
                self.error = Sesion.mensaje(error)
            }
        }
    }
}

struct ReporteView: View {
    @EnvironmentObject private var sesion: Sesion
    @Environment(\.dismiss) private var cerrar
    @State private var reporte: Reporte?
    @State private var error: String?
    @State private var cargando = false

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espacio.lg) {
                    HStack(spacing: Tema.Espacio.md) {
                        Text(sesion.perfil?.avatarIa ?? "🤖").font(.system(size: 24))
                        Titulo(texto: "Novedades de Cortex")
                    }
                    .padding(.top, Tema.Espacio.lg)
                    Tarjeta {
                        VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                            if let reporte {
                                MarkdownCortex(texto: reporte.texto)
                                Etiqueta(texto: "Generado \(Fecha.corta(reporte.generadoEn)) · IA local", color: Tema.Color.textoEtiqueta)
                            }
                            if cargando {
                                HStack(spacing: Tema.Espacio.sm) {
                                    ProgressView()
                                    Text("Cortex está pensando…")
                                        .font(Jura.fuente(Tema.Tamano.pequeno))
                                        .foregroundStyle(Tema.Color.acento)
                                }
                            }
                            if let error { Vacio(texto: "⚠ \(error)") }
                        }
                    }
                    HStack(spacing: Tema.Espacio.md) {
                        Button("REGENERAR") { Task { await cargar(forzar: true) } }
                            .buttonStyle(BotonKepler(principal: false))
                            .disabled(cargando)
                        Button("CERRAR") { cerrar() }.buttonStyle(BotonKepler())
                    }
                }
                .padding(.horizontal, Tema.Espacio.lg)
            }
        }
        .task { await cargar(forzar: false) }
    }

    private func cargar(forzar: Bool) async {
        cargando = true
        error = nil
        let p = await sesion.ubicacion.actual()
        do {
            reporte = try await sesion.nucleo.reporte(lat: p?.latitude, lng: p?.longitude, forzar: forzar)
        } catch {
            self.error = Sesion.mensaje(error)
        }
        cargando = false
    }
}
