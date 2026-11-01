"""Exporta YOLO a CoreML para el iPhone (herramienta offline).

    uv run --python 3.12 --with ultralytics==8.4.15 --with "coremltools>=8.3" \
        --with "torch==2.7.*" --with torchvision --with "numpy<2" \
        python models/export/exportar_coreml.py --yolo yolo26s.pt

Genera models/coreml/yolo26s_vertical.mlpackage: entrada imagen RGB 576×1024
(vertical, como el fotograma 9:16 de la cámara: sin bandas de relleno; escala
1/255 incluida), salida end-to-end [1, 300, 6] (x1, y1, x2, y2 en píxeles de
la entrada, confianza, clase), sin NMS, en float16. `--cuadrado` exporta la
640×640 de siempre (yolo26s.mlpackage). Con numpy ≥ 2 coremltools
falla al convertir («only 0-dimensional arrays…»).
"""

import argparse
import shutil
from pathlib import Path

SALIDA = Path(__file__).resolve().parents[1] / "coreml"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--yolo", type=Path, required=True)
    p.add_argument("--cuadrado", action="store_true")
    args = p.parse_args()
    from ultralytics import YOLO

    # imgsz = (alto, ancho), múltiplos de 32
    imgsz = 640 if args.cuadrado else (1024, 576)
    ruta = Path(YOLO(str(args.yolo)).export(format="coreml", imgsz=imgsz, nms=False, half=True))
    SALIDA.mkdir(exist_ok=True)
    destino = SALIDA / f"{args.yolo.stem}{'' if args.cuadrado else '_vertical'}.mlpackage"
    shutil.rmtree(destino, ignore_errors=True)
    shutil.move(ruta, destino)
    print(destino)


if __name__ == "__main__":
    main()
