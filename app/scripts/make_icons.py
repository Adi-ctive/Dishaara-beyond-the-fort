# Draws the Dishaara app icon (indigo location pin on marigold) as PNGs, with no image library.
# Usage: python -I scripts/make_icons.py public
import math
import struct
import sys
import zlib

MARIGOLD = (232, 150, 42)
INDIGO = (38, 52, 107)
CREAM = (255, 247, 234)


def png(path, size, pixels):
    raw = b"".join(b"\x00" + bytes(c for px in pixels[y * size:(y + 1) * size] for c in px) for y in range(size))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(data)


def icon(size, maskable):
    s = size
    out = []
    pad = 0 if maskable else s * 0.06
    r_corner = s * 0.22
    cx, cy = s / 2, s * 0.44
    R = s * (0.22 if maskable else 0.24)  # pin head radius
    tip = s * (0.80 if maskable else 0.82)
    for y in range(s):
        for x in range(s):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in (0.25, 0.75):  # 4x supersampling for smooth edges
                for sx in (0.25, 0.75):
                    px, py = x + sx, y + sy
                    # rounded square background (full bleed when maskable)
                    inside_bg = True
                    if not maskable:
                        qx = max(pad + r_corner - px, 0, px - (s - pad - r_corner))
                        qy = max(pad + r_corner - py, 0, py - (s - pad - r_corner))
                        inside_bg = (qx * qx + qy * qy) <= r_corner * r_corner and pad <= px <= s - pad and pad <= py <= s - pad
                    col = None
                    if inside_bg:
                        col = MARIGOLD
                        d = math.hypot(px - cx, py - cy)
                        # pin: circle plus a triangle to the tip, tangent-ish
                        half = R * (tip - py) / (tip - cy) if cy <= py <= tip else -1
                        in_pin = d <= R or (cy <= py <= tip and abs(px - cx) <= min(R * 0.97, half * 1.3))
                        if in_pin:
                            col = INDIGO
                            if d <= R * 0.42:
                                col = CREAM
                    if col:
                        acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]; acc[3] += 255
            n = 4
            a = acc[3] / n
            if a == 0:
                out.append((0, 0, 0, 0))
            else:
                k = 255 / a / n * (a / 255)
                out.append((round(acc[0] / (acc[3] / 255)), round(acc[1] / (acc[3] / 255)), round(acc[2] / (acc[3] / 255)), round(a)))
    return out


if __name__ == "__main__":
    d = sys.argv[1]
    for size in (192, 512):
        png(f"{d}/icon-{size}.png", size, icon(size, False))
    png(f"{d}/icon-maskable-512.png", 512, icon(512, True))
    png(f"{d}/apple-touch-icon.png", 180, icon(180, True))
    print("ok")
