import CoreBluetooth
import Foundation

/// Explorador Bluetooth del reloj: encuentra el reloj (también si ya está
/// conectado a su app oficial: iOS comparte la conexión entre apps), recorre
/// sus servicios, se suscribe a todo lo que notifica y lo registra en
/// Documentos/reloj/ para descifrar el protocolo. El pulso estándar (0x2A37)
/// se decodifica en directo.
@MainActor
final class Reloj: NSObject, ObservableObject {
    struct Visto: Identifiable, Equatable {
        let id: UUID
        var nombre: String
        var rssi: Int?
        /// Ya conectado al iPhone (por otra app).
        var conectado: Bool
        var servicios: [String]
        /// Datos del fabricante del anuncio, en hex.
        var fabricante: String?
        /// Protocolo de la plataforma YC/UTE según el anuncio (como su app oficial).
        var plataforma: String?
    }

    struct Caracteristica: Identifiable, Equatable {
        var id: String { "\(servicio)/\(uuid)" }
        let servicio: String
        let uuid: String
        let propiedades: String
        var valor: String?
        var mensajes = 0
    }

    @Published private(set) var estado = "Apagado"
    @Published private(set) var vistos: [Visto] = []
    @Published private(set) var conectado: Visto?
    @Published private(set) var caracteristicas: [Caracteristica] = []
    @Published private(set) var pulso: Int?
    @Published private(set) var bateria: Int?
    @Published private(set) var registro: URL?
    @Published private(set) var lineas: [String] = []
    /// Últimos valores descifrados del reloj (tipo → valor).
    @Published private(set) var ultimos: [String: Double] = [:]
    /// Tramas del canal FFF1 descifradas con éxito en esta conexión.
    @Published private(set) var descifradas = 0
    /// Recibe las muestras de salud que llegan del reloj (las guarda la sesión).
    var alMuestras: (([MuestraBio]) -> Void)?
    private var descifrador: RelojCarbinox?

    /// ¿Hay clave del reloj (cuenta Carbinox vinculada en Ajustes)?
    var tieneClave: Bool { descifrador != nil }

    /// Carga las claves del Llavero (tras vincular la cuenta Carbinox).
    func cargarClaves() {
        descifrador = ClavesReloj.vinculo.flatMap { try? RelojCarbinox(claveVinculo: $0, claveSesion: ClavesReloj.sesion) }
    }

    private var central: CBCentralManager?
    private var perifericos: [UUID: CBPeripheral] = [:]
    private var actual: CBPeripheral?
    private var archivo: FileHandle?
    /// Anuncios vistos (se vuelcan en el registro al conectar).
    private var anuncios: Set<String> = []

    /// Servicios con los que buscar relojes ya conectados al iPhone (los de la
    /// plataforma YC/UTE del Carbinox primero: 56FF comandos, 55FF capacidades).
    static let serviciosConocidos: [CBUUID] = [
        "56FF", "55FF", "60FF", "61FF", "AE00", "0000D0FF-3C17-D293-8E48-14FE2E4DA212",
        "180D", "180F", "180A", "1800", "1801", "FEE7", "FFF0", "FEEA", "FE59", "FFE0", "FD00", "FEE0", "FEE1",
        "6E400001-B5A3-F393-E0A9-E50E24DCCA9F",
    ].map(CBUUID.init(string:))

    /// Protocolo JX (nadalsdk) o RK (utesdk), con las mismas reglas que la app oficial.
    static func plataforma(nombre: String?, anuncio: String) -> String? {
        if anuncio.contains("55 55 22 22") { return "JX_RK" }
        if anuncio.contains("55 55") || nombre?.hasPrefix("AT") == true { return "JX" }
        if ["33 55", "36 55", "3C 55", "4C 42 4F 4F"].contains(where: anuncio.contains) { return "RK" }
        return nil
    }

    /// Consultas de solo lectura del protocolo JX (característica 34F1).
    static let consultasJX: [(String, String)] = [
        ("batería", "01 A4 AA 16"),
        ("resumen de hoy", "01 C3 AA AA"),
    ]

    /// Envía las consultas JX de prueba y registra las respuestas.
    func probarProtocolo() {
        guard let c = caracteristicas.first(where: { $0.uuid == "34F1" }) else {
            escribirLinea("SIN 34F1: el reloj no expone el canal JX")
            return
        }
        for (nombre, hex) in Reloj.consultasJX {
            escribirLinea("PRUEBA \(nombre)")
            escribir(hex: hex, en: c, conRespuesta: true)
        }
    }

