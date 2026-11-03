import SwiftUI

/// Color de la Preparación (alta / media / baja).
private func tono(_ nivel: String) -> Color {
    switch nivel {
    case "alta": Tema.Color.exito
    case "media": Tema.Color.aviso
    default: Tema.Color.peligro
    }
}

/// Panel: Preparación de hoy frente a lo normal del explorador.
struct TarjetaPreparacion: View {
    let estado: EstadoFisico

    var body: some View {
        NavigationLink { RendimientoView() } label: {
            Tarjeta {
                VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                    CabezaTarjeta(titulo: "Preparación") {
                        Image(systemName: "chevron.right").foregroundStyle(Tema.Color.textoTenue)
                    }
                    HStack(alignment: .center, spacing: Tema.Espacio.lg) {
                        ZStack {
                            Circle().stroke(Tema.Color.pistaProgreso, lineWidth: 7)
                            Circle().trim(from: 0, to: CGFloat(estado.puntuacion) / 100)
                                .stroke(tono(estado.nivel), style: StrokeStyle(lineWidth: 7, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                            Text("\(estado.puntuacion)")
                                .font(Jura.fuente(Tema.Tamano.valor, .bold)).foregroundStyle(Tema.Color.texto)
                        }
                        .frame(width: 70, height: 70)
                        VStack(alignment: .leading, spacing: 4) {
                            Pastilla(texto: estado.nivel, tono: tono(estado.nivel))
                            Text(estado.resumen).font(Jura.fuente(Tema.Tamano.pequeno))
                                .foregroundStyle(Tema.Color.textoSecundario).multilineTextAlignment(.leading)
                        }
                    }
                    ForEach(estado.factores.filter { $0.puntos != 0 }, id: \.clave) { f in
                        HStack(alignment: .top) {
                            Text(f.texto).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.textoTenue)
                                .multilineTextAlignment(.leading)
                            Spacer()
                            Text(String(format: "%+.0f", f.puntos)).font(Jura.fuente(Tema.Tamano.pequeno, .semibold))
                                .foregroundStyle(f.puntos < 0 ? Tema.Color.peligro : Tema.Color.exito)
                        }
                    }
                    if !estado.lineaBase {
                        Text("Aún aprendiendo tu normalidad: necesita unos días de sueño y pulso del reloj.")
                            .font(Jura.fuente(11)).foregroundStyle(Tema.Color.aviso)
                    }
                    if let hoy = estado.dias.last {
                        HStack(spacing: Tema.Espacio.sm) {
                            Mini(nombre: "Sueño", valor: hoy.suenoH.map { String(format: "%.1f h", $0) })
                            Mini(nombre: "Reposo", valor: hoy.pulsoReposo.map { String(format: "%.0f lpm", $0) })
                            Mini(nombre: "Estrés", valor: hoy.estres.map { String(format: "%.0f", $0) })
                            Mini(nombre: "Pasos", valor: hoy.pasos.map { String(format: "%.0f", $0) })
                        }
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }
}

private struct Mini: View {
    let nombre: String
    let valor: String?

    var body: some View {
        VStack(spacing: 2) {
            Text(valor ?? "—").font(Jura.fuente(Tema.Tamano.cuerpo, .semibold)).foregroundStyle(Tema.Color.texto)
            Etiqueta(texto: nombre)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(Tema.Color.superficieInput, in: RoundedRectangle(cornerRadius: Tema.Radio.medio))
    }
}

/// Tras completar una misión: ¿cómo de duro fue? Va a la cola (también sin conexión).
struct ValoracionView: View {
    @EnvironmentObject private var sesion: Sesion
    @Environment(\.dismiss) private var cerrar
    let mision: String
    @State private var esfuerzo = 5.0
    @State private var sensacion = "bien"

    private static let sensaciones = [("con energía", "bolt.fill"), ("bien", "hand.thumbsup"),
                                      ("cansado", "battery.25"), ("agotado", "battery.0"), ("con molestias", "bandage")]

    var body: some View {
        ZStack {
            FondoKepler()
            VStack(alignment: .leading, spacing: Tema.Espacio.lg) {
                Titulo(texto: "¿Cómo fue la misión?").padding(.top, Tema.Espacio.lg)
                Tarjeta {
                    VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                        HStack {
                            Etiqueta(texto: "Esfuerzo")
                            Spacer()
                            Text("\(Int(esfuerzo))/10 · \(ValoracionView.texto(Int(esfuerzo)))")
                                .font(Jura.fuente(Tema.Tamano.cuerpo, .semibold)).foregroundStyle(Tema.Color.acento)
                        }
                        Slider(value: $esfuerzo, in: 1...10, step: 1).tint(Tema.Color.acento)
                    }
                }
                Tarjeta {
                    VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                        Etiqueta(texto: "Cómo terminaste")
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                            ForEach(ValoracionView.sensaciones, id: \.0) { s, simbolo in
                                Button { sensacion = s } label: {
                                    Label(s, systemImage: simbolo).font(Jura.fuente(Tema.Tamano.pequeno, .semibold))
                                        .frame(maxWidth: .infinity, minHeight: 40)
                                        .foregroundStyle(sensacion == s ? Tema.Color.acento : Tema.Color.textoSecundario)
                                        .background(sensacion == s ? Tema.Color.acentoSuave : Tema.Color.superficieInput,
                                                    in: RoundedRectangle(cornerRadius: Tema.Radio.medio))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                Text("Con tus valoraciones KEPLER aprende cuánto te cuesta cada ruta.")
                    .font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.textoTenue)
                Spacer()
                Button("GUARDAR") {
                    try? sesion.nucleo.valorarMision(mision: mision, esfuerzo: UInt8(esfuerzo), sensacion: sensacion)
                    Task { await sesion.sincronizar() }
                    cerrar()
                }
                .buttonStyle(BotonKepler())
                Button("AHORA NO") { cerrar() }.buttonStyle(BotonKepler(principal: false))
            }
            .padding(.horizontal, Tema.Espacio.lg)
            .padding(.bottom, Tema.Espacio.lg)
        }
    }

    static func texto(_ e: Int) -> String {
        switch e {
        case ...2: "muy fácil"
        case 3...4: "fácil"
        case 5...6: "moderado"
        case 7...8: "duro"
        default: "al límite"
        }
    }
}

/// Preparación, zonas de pulso y rendimiento de las últimas misiones.
struct RendimientoView: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var misiones: [RendimientoMision] = []
    @State private var error: String?

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espacio.lg) {
                    Titulo(texto: "Rendimiento").padding(.top, Tema.Espacio.lg)
                    if let e = sesion.estadoFisico {
                        TarjetaZonas(estado: e)
                        TarjetaDias(dias: e.dias)
                    }
                    if let error { Text(error).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.aviso) }
                    if misiones.isEmpty {
                        Tarjeta { Vacio(texto: "Aún no hay misiones con rendimiento. Completa una con el reloj puesto.") }
                    }
                    ForEach(misiones, id: \.misionId) { TarjetaRendimiento(r: $0) }
                }
                .padding(.horizontal, Tema.Espacio.lg)
                .padding(.bottom, Tema.Espacio.xl)
            }
            .refreshable { await cargar() }
        }
        .task { await cargar() }
    }

