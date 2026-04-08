"""
MockCortex Brain Service — Modal Deployment
============================================
Runs the TRIBE v2 neural analysis on a T4 GPU via Modal's serverless platform.

Setup (one-time):
  1. pip install modal
  2. modal setup                          # authenticates via browser
  3. modal secret create huggingface-secret HF_TOKEN=hf_your_token_here
  4. modal deploy brain_service/modal_app.py

After deploy, Modal prints a URL like:
  https://<your-username>--mockcortex-brain-service-serve.modal.run

Set that as BRAIN_SERVICE_URL in your Railway backend environment variables.

Cost: ~$0.07 per analysis session (T4 GPU, ~2 min runtime).
Free credit: $30/month — roughly 400 free sessions.
"""

import modal

# ---------------------------------------------------------------------------
# Container image — built once and cached by Modal
# ---------------------------------------------------------------------------
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install([
        "git",               # needed for pip install from GitHub
        "ffmpeg",            # whisperx audio decoding
        "libgl1-mesa-glx",   # matplotlib 3D rendering
        "libglib2.0-0",
        "libgomp1",          # OpenMP (numpy / nilearn)
    ])
    .pip_install([
        "fastapi[standard]",
        "uvicorn[standard]",
        "numpy",
        "nilearn",
        "matplotlib",
        "huggingface_hub",
        "pydantic",
        "whisperx",          # tribev2 calls whisperx internally for transcription
    ])
    # TRIBE v2 installed separately — large git install
    .pip_install(["git+https://github.com/facebookresearch/tribev2.git"])
    .env({
        "MPLBACKEND": "Agg",
        # Ensure ffmpeg is findable by all subprocesses (including uv-spawned ones)
        "PATH": "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin",
    })
)

# Persistent volume — caches downloaded model weights across cold starts
# so the 13-16 GB model is only downloaded once.
model_cache = modal.Volume.from_name("mockcortex-tribe-cache", create_if_missing=True)

app = modal.App("mockcortex-brain-service")

# ---------------------------------------------------------------------------
# FastAPI app (defined inside the Modal function so imports stay GPU-side)
# ---------------------------------------------------------------------------
@app.function(
    image=image,
    gpu="T4",
    secrets=[modal.Secret.from_name("huggingface-secret")],
    volumes={"/model-cache": model_cache},
    timeout=360,                  # 6 min max per request
    scaledown_window=300,         # keep container warm 5 min after last request
    min_containers=1,             # always keep 1 container ready — remove after hackathon to save $
)
@modal.concurrent(max_inputs=1)
@modal.asgi_app()
def serve():
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
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

    logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")
    logger = logging.getLogger(__name__)

    # Authenticate with HuggingFace using the secret
    hf_token = os.environ.get("HF_TOKEN", "")
    if hf_token:
        from huggingface_hub import login
        login(token=hf_token, add_to_git_credential=False)
        logger.info("HuggingFace authenticated.")

    _model = None
    _fsaverage5 = None
    _destrieux = None

    def _load_resources():
        nonlocal _model, _fsaverage5, _destrieux
        logger.info("Loading TRIBE v2 model…")
        from tribev2 import TribeModel
        _model = TribeModel.from_pretrained(
            "facebook/tribev2",
            cache_folder="/model-cache",  # persisted volume
        )
        logger.info("TRIBE v2 loaded.")

        from nilearn import datasets
        _fsaverage5 = datasets.fetch_surf_fsaverage("fsaverage5")
        _destrieux = datasets.fetch_atlas_surf_destrieux()
        logger.info("All resources ready.")

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        _load_resources()
        yield

    fastapi_app = FastAPI(title="MockCortex Brain Service", lifespan=lifespan)
    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["POST", "GET"],
        allow_headers=["*"],
    )

    class AnalyzeRequest(BaseModel):
        text: str

    class AnalyzeAudioRequest(BaseModel):
        audioBase64: str
        mimeType: str = "audio/webm"

    class BrainRegion(BaseModel):
        name: str
        activation: float

    class AnalyzeResponse(BaseModel):
        score: int
        brainImageBase64: str
        regions: list[BrainRegion]

    def _compute_score(preds: np.ndarray) -> int:
        mean_act = np.mean(np.abs(preds), axis=0)
        threshold = np.percentile(mean_act, 75)
        top_mean = float(np.mean(mean_act[mean_act > threshold]))
        return int(np.clip(top_mean * 80_000, 0, 100))

    def _get_regions(preds: np.ndarray) -> list[BrainRegion]:
        mean_act = np.mean(preds, axis=0)
        n = mean_act.shape[0] // 2
        label_names = [
            (l.decode() if isinstance(l, bytes) else l)
            for l in _destrieux["labels"]
        ]
        map_left = np.asarray(_destrieux["map_left"])
        map_right = np.asarray(_destrieux["map_right"])
        region_vals: dict[str, list[float]] = {}
        for act, mp in [(mean_act[:n], map_left), (mean_act[n:], map_right)]:
            for idx, name in enumerate(label_names):
                mask = mp == idx
                if mask.any():
                    region_vals.setdefault(name, []).append(float(np.mean(act[mask])))
        region_means = {k: float(np.mean(v)) for k, v in region_vals.items()}
        top5 = sorted(region_means.items(), key=lambda x: x[1], reverse=True)[:5]
        return [BrainRegion(name=n, activation=round(a, 6)) for n, a in top5]

    def _render_brain(preds: np.ndarray) -> str:
        import base64
        from nilearn import plotting
        mean_act = np.mean(preds, axis=0)
        n = mean_act.shape[0] // 2
        views = [
            (_fsaverage5["infl_left"],  mean_act[:n], "left",  "lateral", "Left — Lateral"),
            (_fsaverage5["infl_left"],  mean_act[:n], "left",  "medial",  "Left — Medial"),
            (_fsaverage5["infl_right"], mean_act[n:], "right", "lateral", "Right — Lateral"),
            (_fsaverage5["infl_right"], mean_act[n:], "right", "medial",  "Right — Medial"),
        ]
        fig = plt.figure(figsize=(18, 8), facecolor="#0d0d0d")
        for i, (mesh, stat, hemi, view, title) in enumerate(views, 1):
            ax = fig.add_subplot(2, 2, i, projection="3d")
            ax.set_facecolor("#0d0d0d")
            plotting.plot_surf_stat_map(
                surf_mesh=mesh, stat_map=stat, hemi=hemi, view=view,
                axes=ax, colorbar=False, cmap="cold_hot", title=title,
            )
        plt.tight_layout(pad=0.5)
        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=90, bbox_inches="tight", facecolor="#0d0d0d")
        buf.seek(0)
        plt.close(fig)
        return base64.b64encode(buf.read()).decode()

    @fastapi_app.post("/analyze", response_model=AnalyzeResponse)
    async def analyze(req: AnalyzeRequest):
        if not req.text.strip():
            raise HTTPException(status_code=400, detail="text must not be empty")
        with tempfile.NamedTemporaryFile(
            suffix=".txt", mode="w", encoding="utf-8", delete=False
        ) as f:
            f.write(req.text)
            txt_path = f.name
        try:
            events = _model.get_events_dataframe(text_path=txt_path)
            preds, _ = _model.predict(events, verbose=False)
            return AnalyzeResponse(
                score=_compute_score(preds),
                brainImageBase64=_render_brain(preds),
                regions=_get_regions(preds),
            )
        finally:
            Path(txt_path).unlink(missing_ok=True)

    @fastapi_app.get("/health")
    async def health():
        return {"status": "ok", "model_loaded": _model is not None}

    return fastapi_app
