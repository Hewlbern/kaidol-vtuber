import logging
import os
import traceback
from functools import lru_cache
from time import time as ttime
from typing import Dict, Any

import faiss
import librosa
import numpy as np
import parselmouth
import pyworld
import torch
import torch.nn.functional as F
import torchcrepe
from scipy import signal

logger: logging.Logger = logging.getLogger(__name__)

bh, ah = signal.butter(N=5, Wn=48, btype="high", fs=16000)

input_audio_path2wav = {}

class ModelCache:
    """Class to handle model caching for both HuBERT and RMVPE models."""
    _hubert_models: Dict[str, Any] = {}
    _rmvpe_models: Dict[str, Any] = {}
    
    @classmethod
    def get_hubert(cls, key: str, loader_func) -> Any:
        """Get or load HuBERT model from cache."""
        if key not in cls._hubert_models:
            cls._hubert_models[key] = loader_func()
        return cls._hubert_models[key]
    
    @classmethod
    def get_rmvpe(cls, key: str, loader_func) -> Any:
        """Get or load RMVPE model from cache."""
        if key not in cls._rmvpe_models:
            cls._rmvpe_models[key] = loader_func()
        return cls._rmvpe_models[key]
    
    @classmethod
    def clear(cls):
        """Clear all cached models."""
        cls._hubert_models.clear()
        cls._rmvpe_models.clear()

@lru_cache
def cache_harvest_f0(input_audio_path, fs, f0max, f0min, frame_period):
    audio = input_audio_path2wav[input_audio_path]
    f0, t = pyworld.harvest(
        audio,
        fs=fs,
        f0_ceil=f0max,
        f0_floor=f0min,
        frame_period=frame_period,
    )
    f0 = pyworld.stonemask(audio, f0, t, fs)
    return f0

