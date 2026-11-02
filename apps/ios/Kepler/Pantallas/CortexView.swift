import SwiftUI

/// Puente de la respuesta en streaming de Cortex (Rust llama desde su hilo).
final class OyenteVista: OyenteCortex, @unchecked Sendable {
    private let alEstado: @MainActor (String) -> Void
    private let alTexto: @MainActor (String) -> Void

    init(estado: @escaping @MainActor (String) -> Void, texto: @escaping @MainActor (String) -> Void) {
        alEstado = estado
        alTexto = texto
    }

    func estado(texto: String) { Task { @MainActor in alEstado(texto) } }
    func texto(acumulado: String) { Task { @MainActor in alTexto(acumulado) } }
}

/// Chat con Cortex, la IA local de la base (necesita conexión).
struct CortexView: View {
    @EnvironmentObject private var sesion: Sesion
    @State private var chatId: String?
    @State private var titulo = "Cortex"
    @State private var mensajes: [MensajeCortex] = []
    @State private var respuesta: String?
    @State private var estado = ""
    @State private var error: String?
    @State private var entrada = ""
    @State private var historial = false
    @FocusState private var escribiendo: Bool

    var body: some View {
        ZStack {
            FondoKepler()
            VStack(spacing: 0) {
                cabecera
                ScrollViewReader { desplazar in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: Tema.Espacio.md) {
                            if mensajes.isEmpty && respuesta == nil { bienvenida }
                            ForEach(Array(mensajes.enumerated()), id: \.offset) { _, m in
                                Burbuja(rol: m.rol, texto: m.texto, avatar: sesion.perfil?.avatarIa ?? "🤖")
                            }
                            if let respuesta {
                                Burbuja(rol: "assistant", texto: respuesta.isEmpty ? "…" : respuesta,
                                        avatar: sesion.perfil?.avatarIa ?? "🤖")
                            }
                            if !estado.isEmpty {
                                Text(estado)
                                    .font(Jura.fuente(Tema.Tamano.pequeno))
                                    .foregroundStyle(Tema.Color.acento)
                            }
                            if let error {
                                Text("⚠ \(error)")
                                    .font(Jura.fuente(Tema.Tamano.pequeno))
                                    .foregroundStyle(Tema.Color.peligro)
                            }
                            Color.clear.frame(height: 1).id("fin")
                        }
                        .padding(Tema.Espacio.lg)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: respuesta) { _, _ in desplazar.scrollTo("fin", anchor: .bottom) }
                    .onChange(of: mensajes.count) { _, _ in desplazar.scrollTo("fin", anchor: .bottom) }
                }
                barraEntrada
            }
        }
        .sheet(isPresented: $historial) {
            HistorialCortex { id, t in Task { await abrir(id, titulo: t) } } nuevo: { nuevo() }
                .presentationDetents([.medium, .large])
        }
        #if DEBUG
        .task {
            if let p = ProcessInfo.processInfo.environment["KEPLER_DEMO_PREGUNTA"], !p.isEmpty, mensajes.isEmpty {
                entrada = p
                await enviar()
            }
        }
        #endif
    }

    private var cabecera: some View {
        HStack(spacing: Tema.Espacio.md) {
            Text(sesion.perfil?.avatarIa ?? "🤖").font(.system(size: 24))
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .font(Jura.fuente(Tema.Tamano.tituloTarjeta, .semibold))
                    .foregroundStyle(Tema.Color.texto)
                    .lineLimit(1)
                Etiqueta(texto: "IA local · nada sale a internet")
            }
            Spacer()
            Button { nuevo() } label: { Image(systemName: "square.and.pencil") }
            Button { historial = true } label: { Image(systemName: "clock.arrow.circlepath") }
        }
        .font(.system(size: 18))
        .foregroundStyle(Tema.Color.acento)
        .padding(.horizontal, Tema.Espacio.lg)
        .padding(.vertical, Tema.Espacio.md)
    }

    private var bienvenida: some View {
        VStack(alignment: .leading, spacing: Tema.Espacio.md) {
            Text("Pregúntale por tus misiones, hallazgos, peligros cercanos o el clima.")
                .font(Jura.fuente(Tema.Tamano.cuerpo))
                .foregroundStyle(Tema.Color.textoTenue)
            ForEach(["¿Hay peligros cerca de mí?", "Resume mi última misión", "¿Qué tiempo hace aquí?"], id: \.self) { s in
                Button { entrada = s; Task { await enviar() } } label: {
                    Text(s)
                        .font(Jura.fuente(Tema.Tamano.pequeno))
                        .foregroundStyle(Tema.Color.acento)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Tema.Color.acentoSuave, in: Capsule())
                        .overlay(Capsule().stroke(Tema.Color.acentoBorde, lineWidth: 1))
                }
            }
        }
        .padding(.top, Tema.Espacio.xl)
    }

    private var barraEntrada: some View {
        HStack(spacing: Tema.Espacio.sm) {
            TextField("Escribe a Cortex…", text: $entrada, axis: .vertical)
                .lineLimit(1...4)
                .focused($escribiendo)
                .font(Jura.fuente(15))
                .foregroundStyle(Tema.Color.texto)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: Tema.Radio.medio))
                .overlay(RoundedRectangle(cornerRadius: Tema.Radio.medio)
                    .stroke(escribiendo ? Tema.Color.bordeHolo : Tema.Color.bordeTenue, lineWidth: 1))
            Button { Task { await enviar() } } label: {
                Image(systemName: respuesta == nil ? "arrow.up" : "ellipsis")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.black)
                    .frame(width: 44, height: 44)
                    .background(Tema.Color.acento, in: Circle())
            }
            .disabled(respuesta != nil || entrada.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, Tema.Espacio.md)
        .padding(.vertical, Tema.Espacio.sm)
    }

    private func enviar() async {
        let texto = entrada.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !texto.isEmpty, respuesta == nil else { return }
        entrada = ""
        error = nil
        mensajes.append(MensajeCortex(rol: "user", texto: texto, en: Int64(Date().timeIntervalSince1970)))
        respuesta = ""
        estado = "Cortex está pensando…"
        let oyente = OyenteVista(estado: { estado = $0 }, texto: { respuesta = $0 })
        let p = await sesion.ubicacion.actual()
        do {
            let fin = try await sesion.nucleo.cortexEnviar(chatId: chatId, mensaje: texto, lat: p?.latitude,
                                                          lng: p?.longitude, oyente: oyente)
            mensajes.append(MensajeCortex(rol: "assistant", texto: fin.texto, en: Int64(Date().timeIntervalSince1970)))
            chatId = fin.chatId ?? chatId
            if let t = fin.titulo { titulo = t }
            estado = String(format: "Respondido en %.1f s", fin.segundos)
        } catch {
            self.error = Sesion.mensaje(error)
            estado = ""
        }
        respuesta = nil
    }

    private func abrir(_ id: String, titulo t: String) async {
        do {
            mensajes = try await sesion.nucleo.cortexChat(id: id)
            chatId = id
            titulo = t
            estado = ""
            error = nil
        } catch {
            self.error = Sesion.mensaje(error)
        }
    }

    private func nuevo() {
        chatId = nil
        titulo = "Cortex"
        mensajes = []
        estado = ""
        error = nil
    }
}

