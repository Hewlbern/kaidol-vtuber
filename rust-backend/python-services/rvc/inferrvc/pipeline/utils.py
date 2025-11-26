import os
import logging
from fairseq import checkpoint_utils
from fairseq.data.dictionary import Dictionary
import torch
from torch.serialization import add_safe_globals

# Add fairseq Dictionary to safe globals for PyTorch 2.6+
add_safe_globals([Dictionary])

logger: logging.Logger = logging.getLogger(__name__)


def get_index_path_from_model(model_path: str) -> str:
    """Get the index file path from the model path."""
    model_dir = os.path.dirname(model_path)
    model_name = os.path.splitext(os.path.basename(model_path))[0]
    index_path = os.path.join(model_dir, f"{model_name}.index")
    return index_path if os.path.exists(index_path) else ""


def load_hubert(config, hubert_path: str):
    """Load HuBERT model with proper error handling and logging."""
    if not hubert_path or not os.path.exists(hubert_path):
        raise ValueError(f"HuBERT model path not found: {hubert_path}")
        
    try:
        # Add Dictionary to safe globals for PyTorch 2.6+
        torch.serialization.add_safe_globals([Dictionary])
        
        # Load model ensemble using the loaded state
        models, _, _ = checkpoint_utils.load_model_ensemble_and_task(
            [hubert_path],
            suffix="",
            strict=False,
            arg_overrides={"data": hubert_path}
        )
        hubert_model = models[0]
        hubert_model = hubert_model.to(config.device)
        hubert_model = hubert_model.half() if config.is_half else hubert_model.float()
        
        logger.info("HuBERT model loaded successfully")
        return hubert_model.eval()
    except Exception as e:
        logger.error(f"Error loading HuBERT model from {hubert_path}: {str(e)}")
        raise