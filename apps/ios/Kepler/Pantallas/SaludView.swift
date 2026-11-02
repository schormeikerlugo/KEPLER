import SwiftUI

/// Salud y reloj: qué llega a Apple Salud (y de qué app), los sensores del
/// iPhone, el estado de ánimo y el explorador Bluetooth del reloj.
struct SaludView: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var resumen: [ResumenBio] = []
    @State private var filas: [Salud.Fila] = []
    @State private var analizando = false
    @State private var aviso: String?

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espacio.lg) {
                    Titulo(texto: "Salud y reloj").padding(.top, Tema.Espacio.lg)
                    tarjetaSalud
                    if !resumen.isEmpty { tarjetaResumen }
                    tarjetaAnimo
                    TarjetaSensores(sensores: sesion.sensores)
                    TarjetaReloj(reloj: sesion.reloj)
                    if let aviso {
                        Text(aviso).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.aviso)
                    }
                }
                .padding(.horizontal, Tema.Espacio.lg)
                .padding(.bottom, Tema.Espacio.xl)
            }
        }
        .onAppear { sesion.sensores.empezar() }
        .onDisappear { if sesion.mision == nil { sesion.sensores.parar() } }
        .task { await cargarResumen() }
        #if DEBUG
        .task {
            // Prueba en el iPhone: KEPLER_SALUD=1 analiza Salud y busca el reloj al abrir
            if ProcessInfo.processInfo.environment["KEPLER_SALUD"] == "1" {
                await analizar()
                sesion.reloj.encender()
            }
        }
        #endif
    }

    // MARK: Apple Salud

    private var tarjetaSalud: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                Etiqueta(texto: "Apple Salud · últimos 7 días")
                if !Salud.disponible {
                    Text("Salud no está disponible en este dispositivo.").font(Jura.fuente(Tema.Tamano.pequeno))
                        .foregroundStyle(Tema.Color.textoTenue)
                }
                ForEach(filas) { f in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(f.nombre).font(Jura.fuente(Tema.Tamano.cuerpo, .semibold))
                                .foregroundStyle(f.muestras7d > 0 ? Tema.Color.texto : Tema.Color.textoTenue)
                            Text(f.fuentes.isEmpty ? "sin datos" : f.fuentes.joined(separator: ", "))
                                .font(Jura.fuente(11)).foregroundStyle(Tema.Color.textoTenue)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(f.ultimoValor ?? "—").font(Jura.fuente(Tema.Tamano.cuerpo))
                                .foregroundStyle(Tema.Color.acento)
                            Text("\(f.muestras7d) muestras").font(Jura.fuente(11)).foregroundStyle(Tema.Color.textoTenue)
                        }
                    }
                }
                Button(analizando ? "ANALIZANDO…" : (filas.isEmpty ? "PERMITIR Y ANALIZAR" : "VOLVER A ANALIZAR")) {
                    Task { await analizar() }
                }
                .buttonStyle(BotonKepler())
                .disabled(analizando || !Salud.disponible)
            }
        }
    }

    private func analizar() async {
        analizando = true
        defer { analizando = false }
        do {
            try await sesion.salud.pedirPermiso()
            filas = await sesion.salud.diagnostico()
            guardarDiagnostico()
            Salud.activa = true
            await sesion.importarSalud(ya: true)
            await sesion.sincronizar()
            await cargarResumen()
        } catch {
            aviso = "Salud: \(error.localizedDescription)"
        }
    }

    /// Documentos/reloj/salud.json, para revisarlo desde el Mac.
    private func guardarDiagnostico() {
        let c = JSONEncoder()
        c.outputFormatting = [.prettyPrinted, .sortedKeys]
        c.dateEncodingStrategy = .iso8601
        guard let datos = try? c.encode(filas) else { return }
        try? FileManager.default.createDirectory(at: Reloj.carpeta, withIntermediateDirectories: true)
        try? datos.write(to: Reloj.carpeta.appendingPathComponent("salud.json"))
    }

    // MARK: Resumen en la base

    private func cargarResumen() async {
        if let r = try? await sesion.nucleo.biometriaResumen(dias: 7, mision: nil) { resumen = r }
    }

    private var tarjetaResumen: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                HStack {
                    Etiqueta(texto: "En la base · 7 días")
                    Spacer()
                    if let n = sesion.sync?.biometria, n > 0 {
                        Text("\(n) por enviar").font(Jura.fuente(11)).foregroundStyle(Tema.Color.aviso)
                    }
                }
                ForEach(resumen, id: \.tipo) { r in
                    Dato(nombre: SaludView.nombre(r.tipo), valor: SaludView.texto(r))
                }
            }
        }
    }

    static func nombre(_ tipo: String) -> String {
        Salud.tipos.first { $0.clave == tipo }?.nombre
            ?? ["presion": "Presión (barómetro)", "altitud": "Altitud (barómetro)", "estres": "Estrés (reloj)",
                "animo_reloj": "Ánimo (reloj)"][tipo] ?? tipo
    }

    static func texto(_ r: ResumenBio) -> String {
        func f(_ v: Double?) -> String {
            guard let v else { return "—" }
            return v >= 100 ? String(format: "%.0f", v) : String(format: "%.1f", v)
        }
        if r.porDia { return "hoy \(f(r.hoy)) · media \(f(r.media)) \(r.unidad)/día" }
        if r.tipo == "animo" {
            let e = ["😣", "🙁", "😐", "🙂", "😄"][min(4, max(0, Int((((r.ultimo ?? 0) + 1) * 2).rounded())))]
            return "\(e) · media \(f(r.media)) (-1 a 1)"
        }
        if r.tipo == "sueno" { return "última noche \(f(r.ultimo)) h · media \(f(r.media)) h" }
        return "\(f(r.ultimo)) \(r.unidad) · \(f(r.minimo))–\(f(r.maximo))"
    }

    // MARK: Estado de ánimo

    private var tarjetaAnimo: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                Etiqueta(texto: "¿Cómo te sientes?")
                HStack(spacing: Tema.Espacio.sm) {
                    ForEach([("😣", -1.0), ("🙁", -0.5), ("😐", 0.0), ("🙂", 0.5), ("😄", 1.0)], id: \.1) { e, v in
                        Button {
                            Task {
                                do {
                                    try await sesion.salud.registrarAnimo(valencia: v)
                                    aviso = "Estado de ánimo guardado en Salud."
                                } catch {
                                    aviso = "Ánimo: \(error.localizedDescription)"
                                }
                            }
                        } label: {
                            Text(e).font(.system(size: 28)).frame(maxWidth: .infinity, minHeight: 48)
                                .background(Tema.Color.superficieInput, in: RoundedRectangle(cornerRadius: Tema.Radio.medio))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

private struct Dato: View {
    let nombre: String
    let valor: String?

    var body: some View {
        HStack {
            Text(nombre).font(Jura.fuente(Tema.Tamano.pequeno)).foregroundStyle(Tema.Color.textoTenue)
            Spacer()
            Text(valor ?? "—").font(Jura.fuente(Tema.Tamano.cuerpo, .semibold)).foregroundStyle(Tema.Color.texto)
        }
    }
}

/// Sensores del iPhone (se observan aparte: viven en la sesión).
private struct TarjetaSensores: View {
    @ObservedObject var sensores: Sensores

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                Etiqueta(texto: "Sensores del iPhone")
                Dato(nombre: "Presión", valor: sensores.altitud.presion.map { String(format: "%.1f hPa", $0) })
                Dato(nombre: "Altitud", valor: sensores.altitud.absoluta.map {
                    String(format: "%.0f m ± %.0f", $0, sensores.altitud.precision ?? 0)
                })
                Dato(nombre: "Desnivel desde que abriste", valor: sensores.altitud.relativa.map { String(format: "%+.1f m", $0) })
                Dato(nombre: "Pasos hoy", valor: sensores.hoy.map { "\($0.pasos)" })
                Dato(nombre: "Distancia hoy", valor: sensores.hoy?.distancia.map { String(format: "%.2f km", $0 / 1000) })
                Dato(nombre: "Pisos hoy", valor: sensores.hoy.map { "↑\($0.pisosSubidos ?? 0) ↓\($0.pisosBajados ?? 0)" })
                if let e = sensores.error {
                    Text(e).font(Jura.fuente(11)).foregroundStyle(Tema.Color.aviso)
                }
            }
        }
    }
}

