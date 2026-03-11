# Weather Service — Open-Meteo Integration

## Descripción
Microservicio que consulta la API gratuita de [Open-Meteo](https://open-meteo.com/) para obtener el clima real del explorador y clasificarlo en categorías KEPLER.

## Archivo
`backend/app/services/weather_service.py`

## API Externa
- **URL:** `https://api.open-meteo.com/v1/forecast`
- **Costo:** Gratis (sin API key, sin registro)
- **Límites:** 10,000 llamadas/día, 5,000/hora
- **Parámetros:** `latitude`, `longitude`, `current=temperature_2m,rain,wind_speed_10m`

## Categorías de Clima

| Datos de Open-Meteo | Categoría KEPLER | Multiplicador Fatiga |
|---|---|---|
| temp > 35°C | `caluroso` | x1.3 |
| temp 15–35°C | `fresco` | x1.0 |
| temp < 15°C | `frio` | x1.2 |
| viento > 40 km/h | `viento_fuerte` | x1.8 |
| lluvia > 5 mm/h | `lluvia` | x1.5 |
| lluvia > 5 mm/h + viento > 40 km/h | `tormenta` | x2.2 |

> **Prioridad:** tormenta > viento_fuerte > lluvia > caluroso > frio > fresco

## Cache
- Los resultados se cachean **15 minutos** en memoria por coordenadas (redondeadas a 2 decimales).
- Esto evita exceder los límites de la API y reduce la latencia.

## Fallback
Si la API falla o no hay conexión, retorna clima `fresco` con multiplicador x1.0.
