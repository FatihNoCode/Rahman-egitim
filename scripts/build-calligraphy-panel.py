"""Turns the 5 MB auto-trace into a background-weight SVG.

The trace is faithful to the pixel, which is the wrong trade for a watermark
sitting at 8% opacity behind text: it spends five megabytes on detail nobody
can see. This rebuilds each contour from its curve endpoints alone, simplifies
that outline (Ramer-Douglas-Peucker), and re-fits smooth cubics through what
survives, at a canvas scaled down so the coordinates are short integers and
written as relative deltas.
"""
import re, sys

SRC = '/Users/fatihaltuner/Downloads/Screenshot 2026-08-21 at 21.12.41.svg'
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 0.35
TOL = float(sys.argv[2]) if len(sys.argv) > 2 else 2.2
MIN_EXTENT = float(sys.argv[3]) if len(sys.argv) > 3 else 12.0

path_re = re.compile(r'<path d="([^"]+)" fill="#([0-9a-fA-F]{6})"(?: transform="translate\(([-\d.]+),([-\d.]+)\)")?/>')
num_re = re.compile(r'-?\d+\.?\d*')

def endpoints(d):
    """The polygon of a traced contour: its start point plus the endpoint of
    every cubic. The control points are dropped — they are re-derived below."""
    nums = [float(n) for n in num_re.findall(d)]
    if len(nums) < 8:
        return []
    pts = [(nums[0], nums[1])]
    rest = nums[2:]
    for i in range(0, len(rest) - 5, 6):
        pts.append((rest[i + 4], rest[i + 5]))
    return pts

def rdp(pts, tol):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    n2 = dx * dx + dy * dy
    worst, idx = -1.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        if n2 == 0:
            dist = (px - x1) ** 2 + (py - y1) ** 2
        else:
            t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / n2))
            qx, qy = x1 + t * dx, y1 + t * dy
            dist = (px - qx) ** 2 + (py - qy) ** 2
        if dist > worst:
            worst, idx = dist, i
    if worst > tol * tol:
        return rdp(pts[:idx + 1], tol)[:-1] + rdp(pts[idx:], tol)
    return [pts[0], pts[-1]]

def smooth(pts):
    """Catmull-Rom through the surviving points, converted to cubics, so a
    simplified outline still reads as a drawn curve and not a polygon."""
    n = len(pts)
    segs = []
    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        segs.append((c1, c2, p2))
    return segs

def emit(pts):
    """Relative integer deltas: the numbers stay one or two digits, which is
    most of why the file comes out small."""
    segs = smooth(pts)
    cx, cy = round(pts[0][0]), round(pts[0][1])
    out = ['M%d %d' % (cx, cy)]
    for (c1, c2, p) in segs:
        a = (round(c1[0] - cx), round(c1[1] - cy))
        b = (round(c2[0] - cx), round(c2[1] - cy))
        e = (round(p[0]) - cx, round(p[1]) - cy)
        out.append('c%d %d %d %d %d %d' % (a[0], a[1], b[0], b[1], e[0], e[1]))
        cx, cy = cx + e[0], cy + e[1]
    out.append('z')
    return ''.join(out)

def lum(h):
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b, r, g, b

shapes = []  # kept in document order: an auto-trace is a painter's stack
curves = 0
for d, fill, tx, ty in path_re.findall(open(SRC).read()):
    L, r, g, b = lum(fill)
    if L > 150:
        kind = 'paper'
    elif r > g + 25 and r > b + 25:
        kind = 'accent'
    elif L < 110:
        kind = 'ink'
    else:
        continue
    dx, dy = (float(tx) if tx else 0.0), (float(ty) if ty else 0.0)
    pts = [((x + dx) * SCALE, (y + dy) * SCALE) for x, y in endpoints(d)]
    if len(pts) < 4:
        continue
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    ew, eh = max(xs) - min(xs), max(ys) - min(ys)
    if max(ew, eh) < MIN_EXTENT:
        continue
    # The trace lays the paper and the panel border down as full-canvas
    # shapes before it draws anything. They are the only contours that span
    # the whole sheet, and they would come out as one solid block of colour.
    if ew > 0.92 * 1596 * SCALE and eh > 0.92 * 1434 * SCALE:
        continue
    pts = rdp(pts, TOL)
    if len(pts) < 4:
        continue
    curves += len(pts)
    shapes.append((kind, emit(pts)))

W, H = round(1596 * SCALE), round(1434 * SCALE)
# Document order is preserved because an auto-trace is a painter's stack: it
# lays a ground down and covers most of it back up. Re-ordering the shapes by
# colour (all the ink, then all the red) turns the picture inside out, which
# is exactly what happens if you try to strip the paper out to get a
# transparent ground. So the paper is kept and painted white, and the panel
# is used at low opacity over white — where white on white is invisible and
# only the two hands show through.
CLASS = {'paper': 'a', 'ink': 'b', 'accent': 'c'}
# The original sheet is photographed with a dark surround outside the paper.
# Cropping the viewBox to the paper itself is what removes that frame; there
# is no shape to delete, it is the trace's ground showing past the edge.
INSET = 0.055
vx, vy = round(W * INSET), round(H * INSET)
parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="%d %d %d %d">'
         % (vx, vy, W - 2 * vx, H - 2 * vy)]
parts.append('<style>.a{fill:#fff}.b{fill:#059669}.c{fill:#14b8a6}</style>')
parts.append(''.join('<path class="%s" d="%s"/>' % (CLASS[k], d) for k, d in shapes))
parts.append('</svg>')
svg = ''.join(parts)
open('src/imports/calligraphy-panel.svg', 'w').write(svg)
print('shapes', len(shapes), 'curves', curves, 'bytes', len(svg))
