# Comparativa de detectores (2026-10-31)

Precisión y velocidad **en CPU**, que es donde corre `kepler-server` (cortex, sin GPU útil).
Las cifras publicadas por los autores son de GPU NVIDIA con TensorRT y no sirven para elegir aquí.

- **Precisión**: COCO val2017, primeras 1.000 imágenes, `pycocotools`, preprocesado oficial de cada familia (`evaluar.py`).
- **Velocidad**: ONNX Runtime 1.31, 4 hilos, entrada sintética, en cortex (Ryzen 7 3700X) (`latencia.py`).

| Modelo | mAP50-95 | AP50 | AP pequeños | CPU cortex p50 | Tamaño | Licencia |
|---|---|---|---|---|---|---|
| YOLO26n | 42,5 | 58,4 | 19,9 | 23 ms | 10 MB | AGPL-3.0 |
| DEIMv2-N (HGNetv2) | 46,2 | 63,4 | 27,2 | 38 ms | 15 MB | No comercial |
| **YOLO26s** ✅ | **49,9** | 66,7 | **32,7** | **62 ms** | 38 MB | AGPL-3.0 |
| RF-DETR-N | 50,6 | 69,4 | 26,2 | 94 ms | 108 MB | Apache 2.0 |
| YOLO26m | 55,1 | 71,6 | 38,6 | 189 ms | 82 MB | AGPL-3.0 |
| RF-DETR-S | 55,2 | 73,4 | 33,3 | 179 ms | 114 MB | Apache 2.0 |
| DEIMv2-S (DINOv3) | 49,0 | 67,4 | 28,8 | 222 ms | 40 MB | No comercial |

## Decisión: YOLO26s

- Mejor equilibrio en CPU: +7,4 mAP y +64 % en objetos pequeños sobre YOLO26n, ~13 FPS en cortex con el preprocesado.
- RF-DETR-N iguala su mAP pero es un 50 % más lento y peor en objetos pequeños; RF-DETR-S iguala a YOLO26m.
- DEIMv2 descartado: su licencia actual prohíbe el uso comercial (algunas fuentes aún lo citan como Apache).
- YOLO26 está pensado para CoreML/Neural Engine; los transformers con backbone DINO suelen rendir peor allí. Para el iPhone (iOS F3) se repetirá la medición con CoreML: en el A15 podría caber YOLO26m.
- **YOLO27** (Ultralytics) está anunciado pero sin pesos publicados. Promete +2 mAP en n/s a la misma velocidad y es un reemplazo directo: repetir esta comparativa cuando salga.

## Reproducir

```bash
uv venv -p 3.12 .venv && uv pip install ultralytics rfdetr onnx onnxruntime onnxslim pycocotools
# YOLO26: YOLO("yolo26s.pt").export(format="onnx", imgsz=640, opset=17, simplify=True, nms=False)
# RF-DETR: RFDETRNano().export(output_dir=..., fp16=False)
# DEIMv2:  python exportar_deimv2.py <repo DEIMv2> Intellindust/DEIMv2_HGNetv2_N_COCO salida.onnx
python evaluar.py <coco> <modelos> 1000 yolo26n yolo26s rfdetr-n ...
python latencia.py modelos/*.onnx
```
