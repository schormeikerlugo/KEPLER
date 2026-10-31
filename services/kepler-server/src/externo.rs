//! Servicios externos gratuitos y sin clave: Open-Meteo (clima y aire),
//! Nominatim (nombre del lugar) e ipwho.is (ubicación aproximada por IP).
//! Todo con caché: 15 min clima/aire, 24 h lugares, 1 h IP.

use std::net::IpAddr;
use std::time::Duration;

use chrono::{DateTime, Utc};
use kepler_core::entorno::{CalidadAire, CategoriaClima};
use serde::{Deserialize, Serialize};

use crate::cache::{Cache, clave_coordenada};

const URL_CLIMA: &str = "https://api.open-meteo.com/v1/forecast";
const URL_AIRE: &str = "https://air-quality-api.open-meteo.com/v1/air-quality";
const URL_LUGAR: &str = "https://nominatim.openstreetmap.org/reverse";
// ipapi.co e ipinfo.io devuelven 429 a esta IP pública; ipwho.is responde.
const URL_IP: &str = "https://ipwho.is";

pub struct Externos {
    http: reqwest::Client,
    clima: Cache<Clima>,
    aire: Cache<Aire>,
    lugares: Cache<Option<String>>,
    ip: Cache<UbicacionIp>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Clima {
    pub temperatura_c: f64,
    pub sensacion_c: f64,
    pub humedad_pct: f64,
    pub lluvia_mm: f64,
    pub viento_kmh: f64,
    pub rafagas_kmh: f64,
    pub direccion_viento: f64,
    pub presion_hpa: f64,
    pub nubosidad_pct: f64,
    pub punto_rocio_c: f64,
    pub visibilidad_m: f64,
    pub uv: f64,
    pub es_dia: bool,
    /// Código WMO del estado del cielo (para el icono).
    pub codigo_wmo: i32,
    pub categoria: CategoriaClima,
    pub multiplicador_fatiga: f64,
    pub ubicacion: Option<String>,
    pub consultado_en: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Aire {
    pub aqi: f64,
    /// 0-100, mayor = aire más limpio.
    pub aire_pct: f64,
    pub calidad: CalidadAire,
    pub pm2_5: f64,
    pub pm10: f64,
    pub monoxido_carbono: f64,
    pub ozono: f64,
    pub dioxido_nitrogeno: f64,
    pub consultado_en: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UbicacionIp {
    pub lat: f64,
    pub lng: f64,
    pub ciudad: Option<String>,
    pub region: Option<String>,
    pub pais: Option<String>,
}

impl Externos {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            // Nominatim exige identificar la aplicación
            .user_agent(concat!(
                "KEPLER/",
                env!("CARGO_PKG_VERSION"),
                " (+https://github.com/schormeikerlugo/KEPLER)"
            ))
            .build()
            .expect("cliente HTTPS");
        Self {
            http,
            clima: Cache::new(Duration::from_secs(15 * 60), 2000),
            aire: Cache::new(Duration::from_secs(15 * 60), 2000),
            lugares: Cache::new(Duration::from_secs(24 * 3600), 5000),
            ip: Cache::new(Duration::from_secs(3600), 1000),
        }
    }

    pub async fn clima(&self, lat: f64, lng: f64) -> Result<Clima, String> {
        let clave = clave_coordenada(lat, lng);
        if let Some(c) = self.clima.obtener(&clave) {
            return Ok(c);
        }

        #[derive(Deserialize)]
        struct Respuesta {
            current: Actual,
        }
        #[derive(Deserialize)]
        struct Actual {
            temperature_2m: Option<f64>,
            relative_humidity_2m: Option<f64>,
            apparent_temperature: Option<f64>,
            rain: Option<f64>,
            wind_speed_10m: Option<f64>,
            wind_gusts_10m: Option<f64>,
            wind_direction_10m: Option<f64>,
            pressure_msl: Option<f64>,
            cloud_cover: Option<f64>,
            dew_point_2m: Option<f64>,
            visibility: Option<f64>,
            uv_index: Option<f64>,
            is_day: Option<i32>,
            weather_code: Option<i32>,
        }

        let consulta = [
            ("latitude", lat.to_string()),
            ("longitude", lng.to_string()),
            (
                "current",
                "temperature_2m,relative_humidity_2m,apparent_temperature,rain,wind_speed_10m,\
                 wind_gusts_10m,wind_direction_10m,pressure_msl,cloud_cover,dew_point_2m,visibility,\
                 uv_index,is_day,weather_code"
                    .into(),
            ),
            ("timezone", "auto".into()),
        ];
        let (r, ubicacion) = tokio::join!(
            self.pedir::<Respuesta>(URL_CLIMA, &consulta),
            self.lugar(lat, lng)
        );
        let a = r?.current;
        let temperatura = a.temperature_2m.ok_or("Open-Meteo sin temperatura")?;
        let lluvia = a.rain.unwrap_or(0.0);
        let viento = a.wind_speed_10m.unwrap_or(0.0);
        let categoria = CategoriaClima::clasificar(temperatura, lluvia, viento);

        let clima = Clima {
            temperatura_c: temperatura,
            sensacion_c: a.apparent_temperature.unwrap_or(temperatura),
            humedad_pct: a.relative_humidity_2m.unwrap_or(0.0),
            lluvia_mm: lluvia,
            viento_kmh: viento,
            rafagas_kmh: a.wind_gusts_10m.unwrap_or(viento),
            direccion_viento: a.wind_direction_10m.unwrap_or(0.0),
            presion_hpa: a.pressure_msl.unwrap_or(1013.0),
            nubosidad_pct: a.cloud_cover.unwrap_or(0.0),
            punto_rocio_c: a.dew_point_2m.unwrap_or(0.0),
            visibilidad_m: a.visibility.unwrap_or(10_000.0),
            uv: a.uv_index.unwrap_or(0.0),
            es_dia: a.is_day.unwrap_or(1) == 1,
            codigo_wmo: a.weather_code.unwrap_or(0),
            categoria,
            multiplicador_fatiga: categoria.multiplicador_fatiga(),
            ubicacion,
            consultado_en: Utc::now(),
        };
        self.clima.guardar(clave, clima.clone());
        Ok(clima)
    }

    pub async fn aire(&self, lat: f64, lng: f64) -> Result<Aire, String> {
        let clave = clave_coordenada(lat, lng);
        if let Some(a) = self.aire.obtener(&clave) {
            return Ok(a);
        }

        #[derive(Deserialize)]
        struct Respuesta {
            current: Actual,
        }
        #[derive(Deserialize)]
        struct Actual {
            european_aqi: Option<f64>,
            pm2_5: Option<f64>,
            pm10: Option<f64>,
            carbon_monoxide: Option<f64>,
            ozone: Option<f64>,
            nitrogen_dioxide: Option<f64>,
        }

        let consulta = [
            ("latitude", lat.to_string()),
            ("longitude", lng.to_string()),
            (
                "current",
                "european_aqi,pm10,pm2_5,carbon_monoxide,ozone,nitrogen_dioxide".into(),
            ),
            ("timezone", "auto".into()),
        ];
        let a = self.pedir::<Respuesta>(URL_AIRE, &consulta).await?.current;
        let aqi = a
            .european_aqi
            .ok_or("Open-Meteo sin índice de calidad del aire")?;
        let aire = Aire {
            aqi,
            aire_pct: CalidadAire::porcentaje(aqi),
            calidad: CalidadAire::clasificar(aqi),
            pm2_5: a.pm2_5.unwrap_or(0.0),
            pm10: a.pm10.unwrap_or(0.0),
            monoxido_carbono: a.carbon_monoxide.unwrap_or(0.0),
            ozono: a.ozone.unwrap_or(0.0),
            dioxido_nitrogeno: a.nitrogen_dioxide.unwrap_or(0.0),
            consultado_en: Utc::now(),
        };
        self.aire.guardar(clave, aire.clone());
        Ok(aire)
    }

    /// "Ciudad, País" por geocodificación inversa; `None` si no se pudo.
    pub async fn lugar(&self, lat: f64, lng: f64) -> Option<String> {
        let clave = clave_coordenada(lat, lng);
        if let Some(l) = self.lugares.obtener(&clave) {
            return l;
        }

        #[derive(Deserialize)]
        struct Respuesta {
            address: Option<Direccion>,
        }
        #[derive(Deserialize)]
        struct Direccion {
            city: Option<String>,
            town: Option<String>,
            village: Option<String>,
            county: Option<String>,
            state: Option<String>,
            country: Option<String>,
        }

        let consulta = [
            ("lat", lat.to_string()),
            ("lon", lng.to_string()),
            ("format", "json".into()),
            ("accept-language", "es".into()),
            ("zoom", "10".into()),
        ];
        let d = self
            .pedir::<Respuesta>(URL_LUGAR, &consulta)
            .await
            .ok()?
            .address?;
        let localidad = d.city.or(d.town).or(d.village).or(d.county).or(d.state);
        let lugar = match (localidad, d.country) {
            (Some(l), Some(p)) => Some(format!("{l}, {p}")),
            (l, p) => l.or(p),
        };
        self.lugares.guardar(clave, lugar.clone());
        lugar
    }

    /// Ubicación aproximada por IP. Si el cliente está en la LAN, se usa la
    /// IP pública del servidor (misma red).
    pub async fn ubicacion_ip(&self, cliente: IpAddr) -> Result<UbicacionIp, String> {
        let publica = es_publica(cliente);
        let clave = if publica {
            cliente.to_string()
        } else {
            "local".into()
        };
        if let Some(u) = self.ip.obtener(&clave) {
            return Ok(u);
        }

        #[derive(Deserialize)]
        struct Respuesta {
            success: bool,
            message: Option<String>,
            latitude: Option<f64>,
            longitude: Option<f64>,
            city: Option<String>,
            region: Option<String>,
            country: Option<String>,
        }

        let url = if publica {
            format!("{URL_IP}/{cliente}")
        } else {
            format!("{URL_IP}/")
        };
        let r = self.pedir::<Respuesta>(&url, &[]).await?;
        if !r.success {
            return Err(r
                .message
                .unwrap_or_else(|| "ipwho.is rechazó la consulta".into()));
        }
        let u = UbicacionIp {
            lat: r.latitude.ok_or("ipwho.is sin latitud")?,
            lng: r.longitude.ok_or("ipwho.is sin longitud")?,
            ciudad: r.city,
            region: r.region,
            pais: r.country,
        };
        self.ip.guardar(clave, u.clone());
        Ok(u)
    }

    async fn pedir<T: for<'de> Deserialize<'de>>(
        &self,
        url: &str,
        consulta: &[(&str, String)],
    ) -> Result<T, String> {
        let r = self
            .http
            .get(url)
            .query(consulta)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !r.status().is_success() {
            return Err(format!("{url} respondió {}", r.status()));
        }
        r.json::<T>().await.map_err(|e| e.to_string())
    }
}

fn es_publica(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !(v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified())
        }
        IpAddr::V6(v6) => {
            let mapeada = v6.to_ipv4_mapped();
            match mapeada {
                Some(v4) => es_publica(IpAddr::V4(v4)),
                None => {
                    !(v6.is_loopback()
                        || v6.is_unspecified()
                        || (v6.segments()[0] & 0xfe00) == 0xfc00)
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ips_privadas() {
        assert!(!es_publica("192.168.68.114".parse().unwrap()));
        assert!(!es_publica("172.18.0.1".parse().unwrap()));
        assert!(!es_publica("127.0.0.1".parse().unwrap()));
        assert!(!es_publica("::ffff:10.0.0.2".parse().unwrap()));
        assert!(!es_publica("fd00::1".parse().unwrap()));
        assert!(es_publica("190.202.10.1".parse().unwrap()));
    }
}
