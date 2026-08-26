#!/usr/bin/env bash
# ai-toolkit environment setup for the RTX 5090 (Blackwell, needs CUDA 12.8+ wheels).
#
# Must use the system python.org install, NOT uv-managed CPython: Windows Application
# Control (Defender) blocks the uv build's _ctypes DLL, so torch cannot import there.
set -e
cd "D:/Workbench/LOCAL/LocalAI/ai-toolkit"

VP="D:/Workbench/LOCAL/LocalAI/ai-toolkit/venv/Scripts/python.exe"

echo "== creating venv (system python 3.13) =="
py -3.13 -m venv venv

echo "== upgrading pip =="
"$VP" -m pip install --upgrade pip setuptools wheel

echo "== installing torch (cu128, Blackwell) =="
"$VP" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128

echo "== installing ai-toolkit requirements =="
"$VP" -m pip install -r requirements.txt

echo "== verifying =="
"$VP" -c "import torch;print('torch',torch.__version__,'cuda',torch.version.cuda,'avail',torch.cuda.is_available(),torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
echo "== DONE =="
