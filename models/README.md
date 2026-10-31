# models

Modelos de IA exportados para cada plataforma. Los binarios no se versionan (ver `.gitignore`); se generan con el script de exportación.

| Modelo | Origen | Destinos |
|---|---|---|
| YOLO26n | `yolo26n.pt` (Ultralytics) | ONNX (servidor, CPU) · CoreML (iPhone) |
| CLIP ViT-B/32 / MobileCLIP | OpenAI / Apple | ONNX (servidor) · CoreML (iPhone) |

Los pesos originales `.pt` están en `legacy/backend/models/`.