/// Reloj Bluetooth: lo que se descifra del Carbinox y el explorador GATT.
private struct TarjetaReloj: View {
    @ObservedObject var reloj: Reloj

    var body: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                HStack {
                    Etiqueta(texto: "Reloj Bluetooth")
                    Spacer()
                    Pastilla(texto: reloj.estado, tono: reloj.conectado != nil ? Tema.Color.exito : Tema.Color.acento)
                }
                if let c = reloj.conectado {
                    Text(c.nombre).font(Jura.fuente(Tema.Tamano.tituloTarjeta, .semibold)).foregroundStyle(Tema.Color.texto)
                    HStack(spacing: Tema.Espacio.lg) {
                        Dato(nombre: "Pulso", valor: reloj.pulso.map { "\($0) lpm" })
                        Dato(nombre: "Batería", valor: reloj.bateria.map { "\($0) %" })
                    }
                    if reloj.tieneClave {
                        HStack(spacing: Tema.Espacio.lg) {
                            Dato(nombre: "SpO2", valor: reloj.ultimos["spo2"].map { String(format: "%.0f %%", $0) })
                            Dato(nombre: "Estrés", valor: reloj.ultimos["estres"].map { String(format: "%.0f", $0) })
                        }
                        Text("Descifradas: \(reloj.descifradas) tramas")
                            .font(Jura.fuente(11)).foregroundStyle(Tema.Color.textoTenue)
                    } else {
                        Text("Sin cuenta Carbinox: Ajustes › Reloj Carbinox para descifrar los datos.")
                            .font(Jura.fuente(11)).foregroundStyle(Tema.Color.aviso)
                    }
                    ForEach(reloj.caracteristicas) { c in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(c.servicio) / \(c.uuid)  [\(c.propiedades)]  ·\(c.mensajes)")
                                .font(.system(size: 10, design: .monospaced)).foregroundStyle(Tema.Color.textoSecundario)
                            if let v = c.valor {
                                Text(v).font(.system(size: 10, design: .monospaced)).foregroundStyle(Tema.Color.acento)
                                    .lineLimit(2)
                            }
                        }
                    }
                    if let r = reloj.registro {
                        Text("Registro: Archivos › KEPLER › reloj › \(r.lastPathComponent)")
                            .font(Jura.fuente(11)).foregroundStyle(Tema.Color.textoTenue)
                    }
                    HStack(spacing: Tema.Espacio.md) {
                        Button("PROBAR PROTOCOLO") { reloj.probarProtocolo() }.buttonStyle(BotonKepler())
                        Button("DESCONECTAR") { reloj.desconectar() }.buttonStyle(BotonKepler(principal: false))
                    }
                    ForEach(reloj.lineas.suffix(12), id: \.self) { l in
                        Text(l.dropFirst(11)).font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(Tema.Color.textoTenue).lineLimit(2)
                    }
                } else {
                    ForEach(reloj.vistos.prefix(25)) { v in
                        Button { reloj.conectar(v) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(v.nombre).font(Jura.fuente(Tema.Tamano.cuerpo, .semibold))
                                        .foregroundStyle(v.conectado ? Tema.Color.exito : Tema.Color.texto)
                                    if let pl = v.plataforma {
                                        Text("Plataforma YC/UTE: \(pl)").font(Jura.fuente(11)).foregroundStyle(Tema.Color.acento)
                                    }
                                    if !v.servicios.isEmpty {
                                        Text(v.servicios.joined(separator: " ")).font(.system(size: 10, design: .monospaced))
                                            .foregroundStyle(Tema.Color.textoTenue).lineLimit(1)
                                    }
                                }
                                Spacer()
                                Text(v.conectado ? "conectado" : v.rssi.map { "\($0) dBm" } ?? "")
                                    .font(Jura.fuente(11)).foregroundStyle(Tema.Color.textoTenue)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    Button("BUSCAR RELOJ") { reloj.encender() }.buttonStyle(BotonKepler())
                    Text("Si el reloj ya está conectado a Carbinox Max aparece en verde: KEPLER escucha la misma conexión.")
                        .font(Jura.fuente(11)).foregroundStyle(Tema.Color.textoTenue)
                }
            }
        }
    }
}