    private func cargar() async {
        do {
            misiones = try await sesion.nucleo.rendimientos(limite: 20)
            error = nil
        } catch {
            self.error = Sesion.mensaje(error)
        }
        if let e = try? await sesion.nucleo.estadoFisico(desfaseMin: Sesion.desfaseMin) { sesion.estadoFisico = e }
    }
}

private let coloresZona: [Color] = [Tema.Color.textoTenue, Tema.Color.aireBuena, Tema.Color.progresoOk,
                                    Tema.Color.aviso, Tema.Color.airePobre, Tema.Color.peligro]

private struct TarjetaZonas: View {
    let estado: EstadoFisico

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
                CabezaTarjeta(titulo: "Tus zonas de pulso")
                Text("Máximo \(estado.fcMax) lpm\(estado.fcMaxEstimada ? " (estimado; ponlo en Ajustes si lo sabes)" : "") · reposo \(estado.fcReposo) lpm")
                    .font(Jura.fuente(11)).foregroundStyle(Tema.Color.textoTenue)
                ForEach(Array(estado.zonas.enumerated()), id: \.offset) { i, desde in
                    let hasta = i + 1 < estado.zonas.count ? "\(estado.zonas[i + 1] - 1)" : "\(estado.fcMax)"
                    HStack {
                        Circle().fill(coloresZona[i + 1]).frame(width: 8, height: 8)
                        Text("Zona \(i + 1) · \(["suave", "aeróbica", "moderada", "intensa", "máxima"][i])")
                            .font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.textoSecundario)
                        Spacer()
                        Text("\(desde)–\(hasta) lpm").font(Jura.fuente(Tema.Tamano.pequeno, .semibold))
                            .foregroundStyle(Tema.Color.texto)
                    }
                }
            }
        }
    }
}

/// Sueño y carga de los últimos 14 días.
private struct TarjetaDias: View {
    let dias: [DiaSalud]

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
                CabezaTarjeta(titulo: "Últimos 14 días")
                HStack(alignment: .bottom, spacing: 4) {
                    ForEach(dias, id: \.fecha) { d in
                        VStack(spacing: 3) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Tema.Color.acento.opacity(0.75))
                                .frame(height: CGFloat(min(d.suenoH ?? 0, 10) * 7))
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Tema.Color.aviso.opacity(0.8))
                                .frame(height: CGFloat(min(d.carga, 200) / 5))
                            Text(String(d.fecha.suffix(2))).font(Jura.fuente(9)).foregroundStyle(Tema.Color.textoTenue)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 120, alignment: .bottom)
                HStack(spacing: Tema.Espacio.md) {
                    Label("sueño (h)", systemImage: "square.fill").foregroundStyle(Tema.Color.acento)
                    Label("carga de misiones", systemImage: "square.fill").foregroundStyle(Tema.Color.aviso)
                }
                .font(Jura.fuente(10))
            }
        }
    }
}

