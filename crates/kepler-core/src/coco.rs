//! Las 80 clases COCO que detecta YOLO, con su nombre en español para mostrar y
//! guardar (`objetos.nombre`); en `clase_yolo` se guarda la clase original.

/// `(clase, nombre)` en el orden de salida del modelo.
pub const CLASES: [(&str, &str); 80] = [
    ("person", "Persona"),
    ("bicycle", "Bicicleta"),
    ("car", "Coche"),
    ("motorcycle", "Moto"),
    ("airplane", "Avión"),
    ("bus", "Autobús"),
    ("train", "Tren"),
    ("truck", "Camión"),
    ("boat", "Barco"),
    ("traffic light", "Semáforo"),
    ("fire hydrant", "Hidrante"),
    ("stop sign", "Señal de stop"),
    ("parking meter", "Parquímetro"),
    ("bench", "Banco"),
    ("bird", "Pájaro"),
    ("cat", "Gato"),
    ("dog", "Perro"),
    ("horse", "Caballo"),
    ("sheep", "Oveja"),
    ("cow", "Vaca"),
    ("elephant", "Elefante"),
    ("bear", "Oso"),
    ("zebra", "Cebra"),
    ("giraffe", "Jirafa"),
    ("backpack", "Mochila"),
    ("umbrella", "Paraguas"),
    ("handbag", "Bolso"),
    ("tie", "Corbata"),
    ("suitcase", "Maleta"),
    ("frisbee", "Frisbi"),
    ("skis", "Esquís"),
    ("snowboard", "Tabla de snowboard"),
    ("sports ball", "Pelota"),
    ("kite", "Cometa"),
    ("baseball bat", "Bate"),
    ("baseball glove", "Guante de béisbol"),
    ("skateboard", "Monopatín"),
    ("surfboard", "Tabla de surf"),
    ("tennis racket", "Raqueta"),
    ("bottle", "Botella"),
    ("wine glass", "Copa"),
    ("cup", "Taza"),
    ("fork", "Tenedor"),
    ("knife", "Cuchillo"),
    ("spoon", "Cuchara"),
    ("bowl", "Cuenco"),
    ("banana", "Plátano"),
    ("apple", "Manzana"),
    ("sandwich", "Sándwich"),
    ("orange", "Naranja"),
    ("broccoli", "Brócoli"),
    ("carrot", "Zanahoria"),
    ("hot dog", "Perrito caliente"),
    ("pizza", "Pizza"),
    ("donut", "Dónut"),
    ("cake", "Pastel"),
    ("chair", "Silla"),
    ("couch", "Sofá"),
    ("potted plant", "Planta"),
    ("bed", "Cama"),
    ("dining table", "Mesa"),
    ("toilet", "Inodoro"),
    ("tv", "Televisor"),
    ("laptop", "Portátil"),
    ("mouse", "Ratón"),
    ("remote", "Mando"),
    ("keyboard", "Teclado"),
    ("cell phone", "Teléfono"),
    ("microwave", "Microondas"),
    ("oven", "Horno"),
    ("toaster", "Tostadora"),
    ("sink", "Fregadero"),
    ("refrigerator", "Nevera"),
    ("book", "Libro"),
    ("clock", "Reloj"),
    ("vase", "Jarrón"),
    ("scissors", "Tijeras"),
    ("teddy bear", "Peluche"),
    ("hair drier", "Secador"),
    ("toothbrush", "Cepillo de dientes"),
];

/// Clase por índice de salida del modelo.
pub fn clase(indice: usize) -> Option<&'static str> {
    CLASES.get(indice).map(|c| c.0)
}

/// Nombre en español de una clase (la clase misma si no se conoce).
pub fn nombre(clase: &str) -> &str {
    CLASES.iter().find(|c| c.0 == clase).map_or(clase, |c| c.1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clases_y_nombres() {
        assert_eq!(
            (clase(0), clase(5), clase(80)),
            (Some("person"), Some("bus"), None)
        );
        assert_eq!((nombre("bus"), nombre("ovni")), ("Autobús", "ovni"));
    }
}
