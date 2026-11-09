import os
from PIL import Image

src_dir = r"D:\Deepseek\dshwork\dsh-memory\docs\screenshots"
out_dir = os.path.join(src_dir, "optimized")
os.makedirs(out_dir, exist_ok=True)

for name in sorted(os.listdir(src_dir)):
    if not name.endswith(".png"):
        continue
    src = os.path.join(src_dir, name)
    img = Image.open(src).convert("RGB")
    w, h = img.size
    # 256 色调色板量化：UI 截图基本是纯色块+文字，视觉上与原图无差
    q = img.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
    out = os.path.join(out_dir, name)
    q.save(out, format="PNG", optimize=True)
    print(f"{name}: {w}x{h}  {os.path.getsize(src)/1024:.0f}KB -> {os.path.getsize(out)/1024:.0f}KB")
