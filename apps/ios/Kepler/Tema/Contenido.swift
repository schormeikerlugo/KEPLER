import SwiftUI
import UIKit

/// Colores de los estados que llegan del núcleo.
extension Nivel {
    var color: Color {
        switch self {
        case .bien: Tema.Color.exito
        case .aviso: Tema.Color.aviso
        case .peligro: Tema.Color.peligro
        case .sinDato: Tema.Color.textoEtiqueta
        }
    }
}

enum Tono {
    /// Hostilidad de personas, riesgo de POIs, seguridad de rutas, estado de misiones.
    static func de(_ nivel: String) -> Color {
        switch nivel {
        case "hostil", "critico", "peligro", "abortada": Tema.Color.peligro
        case "alto": Color(hex: "#FF8844")
        case "medio", "precaucion", "planificada": Tema.Color.aviso
        case "aliado", "bajo", "seguro", "activa": Tema.Color.exito
        case "neutral": Tema.Color.acento
        default: Color(hex: "#999999")
        }
    }

    /// Texto legible: `critico` → `crítico`, `precaucion` → `precaución`.
    static func texto(_ nivel: String) -> String {
        switch nivel {
        case "critico": "crítico"
        case "precaucion": "precaución"
        case "montana": "montaña"
        default: nivel
        }
    }
}

enum Fecha {
    private static let formato: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es")
        f.dateFormat = "dd/MM · HH:mm"
        return f
    }()

    static func corta(_ segundos: Int64) -> String {
        segundos == 0 ? "—" : formato.string(from: Date(timeIntervalSince1970: TimeInterval(segundos)))
    }
}

/// Markdown de Cortex: títulos (`#`), viñetas (`-`, `*`) y párrafos; el énfasis en línea lo interpreta SwiftUI.
struct MarkdownCortex: View {
    let texto: String

    var body: some View {
        VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
            ForEach(Array(lineas.enumerated()), id: \.offset) { _, l in
                switch l.tipo {
                case 1:
                    Text(l.texto)
                        .font(Jura.fuente(16, .semibold))
                        .foregroundStyle(Tema.Color.texto)
                        .padding(.top, Tema.Espacio.sm)
                case 2:
                    HStack(alignment: .firstTextBaseline, spacing: Tema.Espacio.sm) {
                        Text("▸").foregroundStyle(Tema.Color.acento)
                        Text(enLinea(l.texto))
                    }
                    .font(Jura.fuente(Tema.Tamano.cuerpo))
                    .foregroundStyle(Tema.Color.textoSecundario)
                default:
                    Text(enLinea(l.texto))
                        .font(Jura.fuente(Tema.Tamano.cuerpo))
                        .foregroundStyle(Tema.Color.textoSecundario)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var lineas: [(texto: String, tipo: Int)] {
        texto.split(separator: "\n").compactMap { crudo in
            let l = crudo.trimmingCharacters(in: .whitespaces)
            if l.isEmpty || l.allSatisfy({ "-*_".contains($0) }) { return nil }
            if l.hasPrefix("#") { return (l.drop(while: { $0 == "#" }).trimmingCharacters(in: .whitespaces), 1) }
            for p in ["- ", "* ", "• ", "+ "] where l.hasPrefix(p) {
                return (String(l.dropFirst(p.count)).trimmingCharacters(in: .whitespaces), 2)
            }
            return (l, 0)
        }
    }

    private func enLinea(_ s: String) -> AttributedString {
        (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
            ?? AttributedString(s)
    }
}

/// Foto de Storage pedida por el núcleo (con sesión), reducida y en caché.
struct ImagenRemota: View {
    @EnvironmentObject private var sesion: Sesion
    let ruta: String?
    var lado: CGFloat = 96
    /// Símbolo mientras no hay foto.
    var simbolo = "person.fill"
    /// Entera (sin recortar), para verla a pantalla completa.
    var entera = false
    @State private var imagen: UIImage?

    private static let cache = NSCache<NSString, UIImage>()

    var body: some View {
        ZStack {
            (entera ? Color.black : Tema.Color.superficieElevada)
            if let imagen {
                if entera {
                    Image(uiImage: imagen).resizable().scaledToFit()
                } else {
                    Image(uiImage: imagen).resizable().scaledToFill()
                }
            } else {
                Image(systemName: simbolo).foregroundStyle(Tema.Color.textoEtiqueta)
            }
        }
        .task(id: ruta) { await cargar() }
    }

    private func cargar() async {
        guard let ruta else { return }
        let clave = "\(ruta)@\(Int(lado))" as NSString
        if let c = Self.cache.object(forKey: clave) {
            imagen = c
            return
        }
        guard let datos = try? await sesion.nucleo.imagen(ruta: ruta), let img = UIImage(data: datos) else { return }
        let escala = UIScreen.main.scale
        let reducida = await img.byPreparingThumbnail(ofSize: CGSize(width: lado * escala, height: lado * escala)) ?? img
        Self.cache.setObject(reducida, forKey: clave)
        imagen = reducida
    }
}
