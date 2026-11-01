//! ByteTrack: asociación en dos etapas (detecciones de confianza alta y luego
//! baja) por IoU, con un filtro alfa-beta de velocidad constante por pista.
//! Mantiene el `track_id` de un objeto aunque la confianza baje unos fotogramas.

use crate::{Caja, Deteccion};

/// Detección con su id de pista.
#[derive(Debug, Clone, PartialEq)]
pub struct Rastreada {
    pub deteccion: Deteccion,
    pub track_id: u32,
}

#[derive(Debug, Clone)]
struct Pista {
    id: u32,
    clase_id: usize,
    /// cx, cy, ancho, alto
    estado: [f32; 4],
    velocidad: [f32; 4],
    perdidos: u32,
}

impl Pista {
    fn prediccion(&self) -> Caja {
        let [cx, cy, w, h] = std::array::from_fn(|i| self.estado[i] + self.velocidad[i]);
        Caja {
            x: cx - w / 2.0,
            y: cy - h / 2.0,
            ancho: w.max(1e-4),
            alto: h.max(1e-4),
        }
    }

    fn corregir(&mut self, caja: &Caja) {
        const ALFA: f32 = 0.7;
        const BETA: f32 = 0.2;
        let medida = centro(caja);
        for ((e, v), m) in self.estado.iter_mut().zip(&mut self.velocidad).zip(medida) {
            let previsto = *e + *v;
            let residuo = m - previsto;
            *e = previsto + ALFA * residuo;
            *v += BETA * residuo;
        }
        self.perdidos = 0;
    }
}

fn centro(c: &Caja) -> [f32; 4] {
    [c.x + c.ancho / 2.0, c.y + c.alto / 2.0, c.ancho, c.alto]
}

pub struct Rastreador {
    pistas: Vec<Pista>,
    siguiente: u32,
    /// Confianza para la primera etapa y para crear pistas.
    pub umbral_alto: f32,
    /// Fotogramas que una pista sobrevive sin detección.
    pub max_perdidos: u32,
}

impl Default for Rastreador {
    fn default() -> Self {
        Self {
            pistas: Vec::new(),
            siguiente: 1,
            umbral_alto: 0.5,
            max_perdidos: 30,
        }
    }
}

impl Rastreador {
    pub fn actualizar(&mut self, dets: Vec<Deteccion>) -> Vec<Rastreada> {
        let predicciones: Vec<Caja> = self.pistas.iter().map(Pista::prediccion).collect();
        let (altas, bajas): (Vec<_>, Vec<_>) = dets
            .into_iter()
            .partition(|d| d.confianza >= self.umbral_alto);

        let mut libres: Vec<usize> = (0..self.pistas.len()).collect();
        let mut salida = Vec::new();

        // 1ª etapa: confianza alta contra todas las pistas (también las perdidas)
        let sobrantes = self.asociar(&mut libres, &predicciones, altas, 0.2, &mut salida);
        // 2ª etapa: confianza baja solo contra pistas vistas en el fotograma anterior
        let mut recientes: Vec<usize> = libres
            .iter()
            .copied()
            .filter(|&i| self.pistas[i].perdidos == 0)
            .collect();
        self.asociar(&mut recientes, &predicciones, bajas, 0.5, &mut salida);
        libres.retain(|i| recientes.contains(i) || self.pistas[*i].perdidos > 0);

        for &i in &libres {
            self.pistas[i].perdidos += 1;
        }
        // Detecciones altas sin pista: objetos nuevos
        for d in sobrantes {
            let id = self.siguiente;
            self.siguiente += 1;
            self.pistas.push(Pista {
                id,
                clase_id: d.clase_id,
                estado: centro(&d.caja),
                velocidad: [0.0; 4],
                perdidos: 0,
            });
            salida.push(Rastreada {
                deteccion: d,
                track_id: id,
            });
        }
        let max = self.max_perdidos;
        self.pistas.retain(|p| p.perdidos <= max);
        salida
    }

