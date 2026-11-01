"""Latencia en CPU (ONNX Runtime, 4 hilos) con entrada sintética: p50/p95 de 60 ejecuciones."""
import sys, time, glob, numpy as np, onnxruntime as ort
for f in sys.argv[1:]:
    o = ort.SessionOptions(); o.intra_op_num_threads = 4
    s = ort.InferenceSession(f, o, providers=["CPUExecutionProvider"])
    ent = {}
    for i in s.get_inputs():
        forma = [d if isinstance(d, int) else 1 for d in i.shape]
        ent[i.name] = np.array([[640, 640]], np.int64) if "int64" in i.type else np.random.rand(*forma).astype(np.float32)
    for _ in range(5): s.run(None, ent)
    t = []
    for _ in range(60):
        a = time.perf_counter(); s.run(None, ent); t.append((time.perf_counter() - a) * 1000)
    print(f"{f:40s} p50 {np.percentile(t,50):7.1f} ms  p95 {np.percentile(t,95):7.1f} ms", flush=True)
