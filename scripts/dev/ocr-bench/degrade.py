#!/usr/bin/env python3
# The OCR benchmark's degradation ladder (2026-10-09, transcript accuracy
# program, OCR step 9): clean page rasters in, one folder per level out — the
# page images plus ONE image-only PDF per level holding every page, so the
# app's real OCR path (a PDF rendered by pdfjs at scale 3.0, then Tesseract)
# can run each level exactly as a student's upload would. Pillow + numpy only.
#
#   python3 scripts/dev/ocr-bench/degrade.py --name banner-transcript --out DIR \
#       --levels L0,L1,L2,L3,L4,L5,L6,L7 --dpi 200 --seed 7 --source-dpi 300 \
#       [--text-lines truth.json] [--watermark "EXAMPLE UNIVERSITY"] page1.png page2.png …
#
# Input pages are the CLEAN raster of a document at --source-dpi (300 — the
# bench renders every seed once at 300 dpi; L5 needs that, the other levels
# resample down from it). Every level is seeded: the same (--seed, page index,
# level) always draws the same skew, noise and seal, and every drawn value is
# written to DIR/manifest.json so a run can be repeated or questioned.
#
# The ladder (fixed by the plan; a level's dpi is part of its definition —
# only L0, the clean raster, takes --dpi):
#   L0  clean raster at --dpi, PNG (lossless)
#   L1  good scan: 200 dpi, Gaussian blur σ 0.6, JPEG q75
#   L2  office scan: 150 dpi, skew ±0.5–1.5°, Gaussian noise σ 6, a lighting
#       gradient, JPEG q60
#   L3  photocopy: 200 dpi, skew 2–3°, salt-and-pepper 0.2 %, thin white
#       streaks, a dark border band, a hard contrast curve; PNG
#   L4  stamped/watermarked: L1 plus a DRAWN red seal (ring, star, text on a
#       circle; alpha 0.5–0.7; never a real seal or logo) over the table and a
#       diagonal UNOFFICIAL / university-name watermark at alpha 0.15; JPEG q75
#   L5  phone photo: from the 300-dpi source, perspective (1–3 % corner
#       offsets), a shadow gradient, downscaled to 1200–1600 px wide, JPEG q50
#   L6  rotated page: L1 turned 90° (L6-90) and 180° (L6-180)
#   L7  scanner text layer: the L2 image wrapped with a deliberately POOR
#       invisible text layer (the truth lines, seeded OCR-style confusions, one
#       run per line, render mode 3) — the app then takes its exact text path
#       and never offers OCR; needs --text-lines (the ground-truth line list
#       with '' between pages), else L7 is skipped with a note.
#
# The PDF writer is this file's own (write_pdf): Pillow's PDF plugin re-encodes
# every L/RGB page as JPEG q75, which would add a compression step the level
# did not define. Here a PNG level is stored losslessly (FlateDecode) and a
# JPEG level embeds the level's own JPEG bytes (DCTDecode) unchanged.
#
# FERPA: this script draws what it is given. Seeds are synthetic or public
# documents; a private seed's outputs stay outside the repository.
import argparse
import io
import json
import math
import os
import re
import sys
import zlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6-90', 'L6-180', 'L7']

# Fonts: the Mac's Supplemental folder, or DejaVu on Linux (same precedent as
# tests/fixtures/make-scan-fixture.py).
FONT_BOLD = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']


def font(candidates, size):
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    raise SystemExit('degrade.py: no usable font found: ' + ', '.join(candidates))


def resample(img, src_dpi, dst_dpi):
    """Scale a raster from one dpi to another (LANCZOS); unchanged when equal."""
    if src_dpi == dst_dpi:
        return img.copy()
    w = max(1, round(img.width * dst_dpi / src_dpi))
    h = max(1, round(img.height * dst_dpi / src_dpi))
    return img.resize((w, h), Image.LANCZOS)


def skew(img, degrees):
    """Rotate a few degrees about the centre, paper-white corners, same size."""
    fill = 255 if img.mode == 'L' else (255, 255, 255)
    return img.rotate(degrees, resample=Image.BICUBIC, expand=False, fillcolor=fill)


def gaussian_noise(img, sigma, rng):
    a = np.asarray(img).astype(np.float32)
    a += rng.normal(0.0, sigma, a.shape)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), img.mode)


