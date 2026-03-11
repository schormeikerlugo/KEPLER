# Explorer Stats — Algoritmo de Resistencia y Desgaste

## Descripción
Endpoint del backend que calcula dinámicamente dos estadísticas del perfil del explorador basándose en el historial de misiones, terreno recorrido y clima real.

## Endpoint
```
GET /api/explorer/stats?lat={latitud}&lng={longitud}
Authorization: Bearer {JWT_TOKEN}
```

## Respuesta
```json
{
  "desgaste_calzado": 42.5,
  "resistencia": 78.0,
  "clima_actual": "lluvia",
  "weather": {
    "temperatura_c": 22.3,
    "lluvia_mm": 8.1,
    "viento_kmh": 15.0,
    "categoria": "lluvia",
    "multiplicador": 1.5
  },
  "misiones_completadas": 8,
  "rutas_registradas": 11
}
```

## Archivo
`backend/app/api/endpoints/explorer_stats.py`

---

## 1. Desgaste del Calzado (0%–100%)

Valor **acumulativo** que aumenta con cada misión completada. El desgaste nunca baja solo (requeriría un evento de "reparación/reemplazo").

### Fórmula
```
Por cada ruta del usuario:
  desgaste_base = distancia_km / 10    → 1% por cada 10 km

  multiplicador_terreno:
    llano / asfalto            → x1.0
    tierra / barro / irregular → x1.5
    rocoso / montaña / cráter  → x2.5

  desgaste_ruta = desgaste_base × multiplicador_terreno

Desgaste Total = Min(100, Σ desgaste_ruta)
```

### Multiplicadores de Terreno
| Tipo de Terreno | Multiplicador | Ejemplo |
|---|---|---|
| `llano`, `asfalto` | x1.0 | Ruta Universidad, Ruta Express |
| `tierra`, `barro`, `irregular` | x1.5 | Travesía Delta, Circuito Río Turbio |
| `rocoso`, `montaña`, `cráter` | x2.5 | Ascenso Volcánico, Ruta Ávila Norte |

### Fuente de datos
- Tabla `rutas_planificadas`: columnas `distancia_total` y `tipo_terreno`

---

## 2. Resistencia Física (0%–100%)

Valor **dinámico** que representa la energía actual del explorador. Baja tras misiones y se regenera con el tiempo de descanso.

### Fórmula
```
Por cada misión completada en las últimas 48 horas:
  fatiga_base = (distancia_km / 5) × 2    → -2% por cada 5 km

  multiplicador_clima (del clima real actual):
    fresco         → x1.0
    frio           → x1.2
    caluroso       → x1.3
    lluvia         → x1.5
    viento_fuerte  → x1.8
    tormenta       → x2.2

  fatiga_mision = fatiga_base × multiplicador_clima

Recuperación = horas_de_inactividad × 5    → +5% por hora sin misión

Resistencia = Clamp(0, 100, 100 - Σfatiga + recuperación)
```

### Comportamiento
- **Empieza en 100%** si no hay misiones recientes.
- **Baja agresivamente** si haces muchas misiones seguidas en clima extremo.
- **Se regenera sola** con el tiempo: +5% por cada hora sin estar en una misión activa.
- Solo considera misiones de las **últimas 48 horas** para la fatiga.

### Fuentes de datos
- Tabla `misiones`: columnas `estado`, `fin_at` (para calcular inactividad)
- Tabla `rutas_planificadas`: columna `distancia_total`
- API Open-Meteo: clima actual del explorador

---

## Geolocalización
El endpoint acepta `lat` y `lng` opcionales para consultar el clima. El frontend los obtiene así:

1. **GPS (navegador):** `navigator.geolocation.getCurrentPosition()`
2. **Fallback IP:** Si GPS falla → `http://ip-api.com/json/?fields=lat,lon`
3. **Default:** Si ambos fallan → clima "fresco" (x1.0)