    func encender() {
        if central == nil {
            central = CBCentralManager(delegate: self, queue: .main)
            estado = "Encendiendo Bluetooth…"
        } else {
            buscar()
        }
    }

    func buscar() {
        guard let central, central.state == .poweredOn else { return }
        // Los que ya tiene conectados el sistema (el reloj con Carbinox Max)
        for p in central.retrieveConnectedPeripherals(withServices: Reloj.serviciosConocidos) {
            anotar(p, rssi: nil, conectado: true, servicios: [])
        }
        // Con clave: se engancha solo al reloj Carbinox que ya usa el iPhone
        if descifrador != nil, actual == nil,
           let v = vistos.first(where: { $0.conectado && ($0.nombre.contains("Carbinox") || $0.nombre.contains("Edge")) }) {
            conectar(v)
            return
        }
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        estado = "Buscando…"
        Task {
            try? await Task.sleep(for: .seconds(15))
            if self.central?.isScanning == true {
                self.central?.stopScan()
                if self.actual == nil { self.estado = "Búsqueda terminada" }
            }
        }
    }

    func conectar(_ v: Visto) {
        guard let p = perifericos[v.id], let central else { return }
        central.stopScan()
        actual = p
        p.delegate = self
        caracteristicas = []
        abrirRegistro(nombre: v.nombre)
        escribirLinea("CONECTAR \(v.nombre) id=\(v.id) ya_conectado=\(v.conectado) plataforma=\(v.plataforma ?? "?")")
        anuncios.sorted().forEach { escribirLinea("ANUNCIO \($0)") }
        estado = "Conectando a \(v.nombre)…"
        central.connect(p)
    }

    func desconectar() {
        if let p = actual { central?.cancelPeripheralConnection(p) }
        actual = nil
        conectado = nil
        try? archivo?.close()
        archivo = nil
        estado = "Desconectado"
    }

    /// Escribe bytes en hex («AB 01 FF») en una característica (para probar comandos).
    func escribir(hex: String, en c: Caracteristica, conRespuesta: Bool) {
        guard let p = actual,
              let car = p.services?.first(where: { $0.uuid.uuidString == c.servicio })?
              .characteristics?.first(where: { $0.uuid.uuidString == c.uuid }) else { return }
        let limpio = hex.filter(\.isHexDigit)
        var datos = Data()
        var i = limpio.startIndex
        while i < limpio.endIndex, let j = limpio.index(i, offsetBy: 2, limitedBy: limpio.endIndex) {
            if let b = UInt8(limpio[i..<j], radix: 16) { datos.append(b) }
            i = j
        }
        escribirLinea("TX \(c.uuid) \(Reloj.hex(datos))")
        p.writeValue(datos, for: car, type: conRespuesta ? .withResponse : .withoutResponse)
    }

    // MARK: - Registro

