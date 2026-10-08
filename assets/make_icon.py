#!/usr/bin/env python3
"""make_icon.py - generate the DiscordLight app icon set (original artwork).

Design: "Graphite Console" - a graphite Big Sur-style squircle tile with a single
bold amber lightning bolt. No third-party logos, mascots or wordmarks.

Lives in the repo's assets/ folder and writes next to itself, whatever the working directory:
  AppIcon.png            1024x1024 RGBA master
  AppIcon.icns           PNG-encoded ICNS (icp4..ic14), self-packed + verified
  touchbar_icon.png      36x36 RGBA bolt only (2 px padding)

Usage (from the repo root):
  python3 assets/make_icon.py                     # regenerate the three files above
  python3 assets/make_icon.py --preview /tmp/dl   # also write preview.png (contact sheet on light and
                                                  # dark backgrounds) and touchbar_icon@1x.png (18x18
                                                  # reference) into /tmp/dl, outside the repo

Requires only Pillow + numpy. Deterministic and idempotent (same bytes on every run), no network.
The Makefile copies AppIcon.icns and touchbar_icon.png into the app bundle; AppIcon.png is the master.
"""
import argparse
import io
import math
import os
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ASSETS = os.path.dirname(os.path.abspath(__file__))   # <repo>/assets

# ---------------------------------------------------------------- palette ---
GRAPHITE_TOP = (0x31, 0x31, 0x35)
GRAPHITE_MID = (0x2A, 0x2A, 0x2E)
GRAPHITE_BOT = (0x24, 0x24, 0x28)
AMBER = (0xFF, 0xD6, 0x0A)
AMBER_HI = (0xFF, 0xE2, 0x7A)
PREVIEW_LIGHT = (0xF2, 0xF2, 0xF7)
PREVIEW_DARK = (0x1B, 0x1B, 0x1D)

# ------------------------------------------------------------ icon grid ---
BASE = 1024
TILE = (100.0, 100.0, 924.0, 924.0)   # 824 px tile on the 1024 canvas
SQUIRCLE_N = 5.0                       # superellipse exponent (~22.5% corner)
SS = 4                                 # supersampling factor for vector shapes

# --------------------------------------------------------- bolt geometry ---
# Six points, normalised so the bolt is 1 unit tall; x is in the same units.
# Point-symmetric zig-zag made of two quadrilaterals:
#   upper wing (P0,P1,P2,P5) and lower wing (P5,P2,P3,P4).
# Order: top tip -> left end of step -> inner step -> bottom tip ->
#        right end of step -> inner step.
BOLT_MASTER = [(0.67, 0.00), (0.08, 0.59), (0.42, 0.59),
               (0.33, 1.00), (0.92, 0.41), (0.58, 0.41)]

MASTER = dict(bolt=BOLT_MASTER, bolt_h=0.48, round_r=7.0,
              inner_shadow=True, highlight=True, rim=True)
TILE_ONLY = dict(MASTER, bolt_h=0.0, inner_shadow=False, highlight=False, rim=False)

# Simplified bolts for 16/32 px, hand-hinted in *target pixel* coordinates:
# same six-point zig-zag, but much larger relative to the tile (~78% / ~78%
# of the tile height instead of 48%), chunkier wings, and the horizontal step
# edges placed exactly on pixel boundaries so the notch stays crisp.
BOLT_PIXEL = {
    16: dict(pts=[(11, 3), (4, 9), (7, 9), (5, 13), (12, 7), (9, 7)], r=0.0),
    32: dict(pts=[(19.5, 6), (8, 18), (14.5, 18), (12.5, 26), (24, 14), (17.5, 14)], r=0.4),
}
SMALL_RIM = dict(width=0.7, alpha=0.10)   # rim in target pixels for 16/32


# ============================================================ helpers ======
def blur(a, radius):
    """Gaussian-blur a float [0,1] mask via Pillow (8-bit is fine for shadows)."""
    im = Image.fromarray(np.clip(a * 255.0 + 0.5, 0, 255).astype(np.uint8), "L")
    im = im.filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(im, dtype=np.float32) / 255.0


