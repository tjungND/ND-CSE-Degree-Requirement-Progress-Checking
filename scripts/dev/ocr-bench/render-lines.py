#!/usr/bin/env python3
# Render a transcript LINE-LIST fixture (tests/fixtures/public-transcripts/
# <name>.json, tests/fixtures/ms-transcripts/<name>.json: one string per line,
# '' between pages, three or more spaces = a column gap) to clean page images,
# so the OCR benchmark can degrade and read a layout that exists only as text
# (2026-10-09, transcript accuracy program, OCR step 9). Grown out of
# tests/fixtures/make-scan-fixture.py; Pillow only.
#
#   python3 scripts/dev/ocr-bench/render-lines.py --lines fixture.json --out DIR \
#       --name NAME --skin mono|ruled|banner [--dpi 300] [--seed 7]
#
# Three skins, because a scan's difficulty is its typography as much as its
# noise:
#   mono    a monospaced table (Courier New / DejaVu Sans Mono), 9 pt
#   ruled   proportional type (Arial / DejaVu Sans), 9 pt, light vertical
#           rules between the columns of every table block and a rule under
#           its header line
#   banner  two-column halves, 7.5 pt — the Banner official-transcript shape:
#           lines fill the left half top to bottom, then the right half
# Every three-space gap is a TAB STOP: per page (per half, in banner) the
# stop of column i is the widest cell i of the page's table lines (three or
# more cells) plus a gap, so the columns line up the way a registrar's table
# does; a two-cell "Label:   value" line puts its value at the first stop or
# right after its label, whichever is further. A page whose table is wider
# than the paper shrinks its type (down to 6 pt) until it fits — nothing is
# ever cut. A fixture longer than its pages flows onto extra pages, and the
# truth stream written beside the images carries the '' page breaks AS
# RENDERED, which is what the OCR output is scored against.
#
# A caveat the plan states: this measures OCR on a layout no registrar
# printed — twice removed from a real scan — so these seeds are
# 'synthetic-render' and reported separately, for regressions only.
#
# Seeded: the --seed drives the 0–1 px per-line jitter and the rule gray, so
# a render is reproducible. FERPA: fixtures carry placeholder identities
# ('Sample Two Student', 000000000); this script adds no name of its own.
import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONTS = {
    'sans': ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'],
    'mono': ['/System/Library/Fonts/Supplemental/Courier New.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'],
    # Non-Latin fixtures (CJK, Arabic, Thai …): a font that has the glyphs.
    'unicode': ['/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'],
}
SKINS = ('mono', 'ruled', 'banner')
CELL_SPLIT = re.compile(r' {3,}')


def load_font(kind, size_px):
    for path in FONTS[kind]:
        if os.path.exists(path):
            return ImageFont.truetype(path, max(1, int(round(size_px))))
    raise SystemExit('render-lines.py: no usable font for %s: %s' % (kind, ', '.join(FONTS[kind])))


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


def cells_of(line):
    """A line's cells and its indent (leading spaces)."""
    stripped = line.rstrip()
    indent = len(stripped) - len(stripped.lstrip(' '))
    return CELL_SPLIT.split(stripped.strip()), indent


def layout_block(lines, font, usable, gap):
    """Tab stops (x offsets from the block's left edge) for a page's lines:
    column i's stop = widest cell i over the TABLE lines (3+ cells) + gap.
    Returns (stops, overflow) where overflow > 0 means the widest row does
    not fit in `usable` pixels."""
    widths = []
    for line in lines:
        cells, _ = cells_of(line)
        if len(cells) < 3:
            continue
        for i, c in enumerate(cells):
            w = font.getlength(c)
            if i >= len(widths):
                widths.append(w)
            else:
                widths[i] = max(widths[i], w)
    stops = [0.0]
    for w in widths[:-1] if widths else []:
        stops.append(stops[-1] + w + gap)
    total = (stops[-1] + widths[-1]) if widths else 0.0
    # Two-cell lines (Label:   value) and prose lines must fit as well.
    for line in lines:
        cells, _ = cells_of(line)
        if len(cells) == 2:
            total = max(total, font.getlength(cells[0]) + gap + font.getlength(cells[1]))
        elif len(cells) == 1:
            total = max(total, font.getlength(cells[0]))
    return stops, max(0.0, total - usable)