    static var carpeta: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("reloj")
    }

    private func abrirRegistro(nombre: String) {
        try? FileManager.default.createDirectory(at: Reloj.carpeta, withIntermediateDirectories: true)
        let f = DateFormatter()
        f.dateFormat = "yyyyMMdd-HHmmss"
        let url = Reloj.carpeta.appendingPathComponent("registro-\(f.string(from: Date())).txt")
        FileManager.default.createFile(atPath: url.path, contents: nil)
        archivo = try? FileHandle(forWritingTo: url)
        registro = url
        lineas = []
    }

    private func escribirLinea(_ s: String) {
        let linea = "\(ISO8601DateFormatter.conMilisegundos.string(from: Date())) \(s)"
        archivo?.write(Data((linea + "\n").utf8))
        lineas.append(linea)
        if lineas.count > 200 { lineas.removeFirst(lineas.count - 200) }
    }

    nonisolated static func hex(_ d: Data) -> String { d.map { String(format: "%02X", $0) }.joined(separator: " ") }

    private func anotar(_ p: CBPeripheral, rssi: Int?, conectado: Bool, servicios: [String],
                        anuncio: String? = nil, fabricante: String? = nil) {
        perifericos[p.identifier] = p
        let nombre = p.name ?? "(sin nombre)"
        if let i = vistos.firstIndex(where: { $0.id == p.identifier }) {
            vistos[i].rssi = rssi ?? vistos[i].rssi
            vistos[i].conectado = vistos[i].conectado || conectado
            if !servicios.isEmpty { vistos[i].servicios = servicios }
            if p.name != nil { vistos[i].nombre = nombre }
            if let fabricante { vistos[i].fabricante = fabricante }
            if let anuncio, let pl = Reloj.plataforma(nombre: p.name, anuncio: anuncio) { vistos[i].plataforma = pl }
        } else {
            vistos.append(Visto(id: p.identifier, nombre: nombre, rssi: rssi, conectado: conectado, servicios: servicios,
                                fabricante: fabricante,
                                plataforma: anuncio.flatMap { Reloj.plataforma(nombre: p.name, anuncio: $0) }))
        }
        vistos.sort { a, b in
            if a.conectado != b.conectado { return a.conectado }
            if (a.nombre == "(sin nombre)") != (b.nombre == "(sin nombre)") { return a.nombre != "(sin nombre)" }
            return (a.rssi ?? -200) > (b.rssi ?? -200)
        }
    }

    private static func propiedades(_ p: CBCharacteristicProperties) -> String {
        var s: [String] = []
        if p.contains(.read) { s.append("R") }
        if p.contains(.write) { s.append("W") }
        if p.contains(.writeWithoutResponse) { s.append("Wn") }
        if p.contains(.notify) { s.append("N") }
        if p.contains(.indicate) { s.append("I") }
        return s.joined(separator: "·")
    }

    /// Pulso estándar (Heart Rate Measurement, 0x2A37).
    private static func pulso(_ d: Data) -> Int? {
        guard let flags = d.first else { return nil }
        if flags & 1 == 0 { return d.count > 1 ? Int(d[1]) : nil }
        return d.count > 2 ? Int(d[1]) | Int(d[2]) << 8 : nil
    }
}

