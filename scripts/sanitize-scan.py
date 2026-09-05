#!/usr/bin/env python3
"""De-identify a SCANNED (image) transcript while keeping it a scan.

    python3 ~/degree-audit-app/scripts/sanitize-scan.py "scan.pdf"|page.png|page.jpg
                     [--out out.pdf] [--dpi 200] [--seed N] [--keep-titles]

Run it from the folder that holds the scans; it finds the repo (and its
node_modules) from its own location. Quote names with spaces.

How it works (all on this computer; nothing is uploaded):
  1. Pages are loaded as images (a PDF is rasterized with PyMuPDF at --dpi).
  2. Each page is OCR'd for words WITH boxes by the app's own bundled engine
     (node scripts/sanitize/ocr-words.mjs — tesseract.js + public/ocr), so no
     tesseract install is needed.
  3. The words go through the SAME de-identification rules as the text-PDF
     sanitizer (node scripts/sanitize-transcript.mjs --words): names, ids,
     dates, grades, GPA, course numbers, titles change; structural words,
     subject codes, credit values and institution names stay.
  4. Every changed word is painted over with the surrounding background and
     redrawn at the same place and size; everything else — including scan
     noise, rules, stamps — stays as the original pixels, so the app's OCR
     path sees a realistic scan.
  5. Output: one PNG per page plus a single image-only PDF, named
     sanitized-scan-<tag>-p<n>.png / sanitized-scan-<tag>.pdf next to the input
     — never under the input's name, which is usually the student's.

REVIEW BEFORE SHARING. OCR misses text it cannot read (handwriting, stamps,
tiny or skewed print) and such text is left UNTOUCHED. Open every output page
and look for anything personal that survived; the tool also prints the words
it kept verbatim. If in doubt, do not share.

Needs: Python 3 with Pillow (pip install pillow); PyMuPDF only for PDF input
(pip install pymupdf); Node + the repo's node_modules (npm install).
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_CANDIDATES = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/Library/Fonts/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    'C:/Windows/Fonts/arial.ttf',
]


def load_pages(path, dpi):
    if path.lower().endswith('.pdf'):
        try:
            import pymupdf  # PyMuPDF
        except ImportError:
            sys.exit('PDF input needs PyMuPDF: pip install pymupdf  (or give the tool PNG/JPG pages)')
        doc = pymupdf.open(path)
        pages = []
        for page in doc:
            pix = page.get_pixmap(dpi=dpi)
            img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            pages.append(img)
        return pages
    return [Image.open(path).convert('RGB')]


def ocr_words(png_path):
    out = subprocess.run(['node', os.path.join(ROOT, 'scripts', 'sanitize', 'ocr-words.mjs'), png_path], capture_output=True, text=True, cwd=ROOT)
    if out.returncode != 0:
        sys.exit('OCR failed:\n' + out.stderr)
    return json.loads(out.stdout)['words']


def sanitize_words(pages_words, page_sizes, seed, keep_titles):
    with tempfile.TemporaryDirectory() as tmp:
        inp = os.path.join(tmp, 'words.json')
        outp = os.path.join(tmp, 'sanitized.json')
        payload = {
            'pages': [
                {'width': size[0], 'words': [{'text': w['text'], 'x': w['x'], 'width': w['width'], 'line': w['line']} for w in words]}
                for words, size in zip(pages_words, page_sizes)
            ]
        }
        with open(inp, 'w') as f:
            json.dump(payload, f)
        cmd = ['node', os.path.join(ROOT, 'scripts', 'sanitize-transcript.mjs'), '--words', inp, outp]
        if seed is not None:
            cmd += ['--seed', str(seed)]
        if keep_titles:
            cmd.append('--keep-titles')
        run = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
        if run.returncode != 0:
            sys.exit('sanitizer failed:\n' + run.stderr)
        with open(outp) as f:
            result = json.load(f)
    return result, run.stdout


def pick_font(size):
    for candidate in FONT_CANDIDATES:
        if os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, max(8, int(size)))
            except OSError:
                continue
    return ImageFont.load_default()


def background_color(img, box):
    """Median color of a 3-px ring around the box — the paper around the word."""
    x0, y0, x1, y1 = box
    ring = []
    for dx in range(-3, 0):
        for y in range(max(0, y0), min(img.height, y1)):
            for x in (x0 + dx, x1 - dx - 1):
                if 0 <= x < img.width:
                    ring.append(img.getpixel((x, y)))
    for dy in range(-3, 0):
        for x in range(max(0, x0), min(img.width, x1)):
            for y in (y0 + dy, y1 - dy - 1):
                if 0 <= y < img.height:
                    ring.append(img.getpixel((x, y)))
    if not ring:
        return (255, 255, 255)
    channels = list(zip(*ring))
    return tuple(sorted(c)[len(c) // 2] for c in channels)


def ink_color(img, box):
    """The darkest pixel in the box — the scan's ink."""
    x0, y0, x1, y1 = box
    darkest = (255, 255, 255)
    for y in range(max(0, y0), min(img.height, y1)):
        for x in range(max(0, x0), min(img.width, x1)):
            px = img.getpixel((x, y))
            if sum(px) < sum(darkest):
                darkest = px
    return darkest


