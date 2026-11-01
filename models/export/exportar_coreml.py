"""Exporta YOLO a CoreML para el iPhone (herramienta offline).

    uv run --python 3.12 --with ultralytics==8.4.15 --with "coremltools>=8.3" \
        --with "torch==2.7.*" --with torchvision --with "numpy<2" \
        python models/export/exportar_coreml.py --yolo yolo26s.pt

Genera models/coreml/yolo26s.mlpackage: entrada imagen RGB 640×640 (escala
1/255 incluida), salida end-to-end [1, 300, 6] (x1, y1, x2, y2 en píxeles de
la entrada, confianza, clase), sin NMS, en float16. Con numpy ≥ 2 coremltools
falla al convertir («only 0-dimensional arrays…»).
"""

import argparse
import shutil
from pathlib import Path

SALIDA = Path(__file__).resolve().parents[1] / "coreml"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--yolo", type=Path, required=True)
    args = p.parse_args()
    from ultralytics import YOLO

    ruta = Path(YOLO(str(args.yolo)).export(format="coreml", imgsz=640, nms=False, half=True))
    SALIDA.mkdir(exist_ok=True)
    destino = SALIDA / f"{args.yolo.stem}.mlpackage"
    shutil.rmtree(destino, ignore_errors=True)
    shutil.move(ruta, destino)
    print(destino)


if __name__ == "__main__":
    main()