private struct Burbuja: View {
    let rol: String
    let texto: String
    let avatar: String

    var body: some View {
        if rol == "user" {
            HStack {
                Spacer(minLength: 48)
                Text(texto)
                    .font(Jura.fuente(Tema.Tamano.cuerpo))
                    .foregroundStyle(Tema.Color.texto)
                    .padding(12)
                    .background(Tema.Color.acentoSuave, in: RoundedRectangle(cornerRadius: Tema.Radio.tarjeta))
                    .overlay(RoundedRectangle(cornerRadius: Tema.Radio.tarjeta).stroke(Tema.Color.acentoBorde, lineWidth: 1))
            }
        } else {
            HStack(alignment: .top, spacing: Tema.Espacio.sm) {
                Text(avatar).font(.system(size: 18))
                    .frame(width: 32, height: 32)
                    .background(Tema.Color.acentoSuave, in: Circle())
                MarkdownCortex(texto: texto)
                    .padding(12)
                    .background(Tema.Color.superficie, in: RoundedRectangle(cornerRadius: Tema.Radio.tarjeta))
                    .overlay(RoundedRectangle(cornerRadius: Tema.Radio.tarjeta).stroke(Tema.Color.bordeSutil, lineWidth: 1))
            }
        }
    }
}

private struct HistorialCortex: View {
    @EnvironmentObject private var sesion: Sesion
    @Environment(\.dismiss) private var cerrar
    let abrir: (String, String) -> Void
    let nuevo: () -> Void
    @State private var chats: [ChatResumen]?
    @State private var error: String?

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
                    HStack {
                        Titulo(texto: "Conversaciones")
                        Spacer()
                        Button("NUEVA") { nuevo(); cerrar() }
                            .font(Jura.fuente(Tema.Tamano.pequeno, .semibold))
                            .foregroundStyle(Tema.Color.acento)
                    }
                    .padding(.vertical, Tema.Espacio.md)
                    if let error { Vacio(texto: "⚠ \(error)") }
                    if chats?.isEmpty == true { Vacio(texto: "Aún no hay conversaciones.") }
                    ForEach(chats ?? [], id: \.id) { c in
                        HStack {
                            Button { abrir(c.id, c.titulo); cerrar() } label: {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(c.titulo)
                                        .font(Jura.fuente(Tema.Tamano.cuerpo))
                                        .foregroundStyle(Tema.Color.texto)
                                        .lineLimit(1)
                                    Etiqueta(texto: "\(Fecha.corta(c.actualizadoEn)) · \(c.mensajes) mensajes",
                                             color: Tema.Color.textoEtiqueta)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            Button {
                                Task {
                                    try? await sesion.nucleo.cortexBorrar(id: c.id)
                                    chats?.removeAll { $0.id == c.id }
                                }
                            } label: {
                                Image(systemName: "trash").foregroundStyle(Tema.Color.textoTenue)
                            }
                        }
                        .padding(.vertical, 8)
                    }
                }
                .padding(.horizontal, Tema.Espacio.lg)
            }
        }
        .task {
            do { chats = try await sesion.nucleo.cortexChats() } catch { self.error = Sesion.mensaje(error) }
        }
    }
}
