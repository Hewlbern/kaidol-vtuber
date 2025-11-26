import logging
import traceback
from collections import OrderedDict
from io import BytesIO
from pathlib import Path
import os
import numpy as np
import soundfile as sf
import torch
from fairseq.data.dictionary import Dictionary
from torch.serialization import add_safe_globals
import time

# Add fairseq Dictionary to safe globals for PyTorch 2.6+
add_safe_globals([Dictionary])

from .configs.config import Config
from .lib.audio import load_audio, wav2
from .infer_pack.models import (
    SynthesizerTrnMs256NSFsid,
    SynthesizerTrnMs256NSFsid_nono,
    SynthesizerTrnMs768NSFsid,
    SynthesizerTrnMs768NSFsid_nono,
)
from .pipeline.main import Pipeline, ModelCache
from .pipeline.utils import *

logger: logging.Logger = logging.getLogger(__name__)

os.environ["rmvpe_root"] = os.path.join("config", "assets", "rvmpe")
os.environ["hubert_path"] = os.path.join("config", "assets", "hubert", "hubert_base.pt")

class VC:
    def __init__(self):
        self.n_spk: any = None
        self.tgt_sr: int | None = None
        self.net_g = None
        self.pipeline: Pipeline | None = None
        self.cpt: OrderedDict | None = None
        self.version: str | None = None
        self.if_f0: int | None = None
        self.version: str | None = None
        self.hubert_model: any = None
        self.processing_times = {}

        self.config = Config()

    def get_vc(self, sid: str | Path, *to_return_protect: int):
        start_time = time.time()
        logger.info("Get sid: " + os.path.basename(sid))

        return_protect = [
            to_return_protect[0] if self.if_f0 != 0 and to_return_protect else 0.5,
            to_return_protect[1] if self.if_f0 != 0 and to_return_protect else 0.33,
        ]

        person = sid if os.path.exists(sid) else f'{os.getenv("weight_root")}/{sid}'
        logger.info(f"Loading: {person}")

        model_load_start = time.time()
        self.cpt = torch.load(person, map_location="cpu")
        self.tgt_sr = self.cpt["config"][-1]
        self.cpt["config"][-3] = self.cpt["weight"]["emb_g.weight"].shape[0]  # n_spk
        self.if_f0 = self.cpt.get("f0", 1)
        self.version = self.cpt.get("version", "v1")
        model_load_time = time.time() - model_load_start

        synthesizer_class = {
            ("v1", 1): SynthesizerTrnMs256NSFsid,
            ("v1", 0): SynthesizerTrnMs256NSFsid_nono,
            ("v2", 1): SynthesizerTrnMs768NSFsid,
            ("v2", 0): SynthesizerTrnMs768NSFsid_nono,
        }

        model_init_start = time.time()
        self.net_g = synthesizer_class.get(
            (self.version, self.if_f0), SynthesizerTrnMs256NSFsid
        )(*self.cpt["config"], is_half=self.config.is_half)
        model_init_time = time.time() - model_init_start

        del self.net_g.enc_q

        if sid == "" or []:
            logger.info("Clean model cache")
            ModelCache.clear()  # Clear model cache when cleaning
            del (self.hubert_model, self.tgt_sr, self.net_g)
            (self.net_g) = self.n_spk = index = None

        else:
            model_load_state_start = time.time()
            self.net_g.load_state_dict(self.cpt["weight"], strict=False)
            self.net_g.eval().to(self.config.device)
            self.net_g = (
                self.net_g.half() if self.config.is_half else self.net_g.float()
            )
            model_load_state_time = time.time() - model_load_state_start

            pipeline_init_start = time.time()
            self.pipeline = Pipeline(self.tgt_sr, self.config)
            self.n_spk = self.cpt["config"][-3]
            index = get_index_path_from_model(sid)
            pipeline_init_time = time.time() - pipeline_init_start
            logger.info("Select index: " + index)

        total_time = time.time() - start_time
        self.processing_times["get_vc"] = {
            "total": total_time,
            "model_load": model_load_time,
            "model_init": model_init_time,
            "model_load_state": model_load_state_time if sid != "" else 0,
            "pipeline_init": pipeline_init_time if sid != "" else 0
        }

        return self.n_spk, return_protect, index

    def vc_inference(
        self,
        sid: int,
        input_audio_path: Path,
        f0_up_key: int = 0,
        f0_method: str = "rmvpe",
        f0_file: Path | None = None,
        index_file: Path | None = None,
        index_rate: float = 0.75,
        filter_radius: int = 3,
        resample_sr: int = 0,
        rms_mix_rate: float = 0.25,
        protect: float = 0.33,
        hubert_path: str | None = None,
    ):
        start_time = time.time()
        logger.info("Starting voice conversion pipeline")
        
        # Use the default HuBERT model path if not provided
        if not hubert_path:
            hubert_path = os.path.join("config", "assets", "hubert", "hubert_base.pt")
            if not os.path.exists(hubert_path):
                hubert_path = os.getenv("hubert_path")

        try:
            # Audio loading phase
            audio_load_start = time.time()
            logger.info("Loading and preprocessing audio...")
            audio = load_audio(input_audio_path, 16000)
            audio_max = np.abs(audio).max() / 0.95
            if audio_max > 1:
                audio /= audio_max
            audio_load_time = time.time() - audio_load_start
            logger.info(f"Audio loading completed in {audio_load_time:.3f}s")

            times = {"npy": 0, "f0": 0, "infer": 0}

            # HuBERT model loading phase
            hubert_load_start = time.time()
            logger.info("Loading HuBERT model...")
            if self.hubert_model is None:
                self.hubert_model = self.pipeline.get_hubert_model(hubert_path)
            hubert_load_time = time.time() - hubert_load_start
            logger.info(f"HuBERT model loaded in {hubert_load_time:.3f}s")

            # Main pipeline phase
            pipeline_start = time.time()
            logger.info("Starting main conversion pipeline...")
            audio_opt = self.pipeline.pipeline(
                self.hubert_model,
                self.net_g,
                sid,
                audio,
                input_audio_path,
                times,
                f0_up_key,
                f0_method,
                index_file,
                index_rate,
                self.if_f0,
                filter_radius,
                self.tgt_sr,
                resample_sr,
                rms_mix_rate,
                self.version,
                protect,
                f0_file,
            )
            pipeline_time = time.time() - pipeline_start
            logger.info(f"Main pipeline completed in {pipeline_time:.3f}s")

            tgt_sr = resample_sr if self.tgt_sr != resample_sr >= 16000 else self.tgt_sr

            # Calculate total time and log detailed timing information
            total_time = time.time() - start_time
            self.processing_times["vc_inference"] = {
                "total": total_time,
                "audio_load": audio_load_time,
                "hubert_load": hubert_load_time,
                "pipeline": pipeline_time,
                "npy": times["npy"],
                "f0": times["f0"],
                "infer": times["infer"]
            }
            
            logger.info("Pipeline timing breakdown:")
            logger.info(f"- Total time: {total_time:.3f}s")
            logger.info(f"- Audio loading: {audio_load_time:.3f}s")
            logger.info(f"- HuBERT loading: {hubert_load_time:.3f}s")
            logger.info(f"- Main pipeline: {pipeline_time:.3f}s")
            logger.info(f"- Feature extraction (npy): {times['npy']:.3f}s")
            logger.info(f"- F0 extraction: {times['f0']:.3f}s")
            logger.info(f"- Inference: {times['infer']:.3f}s")

            return tgt_sr, audio_opt, times, None

        except Exception:
            info = traceback.format_exc()
            logger.warning(info)
            return None, None, None, info

    def get_processing_times(self):
        """Return the timing information for all operations."""
        return self.processing_times

    def vc_multi(
        self,
        sid: int,
        paths: list,
        opt_root: Path,
        f0_up_key: int = 0,
        f0_method: str = "rmvpe",
        f0_file: Path | None = None,
        index_file: Path | None = None,
        index_rate: float = 0.75,
        filter_radius: int = 3,
        resample_sr: int = 0,
        rms_mix_rate: float = 0.25,
        protect: float = 0.33,
        output_format: str = "wav",
        hubert_path: str | None = None,
    ):
        try:
            os.makedirs(opt_root, exist_ok=True)
            paths = [path.name for path in paths]
            infos = []
            for path in paths:
                tgt_sr, audio_opt, _, info = self.vc_inference(
                    sid,
                    Path(path),
                    f0_up_key,
                    f0_method,
                    f0_file,
                    index_file,
                    index_rate,
                    filter_radius,
                    resample_sr,
                    rms_mix_rate,
                    protect,
                    hubert_path,
                )
                if info:
                    try:
                        if output_format in ["wav", "flac"]:
                            sf.write(
                                f"{opt_root}/{os.path.basename(path)}.{output_format}",
                                audio_opt,
                                tgt_sr,
                            )
                        else:
                            with BytesIO() as wavf:
                                sf.write(wavf, audio_opt, tgt_sr, format="wav")
                                wavf.seek(0, 0)
                                with open(
                                    f"{opt_root}/{os.path.basename(path)}.{output_format}",
                                    "wb",
                                ) as outf:
                                    wav2(wavf, outf, output_format)
                    except Exception:
                        info += traceback.format_exc()
                infos.append(f"{os.path.basename(path)}->{info}")
                yield "\n".join(infos)
            yield "\n".join(infos)
        except:
            yield traceback.format_exc()