import SwiftUI

extension Color {
    /// `#RRGGBB` o `#RRGGBBAA` (como en design/tokens.json).
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var v: UInt64 = 0
        Scanner(string: h).scanHexInt64(&v)
        let (r, g, b, a): (UInt64, UInt64, UInt64, UInt64) = h.count == 8
            ? (v >> 24 & 0xFF, v >> 16 & 0xFF, v >> 8 & 0xFF, v & 0xFF)
            : (v >> 16 & 0xFF, v >> 8 & 0xFF, v & 0xFF, 0xFF)
        self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: Double(a) / 255)
    }
}

/// Jura, la tipografía de KEPLER (incluida en el bundle).
enum Jura {
    static func fuente(_ tamano: CGFloat, _ peso: Font.Weight = .regular) -> Font {
        let nombre = switch peso {
        case .bold, .heavy, .black: "Jura-Bold"
        case .semibold: "Jura-SemiBold"
        case .medium: "Jura-Medium"
        default: "Jura-Regular"
        }
        return .custom(nombre, size: tamano)
    }
}

/// Tarjeta holográfica: superficie oscura, borde azul tenue y radio de tarjeta.
struct Tarjeta<Contenido: View>: View {
    var relleno: CGFloat = Tema.Espacio.lg
    @ViewBuilder var contenido: Contenido

    var body: some View {
        contenido
            .padding(relleno)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Tema.Color.superficie, in: RoundedRectangle(cornerRadius: Tema.Radio.tarjeta))
            .overlay(RoundedRectangle(cornerRadius: Tema.Radio.tarjeta).stroke(Tema.Color.bordeHoloSutil, lineWidth: 1))
    }
}

/// Etiqueta en mayúsculas con espaciado (como `.label` de la PWA).
struct Etiqueta: View {
    let texto: String
    var color: Color = Tema.Color.textoTenue

    var body: some View {
        Text(texto.uppercased())
            .font(Jura.fuente(Tema.Tamano.etiqueta, .semibold))
            .tracking(Tema.Espaciado.etiqueta)
            .foregroundStyle(color)
    }
}

struct Titulo: View {
    let texto: String

    var body: some View {
        Text(texto)
            .font(Jura.fuente(Tema.Tamano.tituloTarjeta, .semibold))
            .tracking(Tema.Espaciado.titulo)
            .foregroundStyle(Tema.Color.texto)
    }
}

/// Logo «KEPLER» con brillo.
struct Logo: View {
    var tamano: CGFloat = Tema.Tamano.logo

    var body: some View {
        Text("KEPLER")
            .font(Jura.fuente(tamano, .semibold))
            .tracking(tamano * 0.43)
            .foregroundStyle(Tema.Color.texto)
            .shadow(color: .white.opacity(0.35), radius: 10)
    }
}

struct Pastilla: View {
    let texto: String
    var tono: Color = Tema.Color.acento

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(tono).frame(width: 6, height: 6).shadow(color: tono.opacity(0.7), radius: 4)
            Text(texto.uppercased())
                .font(Jura.fuente(Tema.Tamano.etiqueta, .semibold))
                .tracking(1)
                .foregroundStyle(tono)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(tono.opacity(0.10), in: Capsule())
        .overlay(Capsule().stroke(tono.opacity(0.35), lineWidth: 1))
    }
}

/// Botón principal (acento) o secundario (contorno).
struct BotonKepler: ButtonStyle {
    var principal = true
    @Environment(\.isEnabled) private var activo

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Jura.fuente(Tema.Tamano.cuerpo, .semibold))
            .tracking(1.5)
            .foregroundStyle(principal ? Tema.Color.acento : Tema.Color.textoSecundario)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(principal ? Tema.Color.acentoSuave : Tema.Color.superficieInput,
                        in: RoundedRectangle(cornerRadius: Tema.Radio.medio))
            .overlay(RoundedRectangle(cornerRadius: Tema.Radio.medio)
                .stroke(principal ? Tema.Color.bordeHolo : Tema.Color.bordeTenue, lineWidth: 1))
            .shadow(color: principal ? Tema.Color.acento.opacity(configuration.isPressed ? 0.5 : 0.2) : .clear, radius: 12)
            .opacity(activo ? (configuration.isPressed ? 0.75 : 1) : 0.4)
            .animation(.easeOut(duration: Tema.Movimiento.rapido), value: configuration.isPressed)
    }
}

/// Campo de texto con etiqueta encima, estilo de los inputs de la PWA.
struct CampoKepler: View {
    let etiqueta: String
    @Binding var texto: String
    var secreto = false
    var marcador = ""
    @FocusState private var enfocado: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Tema.Espacio.sm) {
            Etiqueta(texto: etiqueta)
            Group {
                if secreto {
                    SecureField(marcador, text: $texto)
                } else {
                    TextField(marcador, text: $texto)
                }
            }
            .focused($enfocado)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .font(Jura.fuente(16))
            .foregroundStyle(Tema.Color.texto)
            .padding(.horizontal, 14)
            .frame(height: 50)
            .background(Color.black.opacity(0.35), in: RoundedRectangle(cornerRadius: Tema.Radio.medio))
            .overlay(RoundedRectangle(cornerRadius: Tema.Radio.medio)
                .stroke(enfocado ? Tema.Color.bordeHolo : Tema.Color.bordeTenue, lineWidth: 1))
        }
    }
}

/// Fondo de las pantallas: negro con rejilla de puntos tenue.
struct FondoKepler: View {
    var body: some View {
        Canvas { ctx, tam in
            let paso: CGFloat = 28
            var y: CGFloat = paso / 2
            while y < tam.height {
                var x: CGFloat = paso / 2
                while x < tam.width {
                    ctx.fill(Path(ellipseIn: CGRect(x: x - 0.8, y: y - 0.8, width: 1.6, height: 1.6)),
                             with: .color(.white.opacity(0.05)))
                    x += paso
                }
                y += paso
            }
        }
        .background(Tema.Color.fondoLogin)
        .ignoresSafeArea()
    }
}