extension ISO8601DateFormatter {
    static let conMilisegundos: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

extension Reloj: CBCentralManagerDelegate, CBPeripheralDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        MainActor.assumeIsolated {
            switch central.state {
            case .poweredOn: buscar()
            case .unauthorized: estado = "Sin permiso de Bluetooth (Ajustes › KEPLER)"
            case .poweredOff: estado = "Bluetooth apagado"
            default: estado = "Bluetooth no disponible"
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDiscover p: CBPeripheral,
                                    advertisementData ad: [String: Any], rssi: NSNumber) {
        let servicios = (ad[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []).map(\.uuidString)
        let fabricante = (ad[CBAdvertisementDataManufacturerDataKey] as? Data).map(Reloj.hex)
        let datosServicio = (ad[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data] ?? [:])
            .map { "\($0.key.uuidString)=\(Reloj.hex($0.value))" }
        MainActor.assumeIsolated {
            guard rssi.intValue < 0 else { return }
            // Como la app oficial: todo el anuncio en hex para reconocer la plataforma
            let anuncio = ([fabricante ?? ""] + datosServicio).joined(separator: " ")
            anotar(p, rssi: rssi.intValue, conectado: false, servicios: servicios + datosServicio,
                   anuncio: anuncio, fabricante: fabricante)
            if let nombre = p.name, fabricante != nil || !servicios.isEmpty {
                anuncios.insert("\(nombre) \(p.identifier) rssi=\(rssi) servicios=\(servicios) fabricante=\(fabricante ?? "-") datos=\(datosServicio)")
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect p: CBPeripheral) {
        MainActor.assumeIsolated {
            conectado = vistos.first { $0.id == p.identifier }
            estado = "Conectado · descubriendo servicios"
            escribirLinea("CONECTADO mtu_sin_respuesta=\(p.maximumWriteValueLength(for: .withoutResponse))")
            p.discoverServices(nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        MainActor.assumeIsolated {
            estado = "No se pudo conectar: \(error?.localizedDescription ?? "?")"
            escribirLinea("FALLO \(error?.localizedDescription ?? "")")
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        MainActor.assumeIsolated {
            escribirLinea("DESCONECTADO \(error?.localizedDescription ?? "")")
            if actual?.identifier == p.identifier {
                estado = "Desconectado"
                conectado = nil
            }
        }
    }

    nonisolated func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        MainActor.assumeIsolated {
            for s in p.services ?? [] {
                escribirLinea("SERVICIO \(s.uuid.uuidString) primario=\(s.isPrimary)")
                p.discoverCharacteristics(nil, for: s)
            }
        }
    }

    nonisolated func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        MainActor.assumeIsolated {
            for c in s.characteristics ?? [] {
                let props = Reloj.propiedades(c.properties)
                escribirLinea("CARACTERISTICA \(s.uuid.uuidString)/\(c.uuid.uuidString) \(props)")
                caracteristicas.append(Caracteristica(servicio: s.uuid.uuidString, uuid: c.uuid.uuidString, propiedades: props))
                if c.properties.contains(.read) { p.readValue(for: c) }
                if c.properties.contains(.notify) || c.properties.contains(.indicate) { p.setNotifyValue(true, for: c) }
                p.discoverDescriptors(for: c)
            }
            estado = "Conectado · \(caracteristicas.count) características"
        }
    }

    nonisolated func peripheral(_ p: CBPeripheral, didDiscoverDescriptorsFor c: CBCharacteristic, error: Error?) {
        MainActor.assumeIsolated {
            for d in c.descriptors ?? [] where d.uuid.uuidString == "2901" {
                p.readValue(for: d)
            }
        }
    }

    nonisolated func peripheral(_ p: CBPeripheral, didUpdateValueFor d: CBDescriptor, error: Error?) {
        MainActor.assumeIsolated {
            escribirLinea("DESCRIPTOR \(d.characteristic?.uuid.uuidString ?? "?") \(String(describing: d.value ?? ""))")
        }
    }

    nonisolated func peripheral(_ p: CBPeripheral, didUpdateNotificationStateFor c: CBCharacteristic, error: Error?) {
        MainActor.assumeIsolated {
            escribirLinea("SUSCRITO \(c.uuid.uuidString) \(c.isNotifying) \(error?.localizedDescription ?? "")")
        }
    }

    nonisolated func peripheral(_ p: CBPeripheral, didWriteValueFor c: CBCharacteristic, error: Error?) {
        MainActor.assumeIsolated {
            escribirLinea("TX_OK \(c.uuid.uuidString) \(error?.localizedDescription ?? "")")
        }
    }

    nonisolated func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
        let datos = c.value ?? Data()
        let servicio = c.service?.uuid.uuidString ?? "?"
        MainActor.assumeIsolated {
            let texto = String(data: datos, encoding: .utf8).flatMap { s in
                s.allSatisfy { $0.isASCII && !$0.isNewline && ($0.isLetter || $0.isNumber || $0.isPunctuation || $0 == " ") }
                    ? " «\(s)»" : nil
            } ?? ""
            escribirLinea("RX \(servicio)/\(c.uuid.uuidString) \(Reloj.hex(datos))\(texto)")
            if c.uuid.uuidString == "FFF1" { descifrar(datos) }
            if let i = caracteristicas.firstIndex(where: { $0.servicio == servicio && $0.uuid == c.uuid.uuidString }) {
                caracteristicas[i].valor = Reloj.hex(datos.prefix(24)) + texto
                caracteristicas[i].mensajes += 1
            }
            switch c.uuid.uuidString {
            case "2A37": pulso = Reloj.pulso(datos)
            case "2A19": bateria = datos.first.map(Int.init)
            default: break
            }
        }
    }
}

extension Reloj {
    /// Canal principal del Carbinox: descifra, registra y entrega las muestras.
    fileprivate func descifrar(_ datos: Data) {
        guard let descifrador, let r = descifrador.recibir(datos: datos) else { return }
        let cabecera = String(format: "%04X/%04X", r.habilidad, r.comando)
        if let claro = r.claro {
            descifradas += 1
            escribirLinea("CLARO \(cabecera) \(claro) \(r.descripcion)")
        } else if !r.descripcion.isEmpty {
            escribirLinea("SIN_DESCIFRAR \(cabecera) \(r.descripcion)")
        }
        if r.sesionNueva { ClavesReloj.sesion = descifrador.claveSesion() }
        guard !r.muestras.isEmpty else { return }
        for m in r.muestras { ultimos[m.tipo] = m.valor }
        if let p = ultimos["pulso"] { pulso = Int(p) }
        alMuestras?(r.muestras)
    }
}
