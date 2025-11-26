import os
# Set OpenMP environment variable before any imports
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import uvicorn
from .server import app

def run_server():
    uvicorn.run(
        "src.open_llm_vtuber.rvc.debug.server:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

if __name__ == "__main__":
    run_server() 