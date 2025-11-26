import argparse
import json
import os
import sys
from multiprocessing import cpu_count

import torch
import numpy as np
from scipy import signal

# try:
#     import intel_extension_for_pytorch as ipex  # pylint: disable=import-error, unused-import
#
#     if torch.xpu.is_available():
#         from infer.modules.ipex import ipex_init
#
#         ipex_init()
# except Exception:  # pylint: disable=broad-exception-caught
#     pass

import logging
logger = logging.getLogger(__name__)


version_config_list = [
    "v1/32k.json",
    "v1/40k.json",
    "v1/48k.json",
    "v2/48k.json",
    "v2/32k.json",
]


def singleton_variable(func):
    def wrapper(*args, **kwargs):
        if not wrapper.instance:
            wrapper.instance = func(*args, **kwargs)
        return wrapper.instance

    wrapper.instance = None
    return wrapper


# Device configuration
_cpu = "cpu"
_gpu = "cuda" if torch.cuda.is_available() else "cpu"
_devgp = _gpu

# Initialize global variables
enable_butterfilter = True
ah_tensor = None
bh_tensor = None

def get_device():
    """Get device configuration."""
    return _cpu, _gpu, _devgp

def initialize_global_components():
    """Initialize global components for audio processing."""
    global ah_tensor, bh_tensor, enable_butterfilter
    
    # Import ResampleCache here to avoid circular imports
    from .audio_processing import ResampleCache
    
    # Initialize resample cache
    resample_cache = ResampleCache()
    
    # Initialize Butterworth filter coefficients
    # These are used for high-pass filtering
    bh, ah = signal.butter(4, 30/16000, btype='highpass')
    
    # Convert filter coefficients to double precision tensors
    bh_tensor = torch.tensor(bh, dtype=torch.float64)
    ah_tensor = torch.tensor(ah, dtype=torch.float64)
    
    return resample_cache, (bh_tensor, ah_tensor), enable_butterfilter

