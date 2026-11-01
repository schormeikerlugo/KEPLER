"""Precisión (COCO mAP50-95 con pycocotools) y latencia en CPU (ONNX Runtime, 4 hilos)
de varios detectores sobre las primeras N imágenes de val2017.

    python evaluar.py <dir_coco> <dir_modelos> <N> modelo1 modelo2 ...
"""
import json, sys, time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval

COCO_DIR, MOD_DIR, N = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
IMAGENET_MEDIA = np.array([0.485, 0.456, 0.406], np.float32)
IMAGENET_DESV = np.array([0.229, 0.224, 0.225], np.float32)

gt = COCO(str(COCO_DIR / "annotations/instances_val2017.json"))
ids = sorted(gt.getImgIds())[:N]
CAT80 = sorted(gt.getCatIds())  # índice 0-79 -> id de categoría COCO

MODELOS = {
    "yolo26n": ("yolo", "yolo26n.onnx", 640),
    "yolo26s": ("yolo", "yolo26s.onnx", 640),
    "yolo26m": ("yolo", "yolo26m.onnx", 640),
    "rfdetr-n": ("rfdetr", "rfdetr-Nano/rfdetr-nano.onnx", 384),
    "rfdetr-s": ("rfdetr", "rfdetr-Small/rfdetr-small.onnx", 512),
    "deimv2-n": ("deim", "deimv2-HGNetv2_N.onnx", 640),
    "deimv2-s": ("deim_imagenet", "deimv2-DINOv3_S.onnx", 640),
}


def letterbox(img, lado):
    h, w = img.shape[:2]
    r = min(lado / w, lado / h)
    nw, nh = round(w * r), round(h * r)
    px, py = (lado - nw) // 2, (lado - nh) // 2
    lienzo = np.full((lado, lado, 3), 114, np.uint8)
    lienzo[py:py + nh, px:px + nw] = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    return lienzo, r, px, py


def nchw(x):
    return np.ascontiguousarray(x.transpose(2, 0, 1)[None])


def detectar(familia, sesion, lado, img):
    """Devuelve [(x, y, w, h, score, cat_id)] en píxeles de la imagen original, y ms de inferencia."""
    h, w = img.shape[:2]
    if familia == "yolo":
        lb, r, px, py = letterbox(img, lado)
        entrada = {"images": nchw(lb.astype(np.float32) / 255)}
        t = time.perf_counter(); (out,) = sesion.run(None, entrada); ms = (time.perf_counter() - t) * 1000
        res = []
        for x1, y1, x2, y2, s, c in out[0]:
            x1, x2 = (x1 - px) / r, (x2 - px) / r
            y1, y2 = (y1 - py) / r, (y2 - py) / r
            res.append((x1, y1, x2 - x1, y2 - y1, s, CAT80[int(c)]))
        return res, ms
    if familia == "rfdetr":
        x = cv2.resize(img, (lado, lado), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255
        entrada = {"input": nchw((x - IMAGENET_MEDIA) / IMAGENET_DESV)}
        t = time.perf_counter(); dets, logits = sesion.run(None, entrada); ms = (time.perf_counter() - t) * 1000
        prob = 1 / (1 + np.exp(-logits[0]))  # [300, 91]
        nc = prob.shape[1]
        top = np.argsort(prob.ravel())[::-1][:300]
        res = []
        for k in top:
            q, c = divmod(int(k), nc)
            cx, cy, bw, bh = dets[0, q]
            res.append(((cx - bw / 2) * w, (cy - bh / 2) * h, bw * w, bh * h, prob[q, c], c))
        return res, ms
    # DEIMv2
    x = cv2.resize(img, (lado, lado), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255
    if familia == "deim_imagenet":
        x = (x - IMAGENET_MEDIA) / IMAGENET_DESV
    entrada = {"images": nchw(x), "orig_target_sizes": np.array([[w, h]], np.int64)}
    t = time.perf_counter(); labels, boxes, scores = sesion.run(None, entrada); ms = (time.perf_counter() - t) * 1000
    return [(b[0], b[1], b[2] - b[0], b[3] - b[1], s, CAT80[int(l)]) for l, b, s in zip(labels[0], boxes[0], scores[0])], ms


resultados = {}
for nombre in sys.argv[4:]:
    familia, archivo, lado = MODELOS[nombre]
    opciones = ort.SessionOptions()
    opciones.intra_op_num_threads = 4
    opciones.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sesion = ort.InferenceSession(str(MOD_DIR / archivo), opciones, providers=["CPUExecutionProvider"])
    dets, tiempos = [], []
    img0 = cv2.cvtColor(cv2.imread(str(COCO_DIR / "val2017" / gt.loadImgs(ids[0])[0]["file_name"])), cv2.COLOR_BGR2RGB)
    for _ in range(3):
        detectar(familia, sesion, lado, img0)  # calentamiento
    for i in ids:
        info = gt.loadImgs(i)[0]
        img = cv2.cvtColor(cv2.imread(str(COCO_DIR / "val2017" / info["file_name"])), cv2.COLOR_BGR2RGB)
        res, ms = detectar(familia, sesion, lado, img)
        tiempos.append(ms)
        dets += [{"image_id": i, "category_id": int(c), "bbox": [float(x), float(y), float(bw), float(bh)], "score": float(s)}
                 for x, y, bw, bh, s, c in res if s > 0.001]
    ev = COCOeval(gt, gt.loadRes(dets) if dets else COCO(), "bbox")
    ev.params.imgIds = ids
    ev.evaluate(); ev.accumulate(); ev.summarize()
    t = np.array(tiempos)
    resultados[nombre] = {
        "mAP": round(float(ev.stats[0]) * 100, 1), "AP50": round(float(ev.stats[1]) * 100, 1),
        "AP_pequenos": round(float(ev.stats[3]) * 100, 1),
        "ms_p50": round(float(np.percentile(t, 50)), 1), "ms_p95": round(float(np.percentile(t, 95)), 1),
        "tamano_mb": round((MOD_DIR / archivo).stat().st_size / 1e6, 1),
    }
    print("RESULTADO", nombre, json.dumps(resultados[nombre]), flush=True)
