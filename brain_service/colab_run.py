"""
MockRot Brain Service — Google Colab / Kaggle Setup
=====================================================
Paste this entire file into a Colab or Kaggle code cell and run it.

Prerequisites (do these first):
  1. Accept Meta's LLaMA 3.2 license at https://huggingface.co/meta-llama/Llama-3.2-3B
  2. Get a free ngrok token at https://dashboard.ngrok.com/get-started/your-authtoken
  3. Set both as Colab secrets (Colab: left sidebar → key icon) or Kaggle secrets.

Free GPU tiers that work:
  • Google Colab free (T4, 15 GB VRAM) — borderline, may need to restart if OOM
  • Kaggle free (T4 16 GB / P100 16 GB, 30 hrs/week) — recommended
  • HuggingFace Spaces ZeroGPU (A10G 24 GB) — most headroom
"""

# ── Step 1: Install dependencies ─────────────────────────────────────────────
import subprocess, sys

def run(cmd: str):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr[-2000:])
        raise RuntimeError(f"Command failed: {cmd}")
    return result.stdout

print("Installing tribev2 and service dependencies…")
run("pip install -q git+https://github.com/facebookresearch/tribev2.git")
run("pip install -q fastapi uvicorn pyngrok nest_asyncio nilearn matplotlib")
print("✅ Dependencies installed.")

# ── Step 2: Authenticate with HuggingFace ────────────────────────────────────
try:
    # Colab secrets
    from google.colab import userdata
    hf_token = userdata.get("HF_TOKEN")
except Exception:
    try:
        # Kaggle secrets
        import os
        hf_token = os.environ.get("HF_TOKEN", "")
    except Exception:
        hf_token = ""

if not hf_token:
    print("⚠️  HF_TOKEN not found in secrets — you'll be prompted to log in interactively.")
    from huggingface_hub import login
    login()
else:
    from huggingface_hub import login
    login(token=hf_token, add_to_git_credential=False)
    print("✅ HuggingFace authenticated.")

# ── Step 3: Configure ngrok ──────────────────────────────────────────────────
try:
    from google.colab import userdata
    ngrok_token = userdata.get("NGROK_TOKEN")
except Exception:
    import os
    ngrok_token = os.environ.get("NGROK_TOKEN", "")

if not ngrok_token:
    ngrok_token = input("Paste your ngrok authtoken: ").strip()

from pyngrok import ngrok as _ngrok
_ngrok.set_auth_token(ngrok_token)
print("✅ ngrok configured.")

# ── Step 4: Copy service.py into Colab environment ───────────────────────────
# The service code is embedded here so you only need this one file.
SERVICE_CODE = '''
import io, logging, os, tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_model = _fsaverage5 = _destrieux = None

def _load():
    global _model, _fsaverage5, _destrieux
    from tribev2 import TribeModel
    from nilearn import datasets
    logger.info("Loading TRIBE v2…")
    _model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="./cache")
    _fsaverage5 = datasets.fetch_surf_fsaverage("fsaverage5")
    _destrieux = datasets.fetch_atlas_surf_destrieux()
    logger.info("Ready.")

@asynccontextmanager
async def lifespan(app):
    _load(); yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["POST"], allow_headers=["*"])

class Req(BaseModel):
    text: str

class Region(BaseModel):
    name: str; activation: float

class Resp(BaseModel):
    score: int; brainImageBase64: str; regions: list[Region]

def _score(preds):
    m = np.mean(np.abs(preds), axis=0)
    top = float(np.mean(m[m > np.percentile(m, 75)]))
    return int(np.clip(top * 80_000, 0, 100))

def _regions(preds):
    import base64
    m = np.mean(preds, axis=0)
    n = m.shape[0] // 2
    names = [l.decode() if isinstance(l, bytes) else l for l in _destrieux["labels"]]
    rv = {}
    for act, mp in [(m[:n], np.asarray(_destrieux["map_left"])), (m[n:], np.asarray(_destrieux["map_right"]))]:
        for i, name in enumerate(names):
            mask = mp == i
            if mask.any(): rv.setdefault(name, []).append(float(np.mean(act[mask])))
    top5 = sorted({k: float(np.mean(v)) for k, v in rv.items()}.items(), key=lambda x: x[1], reverse=True)[:5]
    return [Region(name=n, activation=round(a, 6)) for n, a in top5]

def _brain_img(preds):
    from nilearn import plotting
    import base64
    m = np.mean(preds, axis=0); n = m.shape[0] // 2
    views = [
        (_fsaverage5["infl_left"],  m[:n], "left",  "lateral", "Left — Lateral"),
        (_fsaverage5["infl_left"],  m[:n], "left",  "medial",  "Left — Medial"),
        (_fsaverage5["infl_right"], m[n:], "right", "lateral", "Right — Lateral"),
        (_fsaverage5["infl_right"], m[n:], "right", "medial",  "Right — Medial"),
    ]
    fig = plt.figure(figsize=(18, 8), facecolor="#0d0d0d")
    for i, (mesh, stat, hemi, view, title) in enumerate(views, 1):
        ax = fig.add_subplot(2, 2, i, projection="3d"); ax.set_facecolor("#0d0d0d")
        plotting.plot_surf_stat_map(mesh, stat, hemi=hemi, view=view, axes=ax, colorbar=False, cmap="cold_hot", title=title)
    plt.tight_layout(pad=0.5)
    buf = io.BytesIO(); plt.savefig(buf, format="png", dpi=90, bbox_inches="tight", facecolor="#0d0d0d"); buf.seek(0); plt.close(fig)
    return base64.b64encode(buf.read()).decode()

@app.post("/analyze", response_model=Resp)
async def analyze(req: Req):
    if not req.text.strip(): raise HTTPException(400, "empty text")
    with tempfile.NamedTemporaryFile(suffix=".txt", mode="w", encoding="utf-8", delete=False) as f:
        f.write(req.text); path = f.name
    try:
        events = _model.get_events_dataframe(text_path=path)
        preds, _ = _model.predict(events, verbose=False)
        return Resp(score=_score(preds), brainImageBase64=_brain_img(preds), regions=_regions(preds))
    finally:
        Path(path).unlink(missing_ok=True)

@app.get("/health")
async def health(): return {"status": "ok", "model_loaded": _model is not None}
'''

with open("/content/brain_service_app.py", "w") as f:
    f.write(SERVICE_CODE)
print("✅ Service code written.")

# ── Step 5: Start uvicorn + ngrok ────────────────────────────────────────────
import nest_asyncio, uvicorn, importlib, sys
nest_asyncio.apply()

# Open tunnel before starting server so URL is printed first
tunnel = _ngrok.connect(8000)
public_url = tunnel.public_url
print("\n" + "="*60)
print(f"✅ Brain service URL: {public_url}")
print(f"   Set this in your backend .env:")
print(f"   BRAIN_SERVICE_URL={public_url}")
print("="*60 + "\n")

# Load and run the app
spec = importlib.util.spec_from_file_location("brain_service_app", "/content/brain_service_app.py")
mod = importlib.util.module_from_spec(spec)
sys.modules["brain_service_app"] = mod
spec.loader.exec_module(mod)

uvicorn.run(mod.app, host="0.0.0.0", port=8000, log_level="warning")
