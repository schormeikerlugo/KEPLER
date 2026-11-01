import SwiftUI

struct PanelView: View {
    @EnvironmentObject private var sesion: Sesion

    var body: some View {
        ZStack {
            FondoKepler()
            ScrollView {
                VStack(spacing: Tema.Espacio.lg) {
                    cabecera
                    estado
                    if let r = sesion.resumen {
                        resumen(r)
                    } else {
                        Tarjeta { ProgressView().frame(maxWidth: .infinity) }
                    }
                }
                .padding(.horizontal, Tema.Espacio.lg)
                .padding(.vertical, Tema.Espacio.md)
            }
            .refreshable { await sesion.cargar() }
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
            Text(sesion.perfil?.avatarIa ?? "🤖")
                .font(.system(size: 22))
                .frame(width: 44, height: 44)
                .background(Tema.Color.acentoSuave, in: Circle())
                .overlay(Circle().stroke(Tema.Color.acentoBorde, lineWidth: 1))
        }
        .padding(.top, Tema.Espacio.sm)
    }

    private var estado: some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: Tema.Espacio.md) {
                Titulo(texto: "Base")
                let s = sesion.servidorEstado
                FilaEstado(nombre: "Servidor", ok: s?.enLinea,
                           detalle: s.map { $0.enLinea ? "\($0.latenciaMs) ms" : "sin conexión" } ?? "…")
                FilaEstado(nombre: "Cortex (IA)", ok: s.map { $0.enLinea && $0.ia },
                           detalle: s.map { $0.ia ? "disponible" : "no disponible" } ?? "…")
                FilaEstado(nombre: "Visión", ok: s.map { $0.enLinea && $0.vision },
                           detalle: s.map { $0.vision ? "YOLO + CLIP" : "no disponible" } ?? "…")
            }
        }
    }

    private func resumen(_ r: Resumen) -> some View {
        VStack(spacing: Tema.Espacio.md) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: Tema.Espacio.md), GridItem(.flexible())],
                      spacing: Tema.Espacio.md) {
                Indicador(etiqueta: "Misiones", valor: r.misiones, detalle: r.misionesActivas > 0 ? "\(r.misionesActivas) activa" : nil)
                Indicador(etiqueta: "Objetos", valor: r.objetos)
                Indicador(etiqueta: "Personas", valor: r.personas)
                Indicador(etiqueta: "POIs", valor: r.puntosInteres)
                Indicador(etiqueta: "Rutas", valor: r.rutas)
                Indicador(etiqueta: "De otros", valor: r.reportesCompartidos)
            }
            if r.avisos > 0 {
                Tarjeta {
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Tema.Color.aviso)
                        Text("\(r.avisos) \(r.avisos == 1 ? "cosa requiere" : "cosas requieren") atención")
                            .font(Jura.fuente(Tema.Tamano.cuerpo))
                            .foregroundStyle(Tema.Color.textoSecundario)
                    }
                }
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
            let tono = ok == nil ? Tema.Color.textoEtiqueta : (ok! ? Tema.Color.exito : Tema.Color.peligro)
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

struct Indicador: View {
    let etiqueta: String
    let valor: UInt32
    var detalle: String?

    var body: some View {
        Tarjeta(relleno: Tema.Espacio.lg) {
            VStack(alignment: .leading, spacing: 6) {
                Etiqueta(texto: etiqueta)
                Text("\(valor)")
                    .font(Jura.fuente(Tema.Tamano.valor, .semibold))
                    .foregroundStyle(Tema.Color.texto)
                Text(detalle ?? " ")
                    .font(Jura.fuente(Tema.Tamano.etiqueta))
                    .foregroundStyle(Tema.Color.exito)
            }
        }
    }
}
