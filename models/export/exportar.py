"""Exporta los modelos de KEPLER a ONNX (servidor). Herramienta offline: nada
de esto corre en producción.

    python models/export/exportar.py --yolo yolo26s.pt

Genera en models/onnx/:
  * yolo26s.onnx       — detección 640×640, salida end-to-end [1, 300, 6]
                         (x1, y1, x2, y2, confianza, clase) sin NMS
  * clip-vit-b32.onnx  — encoder de imagen CLIP ViT-B/32, entrada [N, 3, 224, 224]
                         normalizada, salida [N, 512] ya normalizada (L2)
  * modelos.json       — clases de YOLO y parámetros de preprocesado
"""

import argparse
import json
import shutil
from pathlib import Path

import torch

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "onnx"
# El mismo modelo que usaba la v0.7 (sentence-transformers/clip-ViT-B-32 = OpenAI ViT-B/32)
CLIP_HF = "sentence-transformers/clip-ViT-B-32"


def exportar_yolo(pesos: Path) -> dict:
    from ultralytics import YOLO

    modelo = YOLO(str(pesos))
    # nms=False: cabeza end-to-end (las versiones nuevas exportan por defecto la que necesita NMS)
    ruta = Path(modelo.export(format="onnx", imgsz=640, opset=17, simplify=True, dynamic=False, nms=False))
    destino = SALIDA / f"{pesos.stem}.onnx"
    shutil.move(ruta, destino)
    return {
        "archivo": destino.name,
        "tamano": 640,
        "clases": [modelo.names[i] for i in sorted(modelo.names)],
    }


class EncoderImagen(torch.nn.Module):
    def __init__(self, clip):
        super().__init__()
        self.vision = clip.vision_model
        self.proyeccion = clip.visual_projection

    def forward(self, pixeles):
        e = self.proyeccion(self.vision(pixel_values=pixeles).pooler_output)
        return e / e.norm(dim=-1, keepdim=True)


def exportar_clip() -> dict:
    from transformers import CLIPModel

    clip = CLIPModel.from_pretrained(CLIP_HF, subfolder="0_CLIPModel").eval()
    destino = SALIDA / "clip-vit-b32.onnx"
    torch.onnx.export(
        EncoderImagen(clip),
        torch.randn(1, 3, 224, 224),
        str(destino),
        input_names=["pixeles"],
        output_names=["embedding"],
        dynamic_axes={"pixeles": {0: "n"}, "embedding": {0: "n"}},
        opset_version=17,
        dynamo=False,
    )
    return {
        "archivo": destino.name,
        "tamano": 224,
        "media": [0.48145466, 0.4578275, 0.40821073],
        "desviacion": [0.26862954, 0.26130258, 0.27577711],
        "dimension": 512,
    }


def referencia_clip() -> list:
    """Embedding de una imagen sintética con sentence-transformers (el pipeline
    de la v0.7), para comprobar que Rust produce lo mismo."""
    from PIL import Image
    from sentence_transformers import SentenceTransformer

    img = Image.new("RGB", (320, 240))
    img.putdata([((x * 3) % 256, (y * 5) % 256, ((x + y) * 7) % 256) for y in range(240) for x in range(320)])
    img.save(SALIDA / "referencia.png")
    st = SentenceTransformer("clip-ViT-B-32", device="cpu")
    e = st.encode([img], normalize_embeddings=True)[0]
    return [round(float(v), 6) for v in e]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--yolo", type=Path, required=True)
    args = p.parse_args()

    SALIDA.mkdir(parents=True, exist_ok=True)
    meta = {"yolo": exportar_yolo(args.yolo), "clip": exportar_clip()}
    meta["clip"]["referencia"] = referencia_clip()
    # Imagen de prueba de Ultralytics para los tests de detección (no se versiona)
    import ultralytics
    shutil.copy(Path(ultralytics.__file__).parent / "assets" / "bus.jpg", SALIDA / "prueba-bus.jpg")
    (SALIDA / "modelos.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(json.dumps({k: v["archivo"] for k, v in meta.items()}))


if __name__ == "__main__":
    main()
