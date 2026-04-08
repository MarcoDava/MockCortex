"""
MockCortex Brain Analysis Service
================================
FastAPI service wrapping TRIBE v2 (facebook/tribev2).

Accepts interview answer transcripts and returns:
  - Neural engagement score (0–100)
  - 4-view 3D brain activation PNG (base64)
  - Top 5 most-activated brain regions (Destrieux atlas)

Run this on Google Colab or Kaggle (free T4/P100 GPU).
See colab_run.py for the full setup script.
"""

from __future__ import annotations

import io
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # non-interactive backend — must be set before pyplot import
import matplotlib.pyplot as plt
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy-loaded globals (loaded once on startup)
# ---------------------------------------------------------------------------
_model = None
_fsaverage5 = None
_destrieux = None


def _load_resources():
    global _model, _fsaverage5, _destrieux

    logger.info("Loading TRIBE v2 model from HuggingFace…")
    from tribev2 import TribeModel
    _model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="./cache")
    logger.info("TRIBE v2 loaded.")

    logger.info("Fetching fsaverage5 surface…")
    from nilearn import datasets
    _fsaverage5 = datasets.fetch_surf_fsaverage("fsaverage5")

    logger.info("Fetching Destrieux atlas…")
    _destrieux = datasets.fetch_atlas_surf_destrieux()
    logger.info("All resources ready.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_resources()
    yield


app = FastAPI(title="MockCortex Brain Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Core analysis helpers
# ---------------------------------------------------------------------------

def _compute_engagement_score(preds: np.ndarray) -> int:
    """Return 0–100 engagement score.

    High mean absolute activation in the top quartile of vertices ≈ more
    neural processing ≈ more cognitively engaging content for a listener.
    """
    mean_act = np.mean(np.abs(preds), axis=0)          # (n_vertices,)
    threshold = np.percentile(mean_act, 75)
    top_mean = float(np.mean(mean_act[mean_act > threshold]))
    # Empirical normalisation: typical TRIBE v2 top-quartile values sit in
    # the 0.0002–0.0010 range on fMRI z-score scale.
    score = int(np.clip(top_mean * 80_000, 0, 100))
    return score


def _get_top_regions(preds: np.ndarray) -> list[BrainRegion]:
    """Map vertex activations → Destrieux labels → top 5 regions."""
    mean_act = np.mean(preds, axis=0)                  # (n_vertices,)
    n_verts = mean_act.shape[0]
    n_per_hemi = n_verts // 2
    left_act = mean_act[:n_per_hemi]
    right_act = mean_act[n_per_hemi:]

    label_names: list[str] = [
        (lbl.decode() if isinstance(lbl, bytes) else lbl)
        for lbl in _destrieux["labels"]
    ]
    map_left: np.ndarray = np.asarray(_destrieux["map_left"])
    map_right: np.ndarray = np.asarray(_destrieux["map_right"])

    region_vals: dict[str, list[float]] = {}
    for hemi_act, hemi_map in [(left_act, map_left), (right_act, map_right)]:
        for idx, name in enumerate(label_names):
            mask = hemi_map == idx
            if mask.any():
                region_vals.setdefault(name, []).append(float(np.mean(hemi_act[mask])))

    region_means = {name: float(np.mean(vals)) for name, vals in region_vals.items()}
    top5 = sorted(region_means.items(), key=lambda x: x[1], reverse=True)[:5]
    return [BrainRegion(name=name, activation=round(act, 6)) for name, act in top5]


def _generate_brain_image(preds: np.ndarray) -> str:
    """Render 4-view brain activation map → base64 PNG string."""
    from nilearn import plotting

    mean_act = np.mean(preds, axis=0)
    n_per_hemi = mean_act.shape[0] // 2
    left_act = mean_act[:n_per_hemi]
    right_act = mean_act[n_per_hemi:]

    views = [
        (_fsaverage5["infl_left"],  left_act,  "left",  "lateral", "Left — Lateral"),
        (_fsaverage5["infl_left"],  left_act,  "left",  "medial",  "Left — Medial"),
        (_fsaverage5["infl_right"], right_act, "right", "lateral", "Right — Lateral"),
        (_fsaverage5["infl_right"], right_act, "right", "medial",  "Right — Medial"),
    ]

    fig = plt.figure(figsize=(18, 8), facecolor="#0d0d0d")
    for i, (mesh, stat_map, hemi, view, title) in enumerate(views, start=1):
        ax = fig.add_subplot(2, 2, i, projection="3d")
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
    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=90, bbox_inches="tight", facecolor="#0d0d0d")
    buf.seek(0)
    plt.close(fig)

    import base64
    return base64.b64encode(buf.read()).decode()


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")

    # Write transcript to a temp .txt file (TRIBE v2 requires a file path)
    with tempfile.NamedTemporaryFile(
        suffix=".txt", mode="w", encoding="utf-8", delete=False
    ) as f:
        f.write(req.text)
        txt_path = f.name

    try:
        logger.info("Running TRIBE v2 on transcript (%d chars)…", len(req.text))
        events = _model.get_events_dataframe(text_path=txt_path)
        preds, _ = _model.predict(events, verbose=False)
        # preds: (n_segments, n_vertices)  — float32 predicted fMRI activations
        logger.info("Predictions shape: %s", preds.shape)

        score = _compute_engagement_score(preds)
        regions = _get_top_regions(preds)
        brain_img = _generate_brain_image(preds)

        return AnalyzeResponse(
            score=score,
            brainImageBase64=brain_img,
            regions=regions,
        )
    finally:
        Path(txt_path).unlink(missing_ok=True)


@app.post("/analyze-audio", response_model=AnalyzeResponse)
async def analyze_audio(req: AnalyzeAudioRequest) -> AnalyzeResponse:
    if not req.audioBase64.strip():
        raise HTTPException(status_code=400, detail="audioBase64 must not be empty")

    import base64
    import subprocess

    audio_bytes = base64.b64decode(req.audioBase64)

    # Determine original extension from MIME type
    ext_map = {
        "audio/webm": ".webm",
        "audio/webm;codecs=opus": ".webm",
        "audio/ogg": ".ogg",
        "audio/mp4": ".mp4",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
    }
    mime_clean = req.mimeType.split(";")[0].strip().lower()
    orig_ext = ext_map.get(mime_clean, ".webm")

    with tempfile.NamedTemporaryFile(suffix=orig_ext, delete=False) as f:
        f.write(audio_bytes)
        raw_path = f.name

    # whisperx requires wav — convert via ffmpeg
    wav_path = raw_path.replace(orig_ext, ".wav")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", raw_path, "-ar", "16000", "-ac", "1", wav_path],
            capture_output=True,
            check=True,
        )
        logger.info("Converted audio to wav: %s", wav_path)
    except subprocess.CalledProcessError as e:
        Path(raw_path).unlink(missing_ok=True)
        logger.error("ffmpeg conversion failed: %s", e.stderr.decode())
        raise HTTPException(status_code=422, detail="Audio conversion failed")
    finally:
        Path(raw_path).unlink(missing_ok=True)

    try:
        logger.info("Running TRIBE v2 on audio file…")
        events = _model.get_events_dataframe(audio_path=wav_path)
        preds, _ = _model.predict(events, verbose=False)
        logger.info("Predictions shape: %s", preds.shape)

        score = _compute_engagement_score(preds)
        regions = _get_top_regions(preds)
        brain_img = _generate_brain_image(preds)

        return AnalyzeResponse(
            score=score,
            brainImageBase64=brain_img,
            regions=regions,
        )
    finally:
        Path(wav_path).unlink(missing_ok=True)


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": _model is not None}
