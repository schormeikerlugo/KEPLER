"""Exporta DEIMv2 (pesos de Hugging Face) a ONNX: images[1,3,640,640] + orig_target_sizes[1,2]
-> labels (0-79), boxes (xyxy en píxeles de orig_target_sizes), scores."""
import sys
import torch, torch.nn as nn
sys.path.insert(0, sys.argv[1])  # repo DEIMv2
from huggingface_hub import PyTorchModelHubMixin
from engine.backbone import HGNetv2, DINOv3STAs
from engine.deim import HybridEncoder, LiteEncoder, DFINETransformer, DEIMTransformer
from engine.deim.postprocessor import PostProcessor

class DEIMv2(nn.Module, PyTorchModelHubMixin):
    def __init__(self, config):
        super().__init__()
        self.backbone = DINOv3STAs(**config["DINOv3STAs"]) if "DINOv3STAs" in config else HGNetv2(**config["HGNetv2"])
        self.encoder = LiteEncoder(**config["LiteEncoder"]) if "LiteEncoder" in config else HybridEncoder(**config["HybridEncoder"])
        self.decoder = DEIMTransformer(**config["DEIMTransformer"]) if "DEIMTransformer" in config else DFINETransformer(**config["DFINETransformer"])
        self.postprocessor = PostProcessor(**config["PostProcessor"])
    def forward(self, x, orig_target_sizes):
        return self.postprocessor(self.decoder(self.encoder(self.backbone(x))), orig_target_sizes)

repo, salida = sys.argv[2], sys.argv[3]
m = DEIMv2.from_pretrained(repo).eval()
for mod in m.modules():
    if mod is not m and hasattr(mod, "deploy"):
        mod.deploy()
x = torch.rand(1, 3, 640, 640)
t = torch.tensor([[640, 640]])
with torch.no_grad():
    m(x, t)
    torch.onnx.export(m, (x, t), salida, input_names=["images", "orig_target_sizes"],
                      output_names=["labels", "boxes", "scores"], opset_version=17, dynamo=False)
print("ok", salida)