def shift(a, dx, dy):
    """Shift a mask by integer pixels, filling with 0."""
    out = np.zeros_like(a)
    h, w = a.shape
    ys = slice(max(dy, 0), h + min(dy, 0))
    yd = slice(max(-dy, 0), h + min(-dy, 0))
    xs = slice(max(dx, 0), w + min(dx, 0))
    xd = slice(max(-dx, 0), w + min(-dx, 0))
    out[ys, xs] = a[yd, xd]
    return out


def squircle_mask(size, box, n=SQUIRCLE_N, inset=0.0, ss=SS):
    """Anti-aliased superellipse |x|^n + |y|^n <= 1 inside `box`."""
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    ax, ay = (x1 - x0) / 2.0 - inset, (y1 - y0) / 2.0 - inset
    c = ((np.arange(size * ss, dtype=np.float32) + 0.5) / ss)
    fx = np.abs((c - cx) / ax) ** n
    fy = np.abs((c - cy) / ay) ** n
    acc = np.zeros((size, size), dtype=np.float32)
    rows = size * ss
    step = 256 * ss                              # process in row blocks
    for r0 in range(0, rows, step):
        r1 = min(rows, r0 + step)
        inside = (fy[r0:r1, None] + fx[None, :]) <= 1.0
        blk = inside.reshape((r1 - r0) // ss, ss, size, ss).mean(axis=(1, 3))
        acc[r0 // ss:r1 // ss] = blk
    return acc


def _offset_polygon(pts, d):
    """Offset a simple polygon inward by d (mitred)."""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1]
               for i in range(n)) / 2.0
    sgn = 1.0 if area > 0 else -1.0
    lines = []
    for i in range(n):
        (px, py), (qx, qy) = pts[i], pts[(i + 1) % n]
        ex, ey = qx - px, qy - py
        L = math.hypot(ex, ey)
        nx, ny = sgn * -ey / L, sgn * ex / L        # inward normal
        lines.append(((px + d * nx, py + d * ny), (ex, ey)))
    out = []
    for i in range(n):
        (p1, e1), (p2, e2) = lines[i - 1], lines[i]
        den = e1[0] * e2[1] - e1[1] * e2[0]
        t = ((p2[0] - p1[0]) * e2[1] - (p2[1] - p1[1]) * e2[0]) / den
        out.append((p1[0] + t * e1[0], p1[1] + t * e1[1]))
    return out


def rounded_polygon_mask(size, pts, r=0.0, ss=SS):
    """Anti-aliased polygon with convex corners rounded by radius r
    (Minkowski sum of the r-inset polygon with a disk of radius r)."""
    S = size * ss
    im = Image.new("L", (S, S), 0)
    dr = ImageDraw.Draw(im)
    P = [(x * ss, y * ss) for x, y in pts]
    if r <= 0:
        dr.polygon(P, fill=255)
    else:
        R = r * ss
        Q = _offset_polygon(P, R)
        dr.polygon(Q, fill=255)
        n = len(Q)
        for i in range(n):
            (ax, ay), (bx, by) = Q[i], Q[(i + 1) % n]
            ex, ey = bx - ax, by - ay
            L = math.hypot(ex, ey)
            nx, ny = -ey / L * R, ex / L * R
            dr.polygon([(ax + nx, ay + ny), (bx + nx, by + ny),
                        (bx - nx, by - ny), (ax - nx, ay - ny)], fill=255)
            dr.ellipse([ax - R, ay - R, ax + R, ay + R], fill=255)
    im = im.reduce(ss)
    return np.asarray(im, dtype=np.float32) / 255.0