def change_rms(data1, sr1, data2, sr2, rate):  # 1是输入音频，2是输出音频,rate是2的占比
    # print(data1.max(),data2.max())
    rms1 = librosa.feature.rms(
        y=data1, frame_length=sr1 // 2 * 2, hop_length=sr1 // 2
    )  # 每半秒一个点
    rms2 = librosa.feature.rms(y=data2, frame_length=sr2 // 2 * 2, hop_length=sr2 // 2)
    rms1 = torch.from_numpy(rms1)
    rms1 = F.interpolate(
        rms1.unsqueeze(0), size=data2.shape[0], mode="linear"
    ).squeeze()
    rms2 = torch.from_numpy(rms2)
    rms2 = F.interpolate(
        rms2.unsqueeze(0), size=data2.shape[0], mode="linear"
    ).squeeze()
    rms2 = torch.max(rms2, torch.zeros_like(rms2) + 1e-6)
    data2 *= (
        torch.pow(rms1, torch.tensor(1 - rate))
        * torch.pow(rms2, torch.tensor(rate - 1))
    ).numpy()
    return data2

class Pipeline(object):
    def __init__(self, tgt_sr, config):
        self.x_pad, self.x_query, self.x_center, self.x_max, self.is_half = (
            config.x_pad,
            config.x_query,
            config.x_center,
            config.x_max,
            config.is_half,
        )
        self.sr = 16000  # hubert输入采样率
        self.window = 160  # 每帧点数
        self.t_pad = self.sr * self.x_pad  # 每条前后pad时间
        self.t_pad_tgt = tgt_sr * self.x_pad
        self.t_pad2 = self.t_pad * 2
        self.t_query = self.sr * self.x_query  # 查询切点前后查询时间
        self.t_center = self.sr * self.x_center  # 查询切点位置
        self.t_max = self.sr * self.x_max  # 免查询时长阈值
        self.device = config.device
        self.config = config
        
    def _get_cache_key(self, model_path: str, model_type: str) -> str:
        """Generate a unique cache key for a model."""
        return f"{model_type}_{model_path}_{self.device}_{self.is_half}"
        
    def get_hubert_model(self, hubert_path: str):
        """Get or load HuBERT model from cache."""
        cache_key = self._get_cache_key(hubert_path, "hubert")
        
        def load_hubert():
            from .utils import load_hubert
            return load_hubert(self.config, hubert_path)
            
        return ModelCache.get_hubert(cache_key, load_hubert)
        
    def get_rmvpe_model(self, rmvpe_path: str):
        """Get or load RMVPE model from cache."""
        cache_key = self._get_cache_key(rmvpe_path, "rmvpe")
        
        def load_rmvpe():
            from .rmvpe import RMVPE
            return RMVPE(rmvpe_path, is_half=self.is_half, device=self.device)
            
        return ModelCache.get_rmvpe(cache_key, load_rmvpe)

    def get_f0(
        self,
        input_audio_path,
        x,
        p_len,
        f0_up_key,
        f0_method,
        filter_radius,
        inp_f0=None,
    ):
        global input_audio_path2wav
        time_step = self.window / self.sr * 1000
        f0_min = 50
        f0_max = 1100
        f0_mel_min = 1127 * np.log(1 + f0_min / 700)
        f0_mel_max = 1127 * np.log(1 + f0_max / 700)
        
        if f0_method == "rmvpe":
            rmvpe_path = os.path.join(os.environ["rmvpe_root"], "rmvpe.pt")
            if not hasattr(self, "model_rmvpe"):
                self.model_rmvpe = self.get_rmvpe_model(rmvpe_path)
            f0 = self.model_rmvpe.infer_from_audio(x, thred=0.03)
            
            if "privateuseone" in str(self.device):  # clean ortruntime memory
                del self.model_rmvpe.model
                del self.model_rmvpe
                logger.info("Cleaning ortruntime memory")
                
        elif f0_method == "pm":
            f0 = (
                parselmouth.Sound(x, self.sr)
                .to_pitch_ac(
                    time_step=time_step / 1000,
                    voicing_threshold=0.6,
                    pitch_floor=f0_min,
                    pitch_ceiling=f0_max,
                )
                .selected_array["frequency"]
            )
            pad_size = (p_len - len(f0) + 1) // 2
            if pad_size > 0 or p_len - len(f0) - pad_size > 0:
                f0 = np.pad(
                    f0, [[pad_size, p_len - len(f0) - pad_size]], mode="constant"
                )
        elif f0_method == "harvest":
            input_audio_path2wav[input_audio_path] = x.astype(np.double)
            f0 = cache_harvest_f0(input_audio_path, self.sr, f0_max, f0_min, 10)
            if filter_radius > 2:
                f0 = signal.medfilt(f0, 3)
        elif f0_method == "crepe":
            model = "full"
            batch_size = 512
            audio = torch.tensor(np.copy(x))[None].float()
            f0, pd = torchcrepe.predict(
                audio,
                self.sr,
                self.window,
                f0_min,
                f0_max,
                model,
                batch_size=batch_size,
                device=self.device,
                return_periodicity=True,
            )
            pd = torchcrepe.filter.median(pd, 3)
            f0 = torchcrepe.filter.mean(f0, 3)
            f0[pd < 0.1] = 0
            f0 = f0[0].cpu().numpy()

        f0 *= pow(2, f0_up_key / 12)
        tf0 = self.sr // self.window  # 每秒f0点数
        if inp_f0 is not None:
            delta_t = np.round(
                (inp_f0[:, 0].max() - inp_f0[:, 0].min()) * tf0 + 1
            ).astype("int16")
            replace_f0 = np.interp(
                list(range(delta_t)), inp_f0[:, 0] * 100, inp_f0[:, 1]
            )
            shape = f0[self.x_pad * tf0 : self.x_pad * tf0 + len(replace_f0)].shape[0]
            f0[self.x_pad * tf0 : self.x_pad * tf0 + len(replace_f0)] = replace_f0[
                :shape
            ]
        f0bak = f0.copy()
        f0_mel = 1127 * np.log(1 + f0 / 700)
        f0_mel[f0_mel > 0] = (f0_mel[f0_mel > 0] - f0_mel_min) * 254 / (
            f0_mel_max - f0_mel_min
        ) + 1
        f0_mel[f0_mel <= 1] = 1
        f0_mel[f0_mel > 255] = 255
        f0_coarse = np.rint(f0_mel).astype(np.int32)
        return f0_coarse, f0bak

    def vc(
        self,
        model,
        net_g,
        sid,
        audio0,
        pitch,
        pitchf,
        times,
        index,
        big_npy,
        index_rate,
        version,
        protect,
    ):  # ,file_index,file_big_npy
        vc_start = ttime()
        logger.info("Starting voice conversion step...")

        # Feature preparation
        feat_prep_start = ttime()
        feats = torch.from_numpy(audio0)
        if self.is_half:
            feats = feats.half()
        else:
            feats = feats.float()
        if feats.dim() == 2:  # double channels
            feats = feats.mean(-1)
        assert feats.dim() == 1, feats.dim()
        feats = feats.view(1, -1)
        padding_mask = torch.BoolTensor(feats.shape).to(self.device).fill_(False)
        feat_prep_time = ttime() - feat_prep_start
        logger.info(f"Feature preparation completed in {feat_prep_time:.3f}s")

        # Model inference
        model_infer_start = ttime()
        inputs = {
            "source": feats.to(self.device),
            "padding_mask": padding_mask,
            "output_layer": 9 if version == "v1" else 12,
        }
        
        # Break down model inference steps
        with torch.no_grad():
            # Feature extraction
            extract_start = ttime()
            logger.info("Starting feature extraction...")
            logits = model.extract_features(**inputs)
            extract_time = ttime() - extract_start
            logger.info(f"Feature extraction completed in {extract_time:.3f}s")
            
            # Feature projection
            proj_start = ttime()
            logger.info("Starting feature projection...")
            feats = model.final_proj(logits[0]) if version == "v1" else logits[0]
            proj_time = ttime() - proj_start
            logger.info(f"Feature projection completed in {proj_time:.3f}s")
            
        model_infer_time = ttime() - model_infer_start
        logger.info(f"Model inference completed in {model_infer_time:.3f}s")
        logger.info("Model inference timing breakdown:")
        logger.info(f"- Feature extraction: {extract_time:.3f}s")
        logger.info(f"- Feature projection: {proj_time:.3f}s")

        # Feature protection
        if protect < 0.5 and pitch is not None and pitchf is not None:
            protect_start = ttime()
            feats0 = feats.clone()
            protect_time = ttime() - protect_start
            logger.info(f"Feature protection setup completed in {protect_time:.3f}s")

        # Index search and feature mixing
        if (
            not isinstance(index, type(None))
            and not isinstance(big_npy, type(None))
            and index_rate != 0
        ):
            index_search_start = ttime()
            npy = feats[0].cpu().numpy()
            if self.is_half:
                npy = npy.astype("float32")

            score, ix = index.search(npy, k=8)
            weight = np.square(1 / score)
            weight /= weight.sum(axis=1, keepdims=True)
            npy = np.sum(big_npy[ix] * np.expand_dims(weight, axis=2), axis=1)

            if self.is_half:
                npy = npy.astype("float16")
            feats = (
                torch.from_numpy(npy).unsqueeze(0).to(self.device) * index_rate
                + (1 - index_rate) * feats
            )
            index_search_time = ttime() - index_search_start
            logger.info(f"Index search and feature mixing completed in {index_search_time:.3f}s")

        # Feature interpolation
        interp_start = ttime()
        feats = F.interpolate(feats.permute(0, 2, 1), scale_factor=2).permute(0, 2, 1)
        if protect < 0.5 and pitch is not None and pitchf is not None:
            feats0 = F.interpolate(feats0.permute(0, 2, 1), scale_factor=2).permute(
                0, 2, 1
            )
        interp_time = ttime() - interp_start
        logger.info(f"Feature interpolation completed in {interp_time:.3f}s")

        # Length adjustment
        len_adj_start = ttime()
        p_len = audio0.shape[0] // self.window
        if feats.shape[1] < p_len:
            p_len = feats.shape[1]
            if pitch is not None and pitchf is not None:
                pitch = pitch[:, :p_len]
                pitchf = pitchf[:, :p_len]
        len_adj_time = ttime() - len_adj_start
        logger.info(f"Length adjustment completed in {len_adj_time:.3f}s")

        # Feature protection application
        if protect < 0.5 and pitch is not None and pitchf is not None:
            protect_apply_start = ttime()
            pitchff = pitchf.clone()
            pitchff[pitchf > 0] = 1
            pitchff[pitchf < 1] = protect
            pitchff = pitchff.unsqueeze(-1)
            feats = feats * pitchff + feats0 * (1 - pitchff)
            feats = feats.to(feats0.dtype)
            protect_apply_time = ttime() - protect_apply_start
            logger.info(f"Feature protection application completed in {protect_apply_time:.3f}s")

        # Final inference
        final_infer_start = ttime()
        p_len = torch.tensor([p_len], device=self.device).long()
        with torch.no_grad():
            hasp = pitch is not None and pitchf is not None
            arg = (feats, p_len, pitch, pitchf, sid) if hasp else (feats, p_len, sid)
            
            # Break down inference steps
            infer_prep_start = ttime()
            logger.info("Preparing inference arguments...")
            infer_prep_time = ttime() - infer_prep_start
            logger.info(f"Inference preparation completed in {infer_prep_time:.3f}s")
            
            # Model forward pass
            forward_start = ttime()
            logger.info("Starting model forward pass...")
            audio1 = net_g.infer(*arg)[0][0, 0]
            forward_time = ttime() - forward_start
            logger.info(f"Model forward pass completed in {forward_time:.3f}s")
            
            # Data transfer and conversion
            transfer_start = ttime()
            logger.info("Transferring data to CPU and converting...")
            audio1 = audio1.data.cpu().float().numpy()
            transfer_time = ttime() - transfer_start
            logger.info(f"Data transfer and conversion completed in {transfer_time:.3f}s")
            
            del hasp, arg
        final_infer_time = ttime() - final_infer_start
        logger.info(f"Final inference completed in {final_infer_time:.3f}s")
        logger.info("Final inference timing breakdown:")
        logger.info(f"- Inference preparation: {infer_prep_time:.3f}s")
        logger.info(f"- Model forward pass: {forward_time:.3f}s")
        logger.info(f"- Data transfer and conversion: {transfer_time:.3f}s")

        # Cleanup
        cleanup_start = ttime()
        del feats, p_len, padding_mask
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        cleanup_time = ttime() - cleanup_start
        logger.info(f"Memory cleanup completed in {cleanup_time:.3f}s")

        total_time = ttime() - vc_start
        logger.info(f"Voice conversion step completed in {total_time:.3f}s")
        logger.info("Voice conversion timing breakdown:")
        logger.info(f"- Feature preparation: {feat_prep_time:.3f}s")
        logger.info(f"- Model inference: {model_infer_time:.3f}s")
        if protect < 0.5 and pitch is not None and pitchf is not None:
            logger.info(f"- Feature protection setup: {protect_time:.3f}s")
        if not isinstance(index, type(None)) and not isinstance(big_npy, type(None)) and index_rate != 0:
            logger.info(f"- Index search and mixing: {index_search_time:.3f}s")
        logger.info(f"- Feature interpolation: {interp_time:.3f}s")
        logger.info(f"- Length adjustment: {len_adj_time:.3f}s")
        if protect < 0.5 and pitch is not None and pitchf is not None:
            logger.info(f"- Feature protection application: {protect_apply_time:.3f}s")
        logger.info(f"- Final inference: {final_infer_time:.3f}s")
        logger.info(f"- Memory cleanup: {cleanup_time:.3f}s")

        times["npy"] += model_infer_time
        times["infer"] += final_infer_time
        return audio1

    def pipeline(
        self,
        model,
        net_g,
        sid,
        audio,
        input_audio_path,
        times,
        f0_up_key,
        f0_method,
        file_index,
        index_rate,
        if_f0,
        filter_radius,
        tgt_sr,
        resample_sr,
        rms_mix_rate,
        version,
        protect,
        f0_file=None,
    ):
        pipeline_start = ttime()
        logger.info("Starting pipeline processing...")

        # Index loading phase
        index_load_start = ttime()
        if (
            file_index
            and file_index != ""
            and os.path.exists(file_index)
            and index_rate != 0
        ):
            try:
                logger.info("Loading FAISS index...")
                index_load_file_start = ttime()
                index = faiss.read_index(file_index)
                index_load_file_time = ttime() - index_load_file_start
                logger.info(f"FAISS index file loaded in {index_load_file_time:.3f}s")

                reconstruct_start = ttime()
                big_npy = index.reconstruct_n(0, index.ntotal)
                reconstruct_time = ttime() - reconstruct_start
                logger.info(f"Index reconstruction completed in {reconstruct_time:.3f}s")
                logger.info(f"Index loaded successfully with {index.ntotal} entries")
            except:
                logger.warning("Failed to load index, continuing without it")
                traceback.print_exc()
                index = big_npy = None
        else:
            index = big_npy = None
        index_load_time = ttime() - index_load_start
        logger.info(f"Index loading completed in {index_load_time:.3f}s")

        # Audio preprocessing phase
        preprocess_start = ttime()
        logger.info("Preprocessing audio...")
        filter_start = ttime()
        audio = signal.filtfilt(bh, ah, audio)
        filter_time = ttime() - filter_start
        logger.info(f"Audio filtering completed in {filter_time:.3f}s")

        pad_start = ttime()
        audio_pad = np.pad(audio, (self.window // 2, self.window // 2), mode="reflect")
        pad_time = ttime() - pad_start
        logger.info(f"Audio padding completed in {pad_time:.3f}s")

        opt_ts = []
        if audio_pad.shape[0] > self.t_max:
            opt_start = ttime()
            audio_sum = np.zeros_like(audio)
            for i in range(self.window):
                audio_sum += np.abs(audio_pad[i : i - self.window])
            for t in range(self.t_center, audio.shape[0], self.t_center):
                opt_ts.append(
                    t
                    - self.t_query
                    + np.where(
                        audio_sum[t - self.t_query : t + self.t_query]
                        == audio_sum[t - self.t_query : t + self.t_query].min()
                    )[0][0]
                )
            opt_time = ttime() - opt_start
            logger.info(f"Optimal timestamps calculation completed in {opt_time:.3f}s")
        preprocess_time = ttime() - preprocess_start
        logger.info(f"Audio preprocessing completed in {preprocess_time:.3f}s")

        # F0 extraction phase
        f0_start = ttime()
        logger.info("Starting F0 extraction...")
        s = 0
        audio_opt = []
        t = None
        t1 = ttime()
        audio_pad = np.pad(audio, (self.t_pad, self.t_pad), mode="reflect")
        p_len = audio_pad.shape[0] // self.window
        inp_f0 = None
        if hasattr(f0_file, "name"):
            try:
                f0_file_start = ttime()
                with open(f0_file.name, "r") as f:
                    lines = f.read().strip("\n").split("\n")
                inp_f0 = []
                for line in lines:
                    inp_f0.append([float(i) for i in line.split(",")])
                inp_f0 = np.array(inp_f0, dtype="float32")
                f0_file_time = ttime() - f0_file_start
                logger.info(f"F0 file processing completed in {f0_file_time:.3f}s")
            except:
                traceback.print_exc()
        sid = torch.tensor(sid, device=self.device).unsqueeze(0).long()
        pitch, pitchf = None, None
        if if_f0 == 1:
            f0_extract_start = ttime()
            pitch, pitchf = self.get_f0(
                input_audio_path,
                audio_pad,
                p_len,
                f0_up_key,
                f0_method,
                filter_radius,
                inp_f0,
            )
            f0_extract_time = ttime() - f0_extract_start
            logger.info(f"F0 extraction completed in {f0_extract_time:.3f}s")

            pitch_process_start = ttime()
            pitch = pitch[:p_len]
            pitchf = pitchf[:p_len]
            if "mps" not in str(self.device) or "xpu" not in str(self.device):
                pitchf = pitchf.astype(np.float32)
            pitch = torch.tensor(pitch, device=self.device).unsqueeze(0).long()
            pitchf = torch.tensor(pitchf, device=self.device).unsqueeze(0).float()
            pitch_process_time = ttime() - pitch_process_start
            logger.info(f"Pitch processing completed in {pitch_process_time:.3f}s")
        f0_time = ttime() - f0_start
        logger.info(f"F0 extraction completed in {f0_time:.3f}s")

        # Voice conversion phase
        vc_start = ttime()
        logger.info("Starting voice conversion...")
        t2 = ttime()
        times["f0"] += t2 - t1
        for t in opt_ts:
            t = t // self.window * self.window
            vc_chunk_start = ttime()
            if if_f0 == 1:
                audio_opt.append(
                    self.vc(
                        model,
                        net_g,
                        sid,
                        audio_pad[s : t + self.t_pad2 + self.window],
                        pitch[:, s // self.window : (t + self.t_pad2) // self.window],
                        pitchf[:, s // self.window : (t + self.t_pad2) // self.window],
                        times,
                        index,
                        big_npy,
                        index_rate,
                        version,
                        protect,
                    )[self.t_pad_tgt : -self.t_pad_tgt]
                )
            else:
                audio_opt.append(
                    self.vc(
                        model,
                        net_g,
                        sid,
                        audio_pad[s : t + self.t_pad2 + self.window],
                        None,
                        None,
                        times,
                        index,
                        big_npy,
                        index_rate,
                        version,
                        protect,
                    )[self.t_pad_tgt : -self.t_pad_tgt]
                )
            vc_chunk_time = ttime() - vc_chunk_start
            logger.info(f"Voice conversion chunk completed in {vc_chunk_time:.3f}s")
            s = t

        final_chunk_start = ttime()
        if if_f0 == 1:
            audio_opt.append(
                self.vc(
                    model,
                    net_g,
                    sid,
                    audio_pad[t:],
                    pitch[:, t // self.window :] if t is not None else pitch,
                    pitchf[:, t // self.window :] if t is not None else pitchf,
                    times,
                    index,
                    big_npy,
                    index_rate,
                    version,
                    protect,
                )[self.t_pad_tgt : -self.t_pad_tgt]
            )
        else:
            audio_opt.append(
                self.vc(
                    model,
                    net_g,
                    sid,
                    audio_pad[t:],
                    None,
                    None,
                    times,
                    index,
                    big_npy,
                    index_rate,
                    version,
                    protect,
                )[self.t_pad_tgt : -self.t_pad_tgt]
            )
        final_chunk_time = ttime() - final_chunk_start
        logger.info(f"Final voice conversion chunk completed in {final_chunk_time:.3f}s")
        vc_time = ttime() - vc_start
        logger.info(f"Voice conversion completed in {vc_time:.3f}s")

        # Post-processing phase
        postprocess_start = ttime()
        logger.info("Starting post-processing...")
        concat_start = ttime()
        audio_opt = np.concatenate(audio_opt)
        concat_time = ttime() - concat_start
        logger.info(f"Audio concatenation completed in {concat_time:.3f}s")

        if rms_mix_rate != 1:
            rms_start = ttime()
            audio_opt = change_rms(audio, 16000, audio_opt, tgt_sr, rms_mix_rate)
            rms_time = ttime() - rms_start
            logger.info(f"RMS mixing completed in {rms_time:.3f}s")

        if tgt_sr != resample_sr >= 16000:
            resample_start = ttime()
            audio_opt = librosa.resample(
                audio_opt, orig_sr=tgt_sr, target_sr=resample_sr
            )
            resample_time = ttime() - resample_start
            logger.info(f"Audio resampling completed in {resample_time:.3f}s")

        normalize_start = ttime()
        audio_max = np.abs(audio_opt).max() / 0.99
        max_int16 = 32768
        if audio_max > 1:
            max_int16 /= audio_max
        audio_opt = (audio_opt * max_int16).astype(np.int16)
        normalize_time = ttime() - normalize_start
        logger.info(f"Audio normalization completed in {normalize_time:.3f}s")

        cleanup_start = ttime()
        del pitch, pitchf, sid
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        cleanup_time = ttime() - cleanup_start
        logger.info(f"Memory cleanup completed in {cleanup_time:.3f}s")

        postprocess_time = ttime() - postprocess_start
        logger.info(f"Post-processing completed in {postprocess_time:.3f}s")

        total_time = ttime() - pipeline_start
        logger.info("Pipeline timing breakdown:")
        logger.info(f"- Total pipeline time: {total_time:.3f}s")
        logger.info(f"- Index loading: {index_load_time:.3f}s")
        logger.info(f"- Audio preprocessing: {preprocess_time:.3f}s")
        logger.info(f"- F0 extraction: {f0_time:.3f}s")
        logger.info(f"- Voice conversion: {vc_time:.3f}s")
        logger.info(f"- Post-processing: {postprocess_time:.3f}s")

        return audio_opt