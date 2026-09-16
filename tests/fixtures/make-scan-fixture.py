#!/usr/bin/env python3
# Regenerates tests/fixtures/external-transcript-scan.pdf: an IMAGE-ONLY PDF
# (no text layer) that stands in for a scanned external transcript in the e2e
# OCR leg. Pillow only:  python3 tests/fixtures/make-scan-fixture.py
from PIL import Image, ImageDraw, ImageFont

W, H = 1700, 2200
img = Image.new('L', (W, H), 246)
d = ImageDraw.Draw(img)
# The DejaVu fonts of the Linux VM this was written on, or the Mac's own
# (the script was first run on a Mac on 2026-09-15).
import os
def font(candidates, size):
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    raise SystemExit('no usable font found: ' + ', '.join(candidates))
f_big = font(['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'], 44)
f = font(['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'], 34)
f_mono = font(['/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', '/System/Library/Fonts/Supplemental/Courier New.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'], 34)
y = 120
def line(text, font, dy):
    global y
    d.text((130, y), text, font=font, fill=20)
    y += dy
line('Purdue University', f_big, 70)
line('Office of the Registrar', f, 55)
line('Official Transcript', f, 55)
line('Student: John Q. Boilermaker', f, 55)
line('Program: Master of Science, Computer Science', f, 90)
line('Fall 2023', f_big, 70)
line('CS 50300    Operating Systems              3.0    A', f_mono, 55)
line('CS 59000    Special Topics in Systems      3.0    A-', f_mono, 95)
line('Spring 2024', f_big, 70)
line('CS 58000    Algorithm Design               3.0    B+', f_mono, 115)
line('Cumulative GPA: 3.83', f, 55)
img.convert('RGB').save('tests/fixtures/external-transcript-scan.pdf', 'PDF', resolution=150.0)
print('wrote tests/fixtures/external-transcript-scan.pdf')