def lighting_gradient(img, rng, low):
    """Multiply by a linear ramp 1.0 → `low` along a random direction — the
    uneven lamp of a flatbed or a copier."""
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    angle = rng.uniform(0, 2 * math.pi)
    ys, xs = np.mgrid[0:h, 0:w]
    t = (xs * math.cos(angle) + ys * math.sin(angle)).astype(np.float32)
    t = (t - t.min()) / max(1.0, float(t.max() - t.min()))
    ramp = 1.0 - (1.0 - low) * t
    if a.ndim == 3:
        ramp = ramp[:, :, None]
    return Image.fromarray(np.clip(a * ramp, 0, 255).astype(np.uint8), img.mode), round(math.degrees(angle), 1)


def salt_pepper(img, fraction, rng):
    a = np.asarray(img).copy()
    n = int(a.shape[0] * a.shape[1] * fraction)
    ys = rng.integers(0, a.shape[0], n)
    xs = rng.integers(0, a.shape[1], n)
    vals = rng.integers(0, 2, n) * 255
    if a.ndim == 3:
        a[ys, xs, :] = vals[:, None]
    else:
        a[ys, xs] = vals
    return Image.fromarray(a, img.mode)


def thin_white_lines(img, rng, count):
    """Copier streaks: 1-px white lines across the page, mostly horizontal."""
    d = ImageDraw.Draw(img)
    white = 255 if img.mode == 'L' else (255, 255, 255)
    lines = []
    for _ in range(count):
        if rng.random() < 0.7:
            y = int(rng.integers(0, img.height))
            d.line([(0, y), (img.width, y)], fill=white, width=1)
            lines.append(['h', y])
        else:
            x = int(rng.integers(0, img.width))
            d.line([(x, 0), (x, img.height)], fill=white, width=1)
            lines.append(['v', x])
    return img, lines


def dark_border(img, rng):
    """A photocopy of a smaller sheet: a black band on one or two edges with
    a soft gray fall-off into the page."""
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    edges = ['left', 'right', 'top', 'bottom']
    chosen = list(rng.choice(edges, size=int(rng.integers(1, 3)), replace=False))
    widths = {}
    for e in chosen:
        band = int(rng.integers(8, 31))
        soft = band * 3
        widths[e] = band
        if e in ('left', 'right'):
            prof = np.ones(w, dtype=np.float32)
            idx = np.arange(w)
            dist = idx if e == 'left' else (w - 1 - idx)
            prof[dist < band] = 0.0
            fade = (dist >= band) & (dist < band + soft)
            prof[fade] = ((dist[fade] - band) / soft) ** 0.7
            prof = prof[None, :]
        else:
            prof = np.ones(h, dtype=np.float32)
            idx = np.arange(h)
            dist = idx if e == 'top' else (h - 1 - idx)
            prof[dist < band] = 0.0
            fade = (dist >= band) & (dist < band + soft)
            prof[fade] = ((dist[fade] - band) / soft) ** 0.7
            prof = prof[:, None]
        if a.ndim == 3:
            prof = prof[:, :, None]
        a = a * prof
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), img.mode), widths


def contrast_curve(img):
    """A copier's hard tone curve: mid-grays pushed to black or white."""
    a = np.asarray(img).astype(np.float32) / 255.0
    a = 1.0 / (1.0 + np.exp(-(a - 0.55) * 12.0))
    a = (a - a.min()) / max(1e-6, float(a.max() - a.min()))
    return Image.fromarray((a * 255).astype(np.uint8), img.mode)


def jpeg_bytes(img, quality):
    buf = io.BytesIO()
    (img if img.mode in ('L', 'RGB') else img.convert('RGB')).save(buf, 'JPEG', quality=quality)
    return buf.getvalue()


