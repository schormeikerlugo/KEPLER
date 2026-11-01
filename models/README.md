# models

Modelos de IA exportados para cada plataforma. Los `.onnx` no se versionan; se generan con el script de exportación (Python solo como herramienta, nunca en producción).

```bash
legacy/backend/venv/bin/python models/export/exportar.py --yolo legacy/backend/models/yolo26n.pt
```

| Archivo (`models/onnx/`) | Contenido |
|---|---|
| `yolo26n.onnx` | YOLO26n 640×640, salida end-to-end `[1, 300, 6]` (x1, y1, x2, y2, confianza, clase), sin NMS |
| `clip-vit-b32.onnx` | Encoder de imagen CLIP ViT-B/32 (el de la v0.7), salida `[N, 512]` normalizada |
| `modelos.json` | 80 clases COCO, parámetros de preprocesado y embedding de referencia |
| `referencia.png` | Imagen sintética para comprobar CLIP |
| `prueba-bus.jpg` | Imagen de Ultralytics para comprobar YOLO (no se versiona) |

## Preprocesado (debe ser idéntico en el iPhone)

- **YOLO**: letterbox a 640 con relleno gris 114, bilineal tipo `cv2.INTER_LINEAR` (centros de píxel, sin suavizado), valores en [0, 1].
- **CLIP**: lado corto a 224 (bicúbico), recorte central 224×224, `(x/255 − media) / desviación` con la media y desviación de `modelos.json`.

En cortex los modelos están en `/mnt/storage/kepler/modelos` (montado en `/data/modelos`).
