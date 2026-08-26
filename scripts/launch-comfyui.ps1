# Headless ComfyUI for fvtt-mcp-artificer (see that repo's ROADMAP.md, M0).
# API mode on 127.0.0.1:8188; outputs land in the artificer output root.
$root = 'D:\Workbench\LOCAL\LocalAI'
New-Item -ItemType Directory -Force "$root\output" | Out-Null
Set-Location "$root\ComfyUI_windows_portable"
& .\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build `
    --listen 127.0.0.1 --port 8188 --disable-auto-launch `
    --output-directory "$root\output"