@singleton_variable
class Config:
    def __init__(self):
        self.device = "cuda:0"
        self.is_half = True
        self.use_jit = False
        self.n_cpu = 0
        self.gpu_name = None
        self.json_config = self.load_config_json()
        self.gpu_mem = None
        (
            self.python_cmd,
            self.listen_port,
            self.iscolab,
            self.noparallel,
            self.noautoopen,
            self.dml,
        ) = self.arg_parse()
        self.instead = ""
        self.x_pad, self.x_query, self.x_center, self.x_max = self.device_config()
        
        # Add window size configuration
        self.window = 16000  # Default window size for audio processing
        self.t_max = self.window * self.x_max
        self.t_pad = self.window * self.x_pad
        self.t_pad_tgt = self.window * self.x_pad
        self.t_pad2 = self.t_pad * 2
        self.t_query = self.window * self.x_query
        self.t_center = self.window * self.x_center
        self.t_timestep = self.window // 160  # 160 is the hop length for HuBERT

    @staticmethod
    def load_config_json() -> dict:
        d = {}
        for config_file in version_config_list:
            with open(os.path.join(os.path.dirname(__file__),config_file), "r") as f:
                d[config_file] = json.load(f)
        return d

    @staticmethod
    def arg_parse() -> tuple:
        exe = sys.executable or "python"
        parser = argparse.ArgumentParser()
        parser.add_argument("--port", type=int, default=7865, help="Listen port")
        parser.add_argument("--pycmd", type=str, default=exe, help="Python command")
        parser.add_argument("--colab", action="store_true", help="Launch in colab")
        parser.add_argument(
            "--noparallel", action="store_true", help="Disable parallel processing"
        )
        parser.add_argument(
            "--noautoopen",
            action="store_true",
            help="Do not open in browser automatically",
        )
        parser.add_argument(
            "--dml",
            action="store_true",
            help="torch_dml",
        )
        cmd_opts = parser.parse_args()

        cmd_opts.port = cmd_opts.port if 0 <= cmd_opts.port <= 65535 else 7865

        return (
            cmd_opts.pycmd,
            cmd_opts.port,
            cmd_opts.colab,
            cmd_opts.noparallel,
            cmd_opts.noautoopen,
            cmd_opts.dml,
        )

    # has_mps is only available in nightly pytorch (for now) and MasOS 12.3+.
    # check `getattr` and try it for compatibility
    @staticmethod
    def has_mps() -> bool:
        if not torch.backends.mps.is_available():
            return False
        try:
            torch.zeros(1).to(torch.device("mps"))
            return True
        except Exception:
            return False

    @staticmethod
    def has_xpu() -> bool:
        if hasattr(torch, "xpu") and torch.xpu.is_available():
            return True
        else:
            return False

    def use_fp32_config(self):
        for config_file in version_config_list:
            self.json_config[config_file]["train"]["fp16_run"] = False
            with open(os.path.join(os.path.dirname(__file__),config_file), "r") as f:
                strr = f.read().replace("true", "false") #Also not needed for inferencing but leaving.
            with open(os.path.join(os.path.dirname(__file__),config_file), "w") as f:
                f.write(strr)
        #also not needed for inference
        # with open("infer/modules/train/preprocess.py", "r") as f:
        #     strr = f.read().replace("3.7", "3.0")
        # with open("infer/modules/train/preprocess.py", "w") as f:
        #     f.write(strr)
        logger.info("Overwriting configs.json for accelerator use.")#print("overwrite preprocess and configs.json")

    #I don't think this is used for inference but we will see.
    def device_config(self) -> tuple:
        print(f"device_config called")
        if torch.cuda.is_available():
            print(f"torch.cuda.is_available()")
            if self.has_xpu():
                print(f"self.has_xpu()")
                self.device = self.instead = "xpu:0"
                self.is_half = True
            i_device = int(self.device.split(":")[-1])
            self.gpu_name = torch.cuda.get_device_name(i_device)
            if (
                ("16" in self.gpu_name and "V100" not in self.gpu_name.upper())
                or "P40" in self.gpu_name.upper()
                or "P10" in self.gpu_name.upper()
                or "1060" in self.gpu_name
                or "1070" in self.gpu_name
                or "1080" in self.gpu_name
            ):
                logger.info("Found GPU %s, force to fp32", self.gpu_name)
                self.is_half = False
                self.use_fp32_config()
            else:
                logger.info("Found GPU %s", self.gpu_name)
            self.gpu_mem = int(
                torch.cuda.get_device_properties(i_device).total_memory
                / 1024
                / 1024
                / 1024
                + 0.4
            )
        else:
            # Force CPU usage for non-CUDA devices (including Apple Silicon)
            logger.info("No supported Nvidia GPU found, using CPU")
            self.device = self.instead = "cpu"
            self.is_half = False
            self.use_fp32_config()

        if self.n_cpu == 0:
            self.n_cpu = cpu_count()

        if self.is_half:
            # 6G显存配置
            x_pad = 1
            x_query = 10
            x_center = 60
            x_max = 65
        else:
            # 5G显存配置
            x_pad = 1
            x_query = 6
            x_center = 38
            x_max = 41

        if self.gpu_mem is not None and self.gpu_mem <= 4:
            x_pad = 1
            x_query = 5
            x_center = 30
            x_max = 32
        if self.dml:
            logger.info("Use DirectML instead")
            if (
                os.path.exists(
                    "runtime\Lib\site-packages\onnxruntime\capi\DirectML.dll"
                )
                == False
            ):
                try:
                    os.rename(
                        "runtime\Lib\site-packages\onnxruntime",
                        "runtime\Lib\site-packages\onnxruntime-cuda",
                    )
                except:
                    pass
                try:
                    os.rename(
                        "runtime\Lib\site-packages\onnxruntime-dml",
                        "runtime\Lib\site-packages\onnxruntime",
                    )
                except:
                    pass
            # if self.device != "cpu":
            import torch_directml

            self.device = torch_directml.device(torch_directml.default_device())
            self.is_half = False
        else:
            if self.instead:
                logger.info(f"Use {self.instead} instead")
            if (
                os.path.exists(
                    "runtime\Lib\site-packages\onnxruntime\capi\onnxruntime_providers_cuda.dll"
                )
                == False
            ):
                try:
                    os.rename(
                        "runtime\Lib\site-packages\onnxruntime",
                        "runtime\Lib\site-packages\onnxruntime-dml",
                    )
                except:
                    pass
                try:
                    os.rename(
                        "runtime\Lib\site-packages\onnxruntime-cuda",
                        "runtime\Lib\site-packages\onnxruntime",
                    )
                except:
                    pass
        logger.info("Selecting device:%s, is_half:%s" % (self.device,self.is_half))
        print("Selecting device:%s, is_half:%s" % (self.device,self.is_half))
        return x_pad, x_query, x_center, x_max