    /// Emparejamiento voraz por IoU (misma clase). Devuelve las detecciones sin pareja.
    fn asociar(
        &mut self,
        libres: &mut Vec<usize>,
        predicciones: &[Caja],
        dets: Vec<Deteccion>,
        iou_minimo: f32,
        salida: &mut Vec<Rastreada>,
    ) -> Vec<Deteccion> {
        let mut pares: Vec<(f32, usize, usize)> = Vec::new();
        for (di, d) in dets.iter().enumerate() {
            for &pi in libres.iter() {
                if self.pistas[pi].clase_id == d.clase_id {
                    let iou = predicciones[pi].iou(&d.caja);
                    if iou >= iou_minimo {
                        pares.push((iou, pi, di));
                    }
                }
            }
        }
        pares.sort_by(|a, b| b.0.total_cmp(&a.0));

        let mut usada = vec![false; dets.len()];
        for (_, pi, di) in pares {
            if usada[di] || !libres.contains(&pi) {
                continue;
            }
            usada[di] = true;
            libres.retain(|&x| x != pi);
            self.pistas[pi].corregir(&dets[di].caja);
            salida.push(Rastreada {
                deteccion: dets[di].clone(),
                track_id: self.pistas[pi].id,
            });
        }
        dets.into_iter()
            .zip(usada)
            .filter(|(_, u)| !u)
            .map(|(d, _)| d)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn det(x: f32, y: f32, confianza: f32, clase_id: usize) -> Deteccion {
        Deteccion {
            clase: format!("c{clase_id}"),
            clase_id,
            confianza,
            caja: Caja {
                x,
                y,
                ancho: 0.1,
                alto: 0.2,
            },
        }
    }

    fn ids(r: &[Rastreada]) -> Vec<u32> {
        let mut v: Vec<u32> = r.iter().map(|x| x.track_id).collect();
        v.sort();
        v
    }

    #[test]
    fn mantiene_el_id_al_moverse() {
        let mut r = Rastreador::default();
        let primero = r.actualizar(vec![det(0.10, 0.1, 0.9, 0), det(0.60, 0.1, 0.9, 0)]);
        assert_eq!(ids(&primero), vec![1, 2]);
        for paso in 1..20 {
            let dx = paso as f32 * 0.01;
            let s = r.actualizar(vec![
                det(0.10 + dx, 0.1, 0.9, 0),
                det(0.60 - dx, 0.1, 0.9, 0),
            ]);
            assert_eq!(ids(&s), vec![1, 2], "paso {paso}");
            let izq = s
                .iter()
                .find(|x| x.deteccion.caja.x < 0.5 - dx + 0.05 && x.deteccion.caja.x < 0.35)
                .map(|x| x.track_id);
            if paso < 15 {
                assert_eq!(izq, Some(1));
            }
        }
    }

    #[test]
    fn baja_confianza_continua_pero_no_crea() {
        let mut r = Rastreador::default();
        r.actualizar(vec![det(0.2, 0.2, 0.9, 0)]);
        // la confianza cae (oclusión parcial): sigue siendo la pista 1
        assert_eq!(ids(&r.actualizar(vec![det(0.21, 0.2, 0.3, 0)])), vec![1]);
        // una detección baja nueva no crea pista
        assert!(r.actualizar(vec![det(0.8, 0.8, 0.3, 0)]).is_empty());
    }

    #[test]
    fn recupera_tras_perderse_y_olvida_despues() {
        let mut r = Rastreador {
            max_perdidos: 5,
            ..Default::default()
        };
        r.actualizar(vec![det(0.3, 0.3, 0.9, 1)]);
        for _ in 0..3 {
            assert!(r.actualizar(vec![]).is_empty());
        }
        assert_eq!(
            ids(&r.actualizar(vec![det(0.3, 0.3, 0.9, 1)])),
            vec![1],
            "vuelve dentro de la ventana"
        );
        for _ in 0..6 {
            r.actualizar(vec![]);
        }
        assert_eq!(
            ids(&r.actualizar(vec![det(0.3, 0.3, 0.9, 1)])),
            vec![2],
            "pasada la ventana es nuevo"
        );
    }

    #[test]
    fn no_mezcla_clases() {
        let mut r = Rastreador::default();
        r.actualizar(vec![det(0.3, 0.3, 0.9, 0)]);
        assert_eq!(ids(&r.actualizar(vec![det(0.3, 0.3, 0.9, 5)])), vec![2]);
    }
}