def repaint(img, words, sanitized):
    draw = ImageDraw.Draw(img)
    changed = 0
    for w, s in zip(words, sanitized):
        if not s['changed']:
            continue
        changed += 1
        x0, y0 = w['x'], w['y']
        x1, y1 = x0 + w['width'], y0 + w['height']
        box = (x0, y0, x1, y1)
        ink = ink_color(img, box)
        draw.rectangle((x0 - 1, y0 - 1, x1 + 1, y1 + 1), fill=background_color(img, box))
        # Fit the replacement into the original box: same height, then shrink
        # until it is no wider than the original word.
        size = w['height'] * 0.95
        font = pick_font(size)
        text = s['text']
        while size > 6:
            font = pick_font(size)
            if draw.textlength(text, font=font) <= w['width'] + 2:
                break
            size -= 1
        draw.text((x0, y0), text, font=font, fill=ink)
    return changed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('input')
    ap.add_argument('--out', help='output PDF (default: <input>.sanitized.pdf)')
    ap.add_argument('--dpi', type=int, default=200, help='rasterization dpi for PDF input (default 200)')
    ap.add_argument('--seed', type=int)
    ap.add_argument('--keep-titles', action='store_true', help='leave course titles readable (only if you judge it safe)')
    args = ap.parse_args()

    # Output names never repeat the input name (2026-09-05): scan files are
    # usually named after the student. A short tag from the input's bytes keeps
    # runs apart without saying whose scan it was.
    import hashlib
    with open(args.input, 'rb') as f:
        tag = hashlib.sha256(f.read()).hexdigest()[:8]
    base = os.path.join(os.path.dirname(os.path.abspath(args.input)), f'sanitized-scan-{tag}')
    out_pdf = args.out or base + '.pdf'
    pages = load_pages(args.input, args.dpi)
    print(f'{len(pages)} page(s) loaded')

    pages_words = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, img in enumerate(pages, 1):
            png = os.path.join(tmp, f'page-{i}.png')
            img.save(png)
            words = ocr_words(png)
            pages_words.append(words)
            print(f'page {i}: {len(words)} words read by OCR')

    result, report = sanitize_words(pages_words, [img.size for img in pages], args.seed, args.keep_titles)

    outputs = []
    for i, (img, words, page) in enumerate(zip(pages, pages_words, result['pages']), 1):
        changed = repaint(img, words, page['words'])
        png_out = f'{base}-p{i}.png'
        img.save(png_out)
        outputs.append(png_out)
        print(f'page {i}: {changed} of {len(words)} words repainted → {png_out}')
    if pages:
        pages[0].save(out_pdf, 'PDF', resolution=float(args.dpi), save_all=True, append_images=pages[1:])
        print(f'wrote {out_pdf}')

    print('\n' + report.strip())
    print('\nOCR leaves what it cannot read UNTOUCHED (handwriting, stamps, tiny or skewed print).')
    print('Open every output page and check for anything personal before sharing.')


if __name__ == '__main__':
    main()
