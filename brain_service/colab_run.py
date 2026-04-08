"""
MockCortex Brain Service - Google Colab / Kaggle Setup
======================================================
Paste this entire file into a Colab or Kaggle code cell and run it.

Prerequisites:
  1. Accept Meta's LLaMA 3.2 license at https://huggingface.co/meta-llama/Llama-3.2-3B
  2. Get a free ngrok token at https://dashboard.ngrok.com/get-started/your-authtoken
  3. Set HF_TOKEN, NGROK_TOKEN, and optionally BRAIN_SERVICE_API_KEY as notebook secrets
"""

import importlib
import os
import secrets
import subprocess
import sys


def run(cmd: str):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr[-2000:])
        raise RuntimeError(f"Command failed: {cmd}")
    return result.stdout


_NUMPY_FLAG = "/tmp/mockcortex_numpy_fixed"

print("Installing system dependencies...")
run("apt-get install -y -q ffmpeg")
print("Installing Python dependencies...")

if not os.path.exists(_NUMPY_FLAG):
    print("Pinning NumPy<2 (runtime restart required after this)...")
    run("pip install -q --force-reinstall 'numpy<2.0'")
    run("pip install -q --force-reinstall 'scipy' 'scikit-learn'")
    open(_NUMPY_FLAG, "w").close()
    print("\nNumPy pinned. Restarting runtime — re-run the cell in ~5 seconds.")
    os.kill(os.getpid(), 9)

run("pip install -q git+https://github.com/facebookresearch/tribev2.git")
run("pip install -q fastapi uvicorn pyngrok nest_asyncio nilearn matplotlib")

try:
    from google.colab import userdata

    hf_token = userdata.get("HF_TOKEN")
    ngrok_token = userdata.get("NGROK_TOKEN")
    brain_service_api_key = userdata.get("BRAIN_SERVICE_API_KEY")
except Exception:
    hf_token = os.environ.get("HF_TOKEN", "")
    ngrok_token = os.environ.get("NGROK_TOKEN", "")
    brain_service_api_key = os.environ.get("BRAIN_SERVICE_API_KEY", "")

if not hf_token:
    print("HF_TOKEN not found in secrets - interactive login will be required.")
    from huggingface_hub import login

    login()
else:
    from huggingface_hub import login

    login(token=hf_token, add_to_git_credential=False)

if not ngrok_token:
    ngrok_token = input("Paste your ngrok authtoken: ").strip()

if not brain_service_api_key:
    brain_service_api_key = secrets.token_hex(32)

os.environ["BRAIN_SERVICE_API_KEY"] = brain_service_api_key

from pyngrok import ngrok as _ngrok

_ngrok.set_auth_token(ngrok_token)