def draw_seal(img, rng, dpi):
    """A DRAWN red seal — two rings, a star, and text set on a circle — at
    alpha 0.5–0.7 over the middle of the page (where the course table is).
    Invented wording; never a real seal or logo."""
    rgb = img.convert('RGB')
    layer = Image.new('RGBA', rgb.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = int(0.9 * dpi)  # ~1.8 in across
    cx = int(rng.uniform(0.3, 0.7) * rgb.width)
    cy = int(rng.uniform(0.2, 0.5) * rgb.height)  # the course table sits in the upper half of most pages
    alpha = float(rng.uniform(0.5, 0.7))
    red = (185, 24, 36, int(alpha * 255))
    ring_w = max(2, int(dpi / 40))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=red, width=ring_w)
    r2 = int(r * 0.78)
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], outline=red, width=max(1, ring_w // 2))
    # Five-point star in the middle.
    pts = []
    for k in range(10):
        rad = r2 * (0.55 if k % 2 == 0 else 0.22)
        ang = -math.pi / 2 + k * math.pi / 5
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    d.polygon(pts, outline=red, fill=(185, 24, 36, int(alpha * 110)))
    # Text on a path: each glyph drawn upright on its own tile, rotated to the
    # tangent of the circle, pasted at its angle.
    text = 'SAMPLE SEAL • OFFICE OF RECORDS • NOT VALID • '
    size = max(10, int(dpi * 0.11))
    f = font(FONT_BOLD, size)
    radius = (r + r2) / 2
    step = 2 * math.pi / len(text)
    for i, ch in enumerate(text):
        ang = -math.pi / 2 + i * step
        tile = Image.new('RGBA', (size * 2, size * 2), (0, 0, 0, 0))
        td = ImageDraw.Draw(tile)
        td.text((size // 2, size // 4), ch, font=f, fill=red)
        tile = tile.rotate(-math.degrees(ang) - 90, resample=Image.BICUBIC, expand=False)
        px = int(cx + radius * math.cos(ang) - size)
        py = int(cy + radius * math.sin(ang) - size)
        layer.alpha_composite(tile, (px, py))
    out = Image.alpha_composite(rgb.convert('RGBA'), layer).convert('RGB')
    return out, {'cx': cx, 'cy': cy, 'radius': r, 'alpha': round(alpha, 2)}


def draw_watermark(img, text, rng, dpi):
    """A diagonal gray watermark at alpha 0.15 — UNOFFICIAL or the
    university's name, the way registrars print copies."""
    rgb = img.convert('RGB')
    layer = Image.new('RGBA', rgb.size, (0, 0, 0, 0))
    size = max(24, int(dpi * 0.6))
    f = font(FONT_BOLD, size)
    angle = float(rng.uniform(30, 45))
    tile = Image.new('RGBA', (int(f.getlength(text)) + size, size * 2), (0, 0, 0, 0))
    ImageDraw.Draw(tile).text((size // 2, size // 2), text, font=f, fill=(60, 60, 60, int(0.15 * 255)))
    tile = tile.rotate(angle, resample=Image.BICUBIC, expand=True)
    layer.alpha_composite(tile, ((rgb.width - tile.width) // 2, (rgb.height - tile.height) // 2))
    return Image.alpha_composite(rgb.convert('RGBA'), layer).convert('RGB'), {'text': text, 'angle': round(angle, 1)}


def perspective_coeffs(src, dst):
    """Pillow's PERSPECTIVE wants the 8 coefficients mapping OUTPUT points to
    INPUT points: solve the classic 8×8 system (numpy)."""
    matrix = []
    for (x, y), (u, v) in zip(dst, src):
        matrix.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        matrix.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    a = np.array(matrix, dtype=np.float64)
    b = np.array([c for pt in src for c in pt], dtype=np.float64)
    return tuple(np.linalg.solve(a, b))


def phone_photo(img, rng):
    """The page photographed on a desk: perspective, shadow, a little blur,
    a phone-sized downscale. Returns the RGB image before JPEG."""
    rgb = img.convert('RGB')
    w, h = rgb.size
    pct = lambda: float(rng.uniform(0.01, 0.03))  # noqa: E731
    sign = lambda: 1 if rng.random() < 0.5 else -1  # noqa: E731
    # Where the page's corners land in the photo (output), each pushed in or
    # out by 1–3 % of the page size.
    dst = [
        (0 + pct() * w * 1, 0 + pct() * h * 1),
        (w - pct() * w, 0 + pct() * h * (1 if sign() > 0 else 0.3)),
        (w - pct() * w * (1 if sign() > 0 else 0.5), h - pct() * h),
        (0 + pct() * w * 0.6, h - pct() * h * (1 if sign() > 0 else 0.4)),
    ]
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    coeffs = perspective_coeffs(src, dst)
    desk = (72, 66, 60)
    warped = rgb.transform((w, h), Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC, fillcolor=desk)
    # Shadow: a linear gradient 1.0 → 0.65 plus a mild vignette.
    a = np.asarray(warped).astype(np.float32)
    ys, xs = np.mgrid[0:h, 0:w]
    ang = float(rng.uniform(0, 2 * math.pi))
    t = xs * math.cos(ang) + ys * math.sin(ang)
    t = (t - t.min()) / max(1.0, float(t.max() - t.min()))
    ramp = 1.0 - 0.35 * t
    rad = np.sqrt(((xs - w / 2) / (w / 2)) ** 2 + ((ys - h / 2) / (h / 2)) ** 2)
    vignette = 1.0 - 0.12 * np.clip(rad - 0.6, 0, 1)
    a = a * (ramp * vignette)[:, :, None]
    shaded = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
    shaded = shaded.filter(ImageFilter.GaussianBlur(0.8))
    width = int(rng.integers(1200, 1601))
    out = shaded.resize((width, max(1, round(h * width / w))), Image.LANCZOS)
    return out, {'corners': [[round(x), round(y)] for x, y in dst], 'shadowAngle': round(math.degrees(ang), 1), 'width': width}


# OCR-style confusions for the poor text layer of L7 (seeded).
CONFUSIONS = {'0': 'O', 'O': '0', '1': 'l', 'l': '1', 'I': 'l', '5': 'S', 'S': '5', '8': 'B', 'B': '8', '2': 'Z', '.': ',', ',': '.', 'rn': 'm', 'm': 'rn', 'e': 'c', 'a': 'o', 'D': 'O', 'G': 'C'}


def corrupt_line(line, rng):
    out = []
    i = 0
    while i < len(line):
        two = line[i:i + 2]
        if two in CONFUSIONS and rng.random() < 0.08:
            out.append(CONFUSIONS[two])
            i += 2
            continue
        ch = line[i]
        r = rng.random()
        if ch in CONFUSIONS and r < 0.07:
            out.append(CONFUSIONS[ch])
        elif r < 0.09 and ch != ' ':
            pass  # dropped glyph
        else:
            out.append(ch)
        i += 1
    text = ''.join(out)
    # A scanner's layer often loses the column gaps: some 3+-space gaps become one space.
    text = re.sub(r' {3,}', lambda m: ' ' if rng.random() < 0.35 else m.group(0), text)
    return text


def pdf_escape(s):
    # WinAnsi-ish: keep ASCII, replace the rest; escape the PDF string delimiters.
    s = ''.join(ch if 32 <= ord(ch) < 127 else '?' for ch in s)
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def write_pdf(path, pages, dpi, text_pages=None):
    """An image-only PDF: one page per entry of `pages`, each ('png', PIL image)
    stored FlateDecode or ('jpeg', bytes, width, height, mode) stored
    DCTDecode as-is. `text_pages` (optional, per page) is a list of lines to
    embed invisibly (render mode 3) — L7's poor scanner text layer."""
    objects = []  # bodies, 1-based numbering = index + 1

    def add(body):
        objects.append(body)
        return len(objects)

    catalog = add(None)
    pages_obj = add(None)
    font_obj = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    kids = []
    for i, page in enumerate(pages):
        if page[0] == 'png':
            im = page[1]
            if im.mode not in ('L', 'RGB'):
                im = im.convert('RGB')
            w, h = im.size
            cs = b'/DeviceGray' if im.mode == 'L' else b'/DeviceRGB'
            data = zlib.compress(im.tobytes(), 6)
            img_obj = add(b'<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace %s /BitsPerComponent 8 /Filter /FlateDecode /Length %d >>\nstream\n' % (w, h, cs, len(data)) + data + b'\nendstream')
        else:
            _, data, w, h, mode = page
            cs = b'/DeviceGray' if mode == 'L' else b'/DeviceRGB'
            img_obj = add(b'<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace %s /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n' % (w, h, cs, len(data)) + data + b'\nendstream')
        pw = w * 72.0 / dpi
        ph = h * 72.0 / dpi
        content = 'q %.4f 0 0 %.4f 0 0 cm /Im0 Do Q\n' % (pw, ph)
        lines = (text_pages or [None] * len(pages))[i]
        if lines:
            # One invisible run per line, evenly spaced down the page (the
            # bench has no word geometry for a raster; the layout stage reads
            # runs top to bottom, so the order is what matters).
            n = len(lines)
            size = max(4.0, min(9.0, (ph * 0.9) / max(1, n) / 1.3))
            margin_x = pw * 0.08
            top = ph * 0.95
            step = (ph * 0.9) / max(1, n)
            content += 'BT 3 Tr /F1 %.2f Tf\n' % size
            for k, line in enumerate(lines):
                if line == '':
                    continue
                content += '1 0 0 1 %.2f %.2f Tm (%s) Tj\n' % (margin_x, top - k * step, pdf_escape(line))
            content += 'ET\n'
        content_bytes = content.encode('latin-1')
        content_obj = add(b'<< /Length %d >>\nstream\n' % len(content_bytes) + content_bytes + b'\nendstream')
        page_obj = add(b'<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.4f %.4f] /Resources << /XObject << /Im0 %d 0 R >> /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>' % (pages_obj, pw, ph, img_obj, font_obj, content_obj))
        kids.append(page_obj)
    objects[catalog - 1] = b'<< /Type /Catalog /Pages %d 0 R >>' % pages_obj
    objects[pages_obj - 1] = b'<< /Type /Pages /Kids [%s] /Count %d >>' % (b' '.join(b'%d 0 R' % k for k in kids), len(kids))
    out = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for n, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b'%d 0 obj\n' % n + body + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1)
    for off in offsets:
        out += b'%010d 00000 n \n' % off
    out += b'trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objects) + 1, catalog, xref)
    with open(path, 'wb') as fh:
        fh.write(out)


def split_pages(lines):
    pages, cur = [], []
    for l in lines:
        if l == '':
            pages.append(cur)
            cur = []
        else:
            cur.append(l)
    if cur:
        pages.append(cur)
    return pages


def main():
    ap = argparse.ArgumentParser(description='OCR benchmark degradation ladder (Pillow + numpy)')
    ap.add_argument('pages', nargs='+', help='clean page rasters at --source-dpi, in page order')
    ap.add_argument('--name', required=True, help='seed id; output files are <name>-p<N>.<ext> and <name>.pdf per level')
    ap.add_argument('--out', required=True, help='output folder (one subfolder per level + manifest.json)')
    ap.add_argument('--levels', default=','.join(LEVELS), help='comma list; L6 expands to L6-90,L6-180')
    ap.add_argument('--dpi', type=int, default=200, help='L0 raster dpi (the other levels fix their own)')
    ap.add_argument('--source-dpi', type=int, default=300)
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--text-lines', help='JSON line list (\'\' between pages) for L7\'s poor text layer')
    ap.add_argument('--watermark', default='UNOFFICIAL', help='L4 watermark text (UNOFFICIAL or the university name)')
    args = ap.parse_args()

    levels = []
    for l in args.levels.split(','):
        l = l.strip()
        if l == 'L6':
            levels += ['L6-90', 'L6-180']
        elif l:
            levels.append(l)
    for l in levels:
        if l not in LEVELS:
            raise SystemExit('degrade.py: unknown level %s (known: %s)' % (l, ', '.join(LEVELS)))

    text_pages = None
    if args.text_lines:
        with open(args.text_lines, encoding='utf-8') as fh:
            text_pages = split_pages(json.load(fh))

    masters = [Image.open(p).convert('L') for p in args.pages]
    src = args.source_dpi
    manifest = {'name': args.name, 'sourceDpi': src, 'seed': args.seed, 'pages': len(masters), 'levels': {}}
    os.makedirs(args.out, exist_ok=True)

    def rng_for(level, page_index):
        return np.random.default_rng([args.seed, page_index, LEVELS.index(level)])

    # Shared intermediates, computed once per page and reused by the levels built on them.
    cache = {}

    def level1(pi):
        if ('L1', pi) not in cache:
            im = resample(masters[pi], src, 200).filter(ImageFilter.GaussianBlur(0.6))
            cache[('L1', pi)] = (im, jpeg_bytes(im, 75))
        return cache[('L1', pi)]

    def level2(pi):
        if ('L2', pi) not in cache:
            rng = rng_for('L2', pi)
            angle = float(rng.uniform(0.5, 1.5)) * (1 if rng.random() < 0.5 else -1)
            im = skew(resample(masters[pi], src, 150), angle)
            im = gaussian_noise(im, 6.0, rng)
            im, light_angle = lighting_gradient(im, rng, 0.82)
            cache[('L2', pi)] = (im, jpeg_bytes(im, 60), {'skewDeg': round(angle, 2), 'noiseSigma': 6, 'lightAngleDeg': light_angle})
        return cache[('L2', pi)]

    for level in levels:
        ldir = os.path.join(args.out, level)
        os.makedirs(ldir, exist_ok=True)
        entry = {'dpi': None, 'pages': [], 'pdf': os.path.join(ldir, args.name + '.pdf'), 'params': []}
        pdf_pages = []
        pdf_text = None
        if level == 'L7' and text_pages is None:
            entry['skipped'] = 'L7 needs --text-lines (the truth line list) for its poor text layer'
            manifest['levels'][level] = entry
            print('  %s: skipped — needs --text-lines' % level, file=sys.stderr)
            continue
        for pi in range(len(masters)):
            stem = '%s-p%d' % (args.name, pi + 1)
            params = {}
            if level == 'L0':
                im = resample(masters[pi], src, args.dpi)
                dpi = args.dpi
                path = os.path.join(ldir, stem + '.png')
                im.save(path, 'PNG')
                pdf_pages.append(('png', im))
            elif level == 'L1':
                im, data = level1(pi)
                dpi = 200
                path = os.path.join(ldir, stem + '.jpg')
                open(path, 'wb').write(data)
                pdf_pages.append(('jpeg', data, im.width, im.height, im.mode))
                params = {'blurSigma': 0.6, 'jpegQ': 75}
            elif level == 'L2' or level == 'L7':
                im, data, p = level2(pi)
                dpi = 150
                path = os.path.join(ldir, stem + '.jpg')
                open(path, 'wb').write(data)
                pdf_pages.append(('jpeg', data, im.width, im.height, im.mode))
                params = dict(p, jpegQ=60)
                if level == 'L7':
                    rng = rng_for('L7', pi)
                    truth = text_pages[pi] if pi < len(text_pages) else []
                    pdf_text = pdf_text or []
                    pdf_text.append([corrupt_line(l, rng) for l in truth])
                    params['textLayerLines'] = len(truth)
            elif level == 'L3':
                rng = rng_for('L3', pi)
                angle = float(rng.uniform(2.0, 3.0)) * (1 if rng.random() < 0.5 else -1)
                im = skew(resample(masters[pi], src, 200), angle)
                im = contrast_curve(im)
                im = salt_pepper(im, 0.002, rng)
                im, streaks = thin_white_lines(im, rng, int(rng.integers(3, 7)))
                im, bands = dark_border(im, rng)
                dpi = 200
                path = os.path.join(ldir, stem + '.png')
                im.save(path, 'PNG')
                pdf_pages.append(('png', im))
                params = {'skewDeg': round(angle, 2), 'saltPepper': 0.002, 'streaks': streaks, 'borderBands': bands}
            elif level == 'L4':
                base, _ = level1(pi)
                rng = rng_for('L4', pi)
                im, seal = draw_seal(base, rng, 200)
                im, wm = draw_watermark(im, args.watermark, rng, 200)
                data = jpeg_bytes(im, 75)
                dpi = 200
                path = os.path.join(ldir, stem + '.jpg')
                open(path, 'wb').write(data)
                pdf_pages.append(('jpeg', data, im.width, im.height, 'RGB'))
                params = {'seal': seal, 'watermark': wm, 'jpegQ': 75}
            elif level == 'L5':
                rng = rng_for('L5', pi)
                im, p = phone_photo(masters[pi], rng)
                data = jpeg_bytes(im, 50)
                # A photo has no dpi; the PDF page is sized as if the photo were
                # a letter page, so pdfjs renders it the way the app would.
                dpi = round(im.width / 8.5)
                path = os.path.join(ldir, stem + '.jpg')
                open(path, 'wb').write(data)
                pdf_pages.append(('jpeg', data, im.width, im.height, 'RGB'))
                params = dict(p, jpegQ=50)
            elif level in ('L6-90', 'L6-180'):
                base, _ = level1(pi)
                turn = 90 if level == 'L6-90' else 180
                im = base.rotate(-turn, expand=True)
                data = jpeg_bytes(im, 75)
                dpi = 200
                path = os.path.join(ldir, stem + '.jpg')
                open(path, 'wb').write(data)
                pdf_pages.append(('jpeg', data, im.width, im.height, im.mode))
                params = {'rotation': turn, 'jpegQ': 75}
            entry['dpi'] = dpi
            entry['pages'].append({'file': path, 'width': im.width, 'height': im.height, 'bytes': os.path.getsize(path)})
            entry['params'].append(params)
        write_pdf(entry['pdf'], pdf_pages, entry['dpi'], pdf_text)
        entry['pdfBytes'] = os.path.getsize(entry['pdf'])
        manifest['levels'][level] = entry
    with open(os.path.join(args.out, 'manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, indent=1)
    print('%s: %d page(s) × %s → %s' % (args.name, len(masters), ','.join(levels), args.out), file=sys.stderr)


if __name__ == '__main__':
    main()