def bolt_points(geom, cx, cy, h):
    xs = [p[0] for p in geom]
    ys = [p[1] for p in geom]
    mx, my = (min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0
    return [(cx + (x - mx) * h, cy + (y - my) * h) for x, y in geom]


def vgradient(size, y0, y1, top, bot, mid=None):
    """Vertical gradient (H,W,3) float, top->(mid)->bot across [y0,y1]."""
    t = np.clip((np.arange(size, dtype=np.float32) + 0.5 - y0) / (y1 - y0), 0, 1)
    top, bot = np.array(top, np.float32), np.array(bot, np.float32)
    if mid is None:
        col = top[None, :] * (1 - t[:, None]) + bot[None, :] * t[:, None]
    else:
        mid = np.array(mid, np.float32)
        a = np.clip(t * 2, 0, 1)[:, None]
        b = np.clip(t * 2 - 1, 0, 1)[:, None]
        col = np.where(t[:, None] < 0.5, top * (1 - a) + mid * a, mid * (1 - b) + bot * b)
    return np.broadcast_to(col[:, None, :], (size, size, 3)) / 255.0


class Canvas:
    """Premultiplied-alpha float compositor."""

    def __init__(self, size):
        self.P = np.zeros((size, size, 3), np.float32)
        self.A = np.zeros((size, size), np.float32)

    def over(self, rgb, alpha):
        rgb = np.asarray(rgb, np.float32)
        if rgb.ndim == 1:
            rgb = rgb / 255.0 if rgb.max() > 1 else rgb
        alpha = np.clip(alpha, 0, 1)
        self.P = rgb * alpha[..., None] + self.P * (1 - alpha[..., None])
        self.A = alpha + self.A * (1 - alpha)

    def image(self):
        A = self.A
        rgb = np.where(A[..., None] > 1e-6, self.P / np.maximum(A[..., None], 1e-6), 0)
        out = np.dstack([rgb, A[..., None]])
        return Image.fromarray(np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8), "RGBA")