SERVICE_CODE = r'''
import io
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_model = _fsaverage5 = _destrieux = None
MAX_TEXT_LENGTH = 4000


def _load():
    global _model, _fsaverage5, _destrieux
    from tribev2 import TribeModel
    from nilearn import datasets

    logger.info("Loading TRIBE v2...")
    _model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="./cache")
    _fsaverage5 = datasets.fetch_surf_fsaverage("fsaverage5")
    _destrieux = datasets.fetch_atlas_surf_destrieux()
    logger.info("Ready.")


@asynccontextmanager
async def lifespan(app):
    _load()
    yield


app = FastAPI(lifespan=lifespan)


class Req(BaseModel):
    text: str


class Region(BaseModel):
    name: str
    activation: float


class Resp(BaseModel):
    score: int
    brainImageBase64: str
    regions: list[Region]


def _require_api_key(x_brain_service_api_key):
    expected = os.environ.get("BRAIN_SERVICE_API_KEY", "").strip()
    if not expected:
        raise HTTPException(503, "missing API key configuration")
    if x_brain_service_api_key != expected:
        raise HTTPException(401, "invalid API key")


def _score(preds):
    mean_act = np.mean(np.abs(preds), axis=0)
    top = float(np.mean(mean_act[mean_act > np.percentile(mean_act, 75)]))
    return int(np.clip(top * 80_000, 0, 100))


def _regions(preds):
    mean_act = np.mean(preds, axis=0)
    half = mean_act.shape[0] // 2
    names = [label.decode() if isinstance(label, bytes) else label for label in _destrieux["labels"]]
    values = {}
    hemispheres = [
        (mean_act[:half], np.asarray(_destrieux["map_left"])),
        (mean_act[half:], np.asarray(_destrieux["map_right"])),
    ]
    for act, mapping in hemispheres:
        for idx, name in enumerate(names):
            mask = mapping == idx
            if mask.any():
                values.setdefault(name, []).append(float(np.mean(act[mask])))
    top5 = sorted(
        {name: float(np.mean(items)) for name, items in values.items()}.items(),
        key=lambda item: item[1],
        reverse=True,
    )[:5]
    return [Region(name=name, activation=round(value, 6)) for name, value in top5]


def _brain_img(preds):
    from nilearn import plotting
    import base64

    mean_act = np.mean(preds, axis=0)
    half = mean_act.shape[0] // 2
    views = [
        (_fsaverage5["infl_left"], mean_act[:half], "left", "lateral", "Left - Lateral"),
        (_fsaverage5["infl_left"], mean_act[:half], "left", "medial", "Left - Medial"),
        (_fsaverage5["infl_right"], mean_act[half:], "right", "lateral", "Right - Lateral"),
        (_fsaverage5["infl_right"], mean_act[half:], "right", "medial", "Right - Medial"),
    ]
    fig = plt.figure(figsize=(18, 8), facecolor="#0d0d0d")
    for index, (mesh, stat_map, hemi, view, title) in enumerate(views, start=1):
        ax = fig.add_subplot(2, 2, index, projection="3d")
        ax.set_facecolor("#0d0d0d")
        plotting.plot_surf_stat_map(
            surf_mesh=mesh,
            stat_map=stat_map,
            hemi=hemi,
            view=view,
            axes=ax,
            colorbar=False,
            cmap="cold_hot",
            title=title,
        )
    plt.tight_layout(pad=0.5)
    buffer = io.BytesIO()
    plt.savefig(buffer, format="png", dpi=90, bbox_inches="tight", facecolor="#0d0d0d")
    buffer.seek(0)
    plt.close(fig)
    return base64.b64encode(buffer.read()).decode()


@app.post("/analyze", response_model=Resp)
async def analyze(req: Req, x_brain_service_api_key: str | None = Header(default=None)):
    _require_api_key(x_brain_service_api_key)
    if not req.text.strip():
        raise HTTPException(400, "empty text")
    if len(req.text) > MAX_TEXT_LENGTH:
        raise HTTPException(413, "text too large")

    with tempfile.NamedTemporaryFile(suffix=".txt", mode="w", encoding="utf-8", delete=False) as handle:
        handle.write(req.text)
        path = handle.name

    try:
        events = _model.get_events_dataframe(text_path=path)
        preds, _ = _model.predict(events, verbose=False)
        return Resp(
            score=_score(preds),
            brainImageBase64=_brain_img(preds),
            regions=_regions(preds),
        )
    finally:
        Path(path).unlink(missing_ok=True)


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": _model is not None}
'''

with open("/content/brain_service_app.py", "w", encoding="utf-8") as handle:
    handle.write(SERVICE_CODE)

import asyncio
import nest_asyncio
import uvicorn

nest_asyncio.apply()

tunnel = _ngrok.connect(8000)
public_url = tunnel.public_url
print("\n" + "=" * 60)
print(f"Brain service URL: {public_url}")
print("Set these in your backend environment:")
print(f"BRAIN_SERVICE_URL={public_url}")
print(f"BRAIN_SERVICE_API_KEY={brain_service_api_key}")
print("=" * 60 + "\n")

spec = importlib.util.spec_from_file_location("brain_service_app", "/content/brain_service_app.py")
module = importlib.util.module_from_spec(spec)
sys.modules["brain_service_app"] = module
spec.loader.exec_module(module)

config = uvicorn.Config(module.app, host="0.0.0.0", port=8000, log_level="warning")
server = uvicorn.Server(config)
asyncio.get_event_loop().run_until_complete(server.serve())