def main():
    ap = argparse.ArgumentParser(description='render a transcript line-list fixture to page images')
    ap.add_argument('--lines', required=True, help='the fixture JSON (a list of strings)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--skin', choices=SKINS, default='ruled')
    ap.add_argument('--dpi', type=int, default=300)
    ap.add_argument('--seed', type=int, default=7)
    args = ap.parse_args()

    with open(args.lines, encoding='utf-8') as fh:
        lines = json.load(fh)
    if not isinstance(lines, list) or not all(isinstance(l, str) for l in lines):
        raise SystemExit('render-lines.py: %s is not a JSON list of strings' % args.lines)
    rng = np.random.default_rng([args.seed, len(lines)])
    dpi = args.dpi
    W, H = int(8.5 * dpi), int(11 * dpi)
    margin = int(0.7 * dpi)
    needs_unicode = any(ord(ch) > 0x24F for l in lines for ch in l)
    font_kind = 'unicode' if needs_unicode else ('mono' if args.skin == 'mono' else 'sans')
    base_pt = 7.5 if args.skin == 'banner' else 9.0
    gutter = int(0.3 * dpi)
    columns = 2 if args.skin == 'banner' else 1
    col_w = (W - 2 * margin - gutter * (columns - 1)) // columns
    rule_gray = int(rng.integers(140, 171))
    paper = int(rng.integers(250, 256))

    os.makedirs(args.out, exist_ok=True)
    src_pages = split_pages(lines)
    out_pages = []   # file paths
    truth = []       # the line stream as rendered ('' between rendered pages)
    page_index = 0

    def new_page():
        img = Image.new('L', (W, H), paper)
        return img, ImageDraw.Draw(img)

    for src in src_pages:
        if not src:
            continue
        # Shrink-to-fit per source page: the type size is chosen once for the
        # page so columns keep one set of stops across all its lines.
        pt = base_pt
        while True:
            font = load_font(font_kind, pt * dpi / 72)
            gap = int(font.getlength('   '))
            stops, overflow = layout_block(src, font, col_w, gap)
            if overflow <= 0 or pt <= 6.0:
                break
            pt = round(pt - 0.5, 1)
        line_h = int(font.size * 1.4)
        img, d = new_page()
        col = 0
        y = margin
        page_lines = []
        block = []  # [start_y, end_y, ncells] of the current table block (ruled skin)
        blocks = []

        def close_block():
            if block:
                blocks.append(tuple(block))
                block.clear()

        def flush_rules(img_, d_, col_x, blocks_):
            if args.skin != 'ruled':
                return
            for (y0, y1, n, header) in blocks_:
                d_.line([(col_x, y0 - 2), (col_x + col_w, y0 - 2)], fill=rule_gray, width=1)
                d_.line([(col_x, y1 + 2), (col_x + col_w, y1 + 2)], fill=rule_gray, width=1)
                if header:
                    d_.line([(col_x, y0 + line_h - 2), (col_x + col_w, y0 + line_h - 2)], fill=rule_gray, width=1)
                for s in stops[1:n]:
                    x = col_x + int(s) - gap // 2
                    d_.line([(x, y0 - 2), (x, y1 + 2)], fill=rule_gray, width=1)

        def finish_page():
            nonlocal img, d, page_index, y, col, page_lines, blocks
            close_block()
            flush_rules(img, d, margin + col * (col_w + gutter), blocks)
            if args.skin == 'banner':
                gx = margin + col_w + gutter // 2
                d.line([(gx, margin), (gx, H - margin)], fill=rule_gray, width=1)
            page_index += 1
            path = os.path.join(args.out, '%s-%s-p%d.png' % (args.name, args.skin, page_index))
            img.save(path, 'PNG')
            out_pages.append(path)
            truth.extend(page_lines)
            truth.append('')
            page_lines = []
            blocks = []
            img, d = new_page()
            y = margin
            col = 0

        for line in src:
            if y + line_h > H - margin:
                if columns == 2 and col == 0:
                    close_block()
                    flush_rules(img, d, margin, blocks)
                    blocks = []
                    col = 1
                    y = margin
                else:
                    finish_page()
            cells, indent = cells_of(line)
            col_x = margin + col * (col_w + gutter)
            jitter = int(rng.integers(0, 2))
            x0 = col_x + jitter + int(indent * font.getlength(' '))
            if len(cells) >= 3:
                if not block:
                    block.extend([y, y, len(cells), not any(ch.isdigit() for ch in line)])
                block[1] = y + line_h
                block[2] = max(block[2], len(cells))
                for i, c in enumerate(cells):
                    sx = x0 + int(stops[i]) if i < len(stops) else x0 + int(stops[-1]) + gap
                    d.text((sx, y), c, font=font, fill=15)
            else:
                close_block()
                if len(cells) == 2:
                    second = max(int(stops[1]) if len(stops) > 1 else 0, int(font.getlength(cells[0])) + gap)
                    d.text((x0, y), cells[0], font=font, fill=15)
                    d.text((x0 + second, y), cells[1], font=font, fill=15)
                else:
                    d.text((x0, y), cells[0], font=font, fill=15)
            page_lines.append(line)
            y += line_h
        finish_page()

    meta = {'name': args.name, 'skin': args.skin, 'dpi': dpi, 'seed': args.seed, 'sourceLines': len(lines), 'pages': out_pages, 'truthLines': truth}
    with open(os.path.join(args.out, '%s-%s.json' % (args.name, args.skin)), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
    print('%s (%s): %d page(s) → %s' % (args.name, args.skin, len(out_pages), args.out), file=sys.stderr)


if __name__ == '__main__':
    main()