# ============================================================ renderers ====
def render_icon(spec, size=BASE):
    """Render the full icon at `size` (designed on the 1024 grid)."""
    k = size / BASE
    box = tuple(v * k for v in TILE)
    tile = squircle_mask(size, box)
    cv = Canvas(size)

    # 1. soft drop shadow outside the tile (black, blur 12, y+8, 35%)
    sh = blur(shift(tile, 0, int(round(8 * k))), 12 * k)
    cv.over((0, 0, 0), sh * 0.35)

    # 2. graphite fill with a very subtle vertical lightness ramp
    grad = vgradient(size, box[1], box[3], GRAPHITE_TOP, GRAPHITE_BOT, GRAPHITE_MID)
    cv.over(grad, tile)

    # 3. 1.5 px inner rim, white @ 10%
    if spec["rim"]:
        inner = squircle_mask(size, box, inset=1.5 * k)
        cv.over((255, 255, 255), np.clip(tile - inner, 0, 1) * 0.10)

    if spec["bolt_h"] <= 0:
        return cv.image()

    # 4. bolt
    side = box[2] - box[0]
    cx, cy = (box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0
    pts = bolt_points(spec["bolt"], cx, cy, spec["bolt_h"] * side)
    bolt = rounded_polygon_mask(size, pts, r=spec["round_r"] * k)

    if spec["inner_shadow"]:   # dark drop shadow, clipped to the tile
        bs = blur(shift(bolt, 0, int(round(6 * k))), 10 * k) * 0.25 * tile
        cv.over((0, 0, 0), bs)

    cv.over(AMBER, bolt)

    if spec["highlight"]:      # faint lighter-amber band on top-facing edges
        d = int(round(9 * k))
        band = bolt * (1 - shift(bolt, 0, d))
        band = blur(band, 2.0 * k) * bolt
        cv.over(AMBER_HI, band * 0.9)

    return cv.image()


def render_small(px, tile_master=None):
    """Simplified icon for 16/32 px: bigger, chunkier, pixel-hinted bolt drawn
    directly at the target size (no inner shadow, no highlight). Drawing the
    bolt natively avoids the dark Lanczos ringing a downscaled bolt gets."""
    if tile_master is None:
        tile_master = render_icon(TILE_ONLY, BASE)
    t = np.asarray(tile_master.resize((px, px), Image.LANCZOS), np.float32) / 255.0
    cv = Canvas(px)
    cv.over(t[..., :3], t[..., 3])
    k = px / BASE
    box = tuple(v * k for v in TILE)
    outer = squircle_mask(px, box, ss=16)
    inner = squircle_mask(px, box, inset=SMALL_RIM["width"], ss=16)
    cv.over((255, 255, 255), np.clip(outer - inner, 0, 1) * SMALL_RIM["alpha"])
    spec = BOLT_PIXEL[px]
    cv.over(AMBER, rounded_polygon_mask(px, spec["pts"], r=spec["r"], ss=16))
    return cv.image()


def render_touchbar(px, pad):
    """Bolt only, amber on transparent, fitted into px-2*pad square."""
    ss = 32
    geom = BOLT_MASTER
    xs = [p[0] for p in geom]
    ys = [p[1] for p in geom]
    gw, gh = max(xs) - min(xs), max(ys) - min(ys)
    avail = px - 2 * pad
    h0 = avail / max(gh, gw)         # geometric fit of the sharp outline

    def mask_for(h):                 # same corner softening as the master (7/396)
        return rounded_polygon_mask(px, bolt_points(geom, px / 2.0, px / 2.0, h),
                                    r=0.018 * h, ss=ss)

    # Rounded tips retract slightly, so grow the bolt until any further growth
    # would put coverage into the transparent padding ring.
    best = mask_for(h0)
    for i in range(1, 60):
        m = mask_for(h0 * (1 + 0.004 * i))
        ys, xs = np.nonzero(m > 0)
        if ys.min() < pad or xs.min() < pad or ys.max() >= px - pad or xs.max() >= px - pad:
            break
        best = m
    cv = Canvas(px)
    cv.over(AMBER, best)
    return cv.image()


# =============================================================== ICNS ======
ICNS_LAYOUT = [  # (type, pixel size)
    (b"icp4", 16), (b"icp5", 32), (b"icp6", 64),
    (b"ic07", 128), (b"ic08", 256), (b"ic09", 512), (b"ic10", 1024),
    (b"ic11", 32), (b"ic12", 64), (b"ic13", 256), (b"ic14", 512),
]


def png_bytes(im):
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def pack_icns(entries):
    """entries: list of (4-byte type, png bytes). Big-endian ICNS container."""
    body = b"".join(t + struct.pack(">I", len(d) + 8) + d for t, d in entries)
    return b"icns" + struct.pack(">I", len(body) + 8) + body


def verify_icns(path, expected):
    """Walk the ICNS back, check lengths, decode every PNG. Returns report lines."""
    data = open(path, "rb").read()
    lines = []
    assert data[:4] == b"icns", "bad magic"
    total = struct.unpack(">I", data[4:8])[0]
    lines.append(f"magic=icns header_len={total} file_len={len(data)}")
    assert total == len(data), "header length != file length"
    off, seen, acc = 8, [], 8
    exp = dict(expected)
    while off < total:
        t = data[off:off + 4]
        L = struct.unpack(">I", data[off + 4:off + 8])[0]
        payload = data[off + 8:off + L]
        assert payload[:8] == b"\x89PNG\r\n\x1a\n", f"{t!r} not PNG"
        im = Image.open(io.BytesIO(payload))
        im.load()
        ok = im.size == (exp[t], exp[t]) and im.mode == "RGBA"
        lines.append(f"  {t.decode()}  len={L:7d}  png={im.size[0]}x{im.size[1]} "
                     f"{im.mode}  expected={exp[t]}  {'OK' if ok else 'MISMATCH'}")
        assert ok, f"{t!r} size/mode mismatch"
        seen.append(t)
        acc += L
        off += L
    assert off == total and acc == total, "entry lengths do not sum to header length"
    assert sorted(seen) == sorted(exp), "missing/extra entries"
    lines.append(f"entries={len(seen)} sum(entry_len)+8={acc} == header_len: {acc == total}")
    # independent cross-check with Pillow's own ICNS reader
    with Image.open(path) as ic:
        sizes = sorted(ic.info.get("sizes", []))
        ic.load()
        lines.append(f"Pillow IcnsImagePlugin: opens OK, largest={ic.size}, "
                     f"sizes={sizes}")
    return lines


# ============================================================ preview ======
def _font(sz):
    try:
        return ImageFont.load_default(size=sz)
    except TypeError:  # very old Pillow
        return ImageFont.load_default()


def make_preview(images, path):
    """images: dict px -> RGBA image (the exact bitmaps shipped)."""
    master = images[1024].resize((320, 320), Image.LANCZOS)
    cells = [("1024 (scaled)", master)] + [(f"{s}", images[s]) for s in (256, 128, 64, 32, 16)]
    zooms = [("32 @4x", images[32].resize((128, 128), Image.NEAREST)),
             ("16 @8x", images[16].resize((128, 128), Image.NEAREST))]
    allc = cells + zooms
    gap, pad, lab = 36, 32, 28
    W = pad * 2 + sum(c[1].width for c in allc) + gap * (len(allc) - 1)
    rowh = pad + 320 + lab + pad // 2
    H = rowh * 2
    sheet = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    f = _font(15)
    for r, (bg, fg) in enumerate([(PREVIEW_LIGHT, (60, 60, 67)), (PREVIEW_DARK, (200, 200, 205))]):
        y0 = r * rowh + pad // 2
        band = Image.new("RGBA", (W, rowh), bg + (255,))
        sheet.alpha_composite(band, (0, r * rowh))
        d = ImageDraw.Draw(sheet)
        x = pad
        for i, (name, im) in enumerate(allc):
            yy = y0 + pad // 2 + (320 - im.height) // 2
            sheet.alpha_composite(im, (x, yy))
            tw = d.textlength(name, font=f)
            d.text((x + (im.width - tw) / 2, y0 + pad // 2 + 320 + 6), name, fill=fg, font=f)
            if i == len(cells) - 1:          # divider before zoom panels
                d.line([(x + im.width + gap // 2, y0 + 40),
                        (x + im.width + gap // 2, y0 + 320)], fill=fg + (90,), width=1)
            x += im.width + gap
    sheet.convert("RGB").save(path, optimize=True)


# =============================================================== main ======
def main(argv=None):
    ap = argparse.ArgumentParser(description="Regenerate the DiscordLight icon set in assets/.")
    ap.add_argument("--preview", metavar="DIR",
                    help="also write preview.png and touchbar_icon@1x.png into DIR (keep it outside the repo)")
    args = ap.parse_args(argv)

    written = []
    master = render_icon(MASTER, BASE)
    master.save(os.path.join(ASSETS, "AppIcon.png"), optimize=True)
    written.append(os.path.join(ASSETS, "AppIcon.png"))

    tile_master = render_icon(TILE_ONLY, BASE)
    small = {16: render_small(16, tile_master), 32: render_small(32, tile_master)}
    images = {1024: master}
    for s in (512, 256, 128, 64):
        images[s] = master.resize((s, s), Image.LANCZOS)
    images.update(small)

    entries = [(t, png_bytes(images[s])) for t, s in ICNS_LAYOUT]
    icns_path = os.path.join(ASSETS, "AppIcon.icns")
    with open(icns_path, "wb") as fh:
        fh.write(pack_icns(entries))
    written.append(icns_path)
    report = verify_icns(icns_path, ICNS_LAYOUT)

    tb_path = os.path.join(ASSETS, "touchbar_icon.png")
    render_touchbar(36, 2).save(tb_path, optimize=True)
    written.append(tb_path)

    if args.preview:
        out = os.path.abspath(args.preview)
        os.makedirs(out, exist_ok=True)
        tb1 = os.path.join(out, "touchbar_icon@1x.png")
        render_touchbar(18, 1).save(tb1, optimize=True)
        prev = os.path.join(out, "preview.png")
        make_preview(images, prev)
        written += [tb1, prev]

    print("ICNS verification:")
    print("\n".join(report))
    for p in written:
        print(f"{p}  {os.path.getsize(p):8d} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
