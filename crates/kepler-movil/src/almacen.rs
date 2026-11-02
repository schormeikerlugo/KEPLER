//! Almacén local de la Unidad de Campo (SQLite, un archivo por usuario):
//! cola de peticiones pendientes, rastro GPS y estado de la misión en curso.
//! Todo lo que se hace en campo se guarda aquí primero; `sync` lo envía al
//! servidor cuando hay conexión con la base.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;

/// Intentos antes de apartar una petición que el servidor rechaza.
pub const INTENTOS_MAX: i64 = 5;

/// Qué hace una petición de la cola (determina cómo se trata su respuesta).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Clase {
    CrearMision,
    Transicion,
    Captura,
}

impl Clase {
    fn como_str(self) -> &'static str {
        match self {
            Self::CrearMision => "crear_mision",
            Self::Transicion => "transicion",
            Self::Captura => "captura",
        }
    }

    fn desde(s: &str) -> Self {
        match s {
            "crear_mision" => Self::CrearMision,
            "transicion" => Self::Transicion,
            _ => Self::Captura,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Pendiente {
    pub seq: i64,
    pub clase: Clase,
    pub ruta: String,
    pub cuerpo: Value,
    pub mision: Option<String>,
}

/// Punto GPS como lo espera `POST /v1/misiones/{id}/rastro`.
#[derive(Debug, Clone, PartialEq)]
pub struct Punto {
    pub id: String,
    pub lat: f64,
    pub lng: f64,
    pub altitud: Option<f64>,
    pub velocidad: Option<f64>,
    pub rumbo: Option<f64>,
    pub precision_m: Option<f64>,
    /// RFC 3339.
    pub registrado_en: String,
}

pub struct Almacen {
    con: Mutex<Connection>,
}

impl Almacen {
    pub fn abrir(ruta: &Path) -> rusqlite::Result<Self> {
        Self::con(Connection::open(ruta)?)
    }

    #[cfg(test)]
    pub fn en_memoria() -> Self {
        Self::con(Connection::open_in_memory().unwrap()).unwrap()
    }

    fn con(con: Connection) -> rusqlite::Result<Self> {
        con.execute_batch(
            "pragma journal_mode = wal;
             create table if not exists cola (
                 seq integer primary key autoincrement,
                 clase text not null,
                 ruta text not null,
                 cuerpo text not null,
                 mision text,
                 creado_en integer not null default (unixepoch()),
                 intentos integer not null default 0,
                 error text,
                 apartada integer not null default 0
             );
             create table if not exists rastro (
                 id text primary key,
                 mision text not null,
                 lat real not null, lng real not null,
                 altitud real, velocidad real, rumbo real, precision_m real,
                 registrado_en text not null,
                 enviado integer not null default 0
             );
             create index if not exists rastro_pendiente on rastro (mision) where enviado = 0;
             create table if not exists estado (clave text primary key, valor text not null);",
        )?;
        Ok(Self {
            con: Mutex::new(con),
        })
    }

    fn c(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.con.lock().expect("almacén")
    }

    // --- cola ---------------------------------------------------------------

    pub fn encolar(
        &self,
        clase: Clase,
        ruta: &str,
        cuerpo: &Value,
        mision: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.c().execute(
            "insert into cola (clase, ruta, cuerpo, mision) values (?1, ?2, ?3, ?4)",
            params![clase.como_str(), ruta, cuerpo.to_string(), mision],
        )?;
        Ok(())
    }

    /// La más antigua sin apartar (la cola se envía en orden).
    pub fn siguiente(&self) -> rusqlite::Result<Option<Pendiente>> {
        self.c()
            .query_row(
                "select seq, clase, ruta, cuerpo, mision from cola where apartada = 0 order by seq limit 1",
                [],
                |f| {
                    Ok(Pendiente {
                        seq: f.get(0)?,
                        clase: Clase::desde(&f.get::<_, String>(1)?),
                        ruta: f.get(2)?,
                        cuerpo: serde_json::from_str(&f.get::<_, String>(3)?).unwrap_or(Value::Null),
                        mision: f.get(4)?,
                    })
                },
            )
            .optional()
    }

    pub fn quitar(&self, seq: i64) -> rusqlite::Result<()> {
        self.c().execute("delete from cola where seq = ?1", [seq])?;
        Ok(())
    }

    /// Un rechazo más; al llegar a [`INTENTOS_MAX`] queda apartada (no bloquea la cola).
    pub fn fallo(&self, seq: i64, error: &str) -> rusqlite::Result<()> {
        self.c().execute(
            "update cola set intentos = intentos + 1, error = ?2, apartada = (intentos + 1 >= ?3) where seq = ?1",
            params![seq, error, INTENTOS_MAX],
        )?;
        Ok(())
    }

    pub fn pendientes(&self) -> u32 {
        self.contar("select count(*) from cola where apartada = 0")
    }

    pub fn apartadas(&self) -> u32 {
        self.contar("select count(*) from cola where apartada = 1")
    }

    /// ¿La creación de esta misión sigue sin llegar al servidor?
    pub fn mision_por_crear(&self, mision: &str) -> bool {
        self.c()
            .query_row(
                "select exists (select 1 from cola where clase = 'crear_mision' and mision = ?1)",
                [mision],
                |f| f.get(0),
            )
            .unwrap_or(false)
    }

    // --- rastro -------------------------------------------------------------

    pub fn guardar_punto(&self, mision: &str, p: &Punto) -> rusqlite::Result<()> {
        self.c().execute(
            "insert or ignore into rastro (id, mision, lat, lng, altitud, velocidad, rumbo, precision_m, registrado_en)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![p.id, mision, p.lat, p.lng, p.altitud, p.velocidad, p.rumbo, p.precision_m, p.registrado_en],
        )?;
        Ok(())
    }

    pub fn puntos_sin_enviar(&self, mision: &str, limite: usize) -> rusqlite::Result<Vec<Punto>> {
        let c = self.c();
        let mut q = c.prepare(
            "select id, lat, lng, altitud, velocidad, rumbo, precision_m, registrado_en from rastro
             where mision = ?1 and enviado = 0 order by registrado_en limit ?2",
        )?;
        q.query_map(params![mision, limite as i64], |f| {
            Ok(Punto {
                id: f.get(0)?,
                lat: f.get(1)?,
                lng: f.get(2)?,
                altitud: f.get(3)?,
                velocidad: f.get(4)?,
                rumbo: f.get(5)?,
                precision_m: f.get(6)?,
                registrado_en: f.get(7)?,
            })
        })?
        .collect()
    }

    /// Todo el rastro de una misión (enviado o no), en orden.
    pub fn puntos(&self, mision: &str) -> rusqlite::Result<Vec<Punto>> {
        let c = self.c();
        let mut q = c.prepare(
            "select id, lat, lng, altitud, velocidad, rumbo, precision_m, registrado_en from rastro
             where mision = ?1 order by registrado_en",
        )?;
        q.query_map([mision], |f| {
            Ok(Punto {
                id: f.get(0)?,
                lat: f.get(1)?,
                lng: f.get(2)?,
                altitud: f.get(3)?,
                velocidad: f.get(4)?,
                rumbo: f.get(5)?,
                precision_m: f.get(6)?,
                registrado_en: f.get(7)?,
            })
        })?
        .collect()
    }

    pub fn marcar_enviados(&self, ids: &[String]) -> rusqlite::Result<()> {
        let mut c = self.c();
        let tx = c.transaction()?;
        for id in ids {
            tx.execute("update rastro set enviado = 1 where id = ?1", [id])?;
        }
        tx.commit()
    }

    /// Misiones con puntos por enviar.
    pub fn misiones_con_rastro(&self) -> rusqlite::Result<Vec<String>> {
        let c = self.c();
        let mut q = c.prepare("select distinct mision from rastro where enviado = 0")?;
        q.query_map([], |f| f.get(0))?.collect()
    }

    pub fn rastro_pendiente(&self) -> u32 {
        self.contar("select count(*) from rastro where enviado = 0")
    }

    // --- estado ---------------------------------------------------------------

    pub fn leer(&self, clave: &str) -> Option<Value> {
        self.c()
            .query_row("select valor from estado where clave = ?1", [clave], |f| {
                f.get::<_, String>(0)
            })
            .optional()
            .ok()
            .flatten()
            .and_then(|v| serde_json::from_str(&v).ok())
    }

    pub fn escribir(&self, clave: &str, valor: Option<&Value>) -> rusqlite::Result<()> {
        match valor {
            Some(v) => self.c().execute(
                "insert into estado (clave, valor) values (?1, ?2)
                 on conflict (clave) do update set valor = excluded.valor",
                params![clave, v.to_string()],
            ),
            None => self
                .c()
                .execute("delete from estado where clave = ?1", [clave]),
        }?;
        Ok(())
    }

    fn contar(&self, sql: &str) -> u32 {
        self.c()
            .query_row(sql, [], |f| f.get::<_, u32>(0))
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn punto(id: &str, t: &str) -> Punto {
        Punto {
            id: id.into(),
            lat: 10.5,
            lng: -66.9,
            altitud: None,
            velocidad: None,
            rumbo: None,
            precision_m: Some(5.0),
            registrado_en: t.into(),
        }
    }

    #[test]
    fn cola_en_orden_y_apartado_tras_rechazos() {
        let a = Almacen::en_memoria();
        a.encolar(
            Clase::CrearMision,
            "/v1/misiones",
            &json!({ "id": "m" }),
            Some("m"),
        )
        .unwrap();
        a.encolar(Clase::Captura, "/v1/capturas", &json!([]), Some("m"))
            .unwrap();
        assert!(a.mision_por_crear("m"));
        let p = a.siguiente().unwrap().unwrap();
        assert_eq!(
            (p.clase, p.cuerpo["id"].as_str()),
            (Clase::CrearMision, Some("m"))
        );
        for _ in 0..INTENTOS_MAX {
            a.fallo(p.seq, "409").unwrap();
        }
        assert_eq!((a.pendientes(), a.apartadas()), (1, 1));
        assert_eq!(
            a.siguiente().unwrap().unwrap().clase,
            Clase::Captura,
            "la apartada no bloquea"
        );
    }

    #[test]
    fn rastro_sin_enviar_y_estado() {
        let a = Almacen::en_memoria();
        a.guardar_punto("m", &punto("b", "2026-11-01T10:00:02Z"))
            .unwrap();
        a.guardar_punto("m", &punto("a", "2026-11-01T10:00:01Z"))
            .unwrap();
        a.guardar_punto("m", &punto("a", "2026-11-01T10:00:01Z"))
            .unwrap();
        let p = a.puntos_sin_enviar("m", 10).unwrap();
        assert_eq!(
            p.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
            ["a", "b"]
        );
        a.marcar_enviados(&["a".into()]).unwrap();
        assert_eq!(
            (a.rastro_pendiente(), a.misiones_con_rastro().unwrap()),
            (1, vec!["m".to_owned()])
        );
        a.escribir("x", Some(&json!({ "k": 1 }))).unwrap();
        assert_eq!(a.leer("x"), Some(json!({ "k": 1 })));
        a.escribir("x", None).unwrap();
        assert_eq!(a.leer("x"), None);
    }
}