private struct TarjetaRendimiento: View {
    let r: RendimientoMision

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
                HStack {
                    Text(r.titulo ?? r.codigo).font(Jura.fuente(Tema.Tamano.cuerpo, .semibold)).foregroundStyle(Tema.Color.texto)
                    Spacer()
                    Text(Fecha.corta(r.inicio)).font(Jura.fuente(11)).foregroundStyle(Tema.Color.textoTenue)
                }
                HStack(spacing: Tema.Espacio.sm) {
                    Mini(nombre: "km", valor: String(format: "%.1f", r.distanciaKm))
                    Mini(nombre: "min", valor: String(format: "%.0f", r.duracionMin))
                    Mini(nombre: "desnivel", valor: String(format: "+%.0f m", r.desnivelPosM))
                    Mini(nombre: "carga", valor: String(format: "%.0f", r.trimp))
                }
                if let m = r.fcMedia {
                    Text("Pulso medio \(Int(m)) · máx \(Int(r.fcMax ?? m)) lpm\(r.spo2Min.map { " · SpO2 mín \(Int($0)) %" } ?? "")")
                        .font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.textoSecundario)
                }
                let total = r.zonasMin.reduce(0, +)
                if total > 0 {
                    GeometryReader { g in
                        HStack(spacing: 1) {
                            ForEach(Array(r.zonasMin.enumerated()), id: \.offset) { i, m in
                                Rectangle().fill(coloresZona[i]).frame(width: g.size.width * CGFloat(m / total))
                            }
                        }
                    }
                    .frame(height: 8)
                    .clipShape(Capsule())
                }
                HStack {
                    if let p = r.preparacion {
                        Text("Preparación al salir: \(p)").font(Jura.fuente(11)).foregroundStyle(Tema.Color.textoTenue)
                    }
                    Spacer()
                    if let e = r.esfuerzo {
                        Text("Esfuerzo \(e)/10\(r.sensacion.map { " · \($0)" } ?? "")")
                            .font(Jura.fuente(11, .semibold)).foregroundStyle(Tema.Color.acento)
                    }
                }
            }
        }
    }
}

/// Ajustes: edad, peso, sexo y pulsos (para zonas, carga y Preparación).
struct TarjetaPerfilFisico: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var edad = ""
    @State private var peso = ""
    @State private var sexo = ""
    @State private var fcMax = ""
    @State private var fcReposo = ""
    @State private var mensaje: String?

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                Etiqueta(texto: "Perfil físico")
                HStack(spacing: Tema.Espacio.md) {
                    CampoKepler(etiqueta: "Edad", texto: $edad, marcador: "años").keyboardType(.numberPad)
                    CampoKepler(etiqueta: "Peso", texto: $peso, marcador: "kg").keyboardType(.decimalPad)
                }
                Picker("Sexo", selection: $sexo) {
                    Text("Sin indicar").tag("")
                    Text("Hombre").tag("hombre")
                    Text("Mujer").tag("mujer")
                }
                .pickerStyle(.segmented)
                HStack(spacing: Tema.Espacio.md) {
                    CampoKepler(etiqueta: "Pulso máx.", texto: $fcMax, marcador: "opcional").keyboardType(.numberPad)
                    CampoKepler(etiqueta: "Pulso reposo", texto: $fcReposo, marcador: "opcional").keyboardType(.numberPad)
                }
                Text("Lo que no pongas se estima con tu edad y lo que mide el reloj.")
                    .font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.textoTenue)
                Button("GUARDAR") { Task { await guardar() } }.buttonStyle(BotonKepler())
                if let mensaje {
                    Text(mensaje).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.aviso)
                }
            }
        }
        .task {
            guard let f = try? await sesion.nucleo.fisico() else { return }
            edad = f.edad.map { "\($0)" } ?? ""
            peso = f.pesoKg.map { String(format: "%.0f", $0) } ?? ""
            sexo = f.sexo ?? ""
            fcMax = f.fcMax.map { "\($0)" } ?? ""
            fcReposo = f.fcReposo.map { "\($0)" } ?? ""
        }
    }

    private func guardar() async {
        let f = PerfilFisicoMovil(edad: UInt8(edad), pesoKg: Double(peso.replacingOccurrences(of: ",", with: ".")),
                                  alturaCm: nil, sexo: sexo.isEmpty ? nil : sexo,
                                  fcMax: UInt16(fcMax), fcReposo: UInt16(fcReposo))
        do {
            _ = try await sesion.nucleo.guardarFisico(fisico: f)
            mensaje = "Guardado."
            await sesion.cargarPanel()
        } catch {
            mensaje = Sesion.mensaje(error)
        }
    }
}
