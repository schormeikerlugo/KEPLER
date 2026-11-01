# models

Modelos de IA exportados para cada plataforma. Los `.onnx` no se versionan; se generan con el script de exportación (Python solo como herramienta, nunca en producción).

```bash
legacy/backend/venv/bin/python models/export/exportar.py --yolo yolo26s.pt
```

| Archivo (`models/onnx/`) | Contenido |
|---|---|
| `yolo26s.onnx` | YOLO26s 640×640, salida end-to-end `[1, 300, 6]` (x1, y1, x2, y2, confianza, clase), sin NMS. Elegido en [`comparativa/`](comparativa/README.md) |
| `clip-vit-b32.onnx` | Encoder de imagen CLIP ViT-B/32 (el de la v0.7), salida `[N, 512]` normalizada |
| `modelos.json` | 80 clases COCO, parámetros de preprocesado y embedding de referencia |
| `referencia.png` | Imagen sintética para comprobar CLIP |
| `prueba-bus.jpg` | Imagen de Ultralytics para comprobar YOLO (no se versiona) |

## iPhone (CoreML)

`models/export/exportar_coreml.py` genera `models/coreml/yolo26s_vertical.mlpackage`: entrada **576×1024 vertical** (la cámara 9:16 la llena sin bandas, los objetos llegan 1.6× más grandes que en 640×640), 18 MB, float16, misma salida `[1, 300, 6]`. ~12–14 ms por fotograma en el iPhone 13 Pro Max (60 fps). `--cuadrado` da la 640×640 (`yolo26s.mlpackage`), que la app incluye solo para comparar (`KEPLER_COMPARAR=1`). No se versiona: `scripts/ios.sh` lo copia al Mac y Xcode lo compila dentro de la app. El núcleo (`kepler-movil::interpretar_yolo`) deshace el letterbox y nombra las clases en español (`kepler-core::coco`).

## Preprocesado (debe ser idéntico en el iPhone)

- **YOLO**: letterbox a 640 con relleno gris 114, bilineal tipo `cv2.INTER_LINEAR` (centros de píxel, sin suavizado), valores en [0, 1].
- **CLIP**: lado corto a 224 (bicúbico), recorte central 224×224, `(x/255 − media) / desviación` con la media y desviación de `modelos.json`.

En cortex los modelos están en `/mnt/storage/kepler/modelos` (montado en `/data/modelos`).
