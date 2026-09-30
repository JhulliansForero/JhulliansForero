#!/usr/bin/env python3
"""Genera el banner animado del perfil (tema oscuro y claro).

Uso, desde la raíz del repositorio:
    pip install -r scripts/banner/requirements.txt
    python scripts/banner/generate.py

Necesita una foto en assets/source/portrait.png (o .jpg).
Los logos que se animan son los .svg de scripts/banner/logos, en el orden de LOGO_ORDER.
"""

from __future__ import annotations

import html
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import PathPatch
from matplotlib.transforms import Affine2D
from PIL import Image, ImageFilter, ImageOps
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import cdist
from svgpath2mpl import parse_path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
LOGOS = Path(__file__).resolve().parent / "logos"

# --------------------------------------------------------------------------- #
# Personaliza aquí
# --------------------------------------------------------------------------- #

USERNAME = "JhulliansForero"
LOGO_ORDER = ("java", "spring", "javascript", "react", "python")

# Encuadre: ancho del recorte relativo a la silueta (1.0 = justo) y desplazamiento
# vertical relativo a su altura (negativo = deja aire sobre la cabeza).
CROP_WIDTH = 1.0
CROP_TOP = -0.03

YAML_ROWS = [
    (0, "profile", ""),
    (1, "subject", "Jhullians Forero"),
    (1, "role", "Estudiante de Software"),
    (1, "focus", "Backend Java · Desarrollo Web"),
    (1, "status", "Aprendiendo · Construyendo · Mejorando"),
    (1, "building", "Sistema de inventario y ventas"),
    (0, "stack", ""),
    (1, "backend", "Java 17 · Spring Boot · JPA"),
    (1, "frontend", "JavaScript · React · HTML/CSS"),
    (1, "databases", "PostgreSQL · H2 · MySQL"),
    (1, "tooling", "Maven · Git · GitHub"),
    (1, "scripting", "Python · Bash"),
    (0, "learning", ""),
    (1, "next", "Spring Security · Docker · Testing"),
    (0, "contact", ""),
    (1, "github", USERNAME),
    (1, "motto", "commit early, commit often"),
]

THEMES = {
    "dark": {
        "bg": "#050A07",
        "panel": "#08110C",
        "panel2": "#0B1811",
        "line": "#1B3526",
        "muted": "#5F8A6E",
        "text": "#D6F5DF",
        "portrait": "#39FF8A",   # verde fósforo
        "chrome": "#5EEAD4",     # verde agua
        "shadow": "#000000",
    },
    "light": {
        "bg": "#EEF8F1",
        "panel": "#FFFFFF",
        "panel2": "#E6F4EA",
        "line": "#B5DCC1",
        "muted": "#5A7B64",
        "text": "#0E2417",
        "portrait": "#0E8A45",
        "chrome": "#0F766E",
        "shadow": "#9CC9AA",
    },
}

# --------------------------------------------------------------------------- #

W, H = 1180, 610
INTRO_SECONDS = 3.2
PORTRAIT_HOLD = 3.0
TRANSITION_SECONDS = 1.3
LOGO_HOLD_SECONDS = 3.6
TRAVELLERS = 900
HOLD_PARTICLES = 2_400
GAMMA = 1.6
SEED = 20260929
FONT = "ui-monospace,SFMono-Regular,Consolas,monospace"

# Marco del retrato (VISUAL.MAP) y la cuadrícula de 300x340 que se dibuja dentro.
GRID_W, GRID_H = 300, 340
GRID_X, GRID_Y = 94, 154


def find_portrait() -> Path:
    for name in ("portrait.png", "portrait.jpg", "portrait.jpeg", "portrait.webp"):
        path = ASSETS / "source" / name
        if path.exists():
            return path
    raise SystemExit("Falta la foto: pon tu foto en assets/source/portrait.png")


# --------------------------------------------------------------------------- #
# Retrato 1-bit
# --------------------------------------------------------------------------- #


def dither(gray: np.ndarray) -> np.ndarray:
    """Floyd-Steinberg en serpentina. True = punto encendido."""
    work = gray.astype(np.float32) / 255.0
    out = np.zeros(work.shape, dtype=bool)
    rows, cols = work.shape
    for y in range(rows):
        forward = y % 2 == 0
        step = 1 if forward else -1
        for x in (range(cols) if forward else range(cols - 1, -1, -1)):
            lit = work[y, x] >= 0.5
            out[y, x] = lit
            err = work[y, x] - (1.0 if lit else 0.0)
            nx, bx = x + step, x - step
            if 0 <= nx < cols:
                work[y, nx] += err * 7 / 16
            if y + 1 < rows:
                if 0 <= bx < cols:
                    work[y + 1, bx] += err * 3 / 16
                work[y + 1, x] += err * 5 / 16
                if 0 <= nx < cols:
                    work[y + 1, nx] += err * 1 / 16
    return out


def portrait_points(theme: str) -> np.ndarray:
    image = ImageOps.exif_transpose(Image.open(find_portrait())).convert("RGBA")
    w, h = image.size
    # Con fondo transparente se encuadra la silueta; si no, la foto completa.
    bx0, by0, bx1, by1 = image.getchannel("A").getbbox() or (0, 0, w, h)
    crop_w = int((bx1 - bx0) * CROP_WIDTH)
    crop_h = int(crop_w * GRID_H / GRID_W)
    left = (bx0 + bx1 - crop_w) // 2
    top = by0 + int((by1 - by0) * CROP_TOP)
    crop = image.crop((left, top, left + crop_w, top + crop_h)).resize((GRID_W, GRID_H), Image.Resampling.LANCZOS)
    alpha = np.asarray(crop.getchannel("A"), dtype=np.float32) / 255.0

    backdrop = Image.new("RGBA", crop.size, "black" if theme == "dark" else "white")
    backdrop.alpha_composite(crop)
    gray = ImageOps.grayscale(backdrop.convert("RGB"))
    gray = ImageOps.autocontrast(gray, cutoff=1)
    # Contraste local para marcar ojos, cejas y boca.
    gray = gray.filter(ImageFilter.UnsharpMask(radius=18, percent=120, threshold=0))
    # La curva quita medios tonos (menos puntos, más definición) en ambos temas.
    tone = np.asarray(gray, dtype=np.float32) / 255.0
    tone = tone ** GAMMA if theme == "dark" else 1 - (1 - tone) ** GAMMA
    gray = Image.fromarray((tone * 255).astype("uint8"))
    gray = gray.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=1))

    bits = dither(np.asarray(gray))
    # En oscuro se encienden las zonas claras; en claro, las oscuras.
    active = (bits if theme == "dark" else ~bits) & (alpha > 0.1)
    ys, xs = np.where(active)
    return np.column_stack((GRID_X + xs, GRID_Y + ys)).astype(np.float32)


# --------------------------------------------------------------------------- #
# Logos (SVG -> silueta)
# --------------------------------------------------------------------------- #


def rasterize_svg(path: Path, size: int = 400, box: int = 300) -> np.ndarray:
    """Devuelve una máscara booleana size x size con la silueta del SVG centrada."""
    svg = path.read_text(encoding="utf-8")
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).replace(",", " ").split()]
    d_list = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    fig = plt.figure(figsize=(size / 100, size / 100), dpi=100)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_xlim(0, size)
    ax.set_ylim(size, 0)
    ax.axis("off")
    scale = box / max(vb[2], vb[3])
    ox = (size - vb[2] * scale) / 2 - vb[0] * scale
    oy = (size - vb[3] * scale) / 2 - vb[1] * scale
    transform = Affine2D().scale(scale).translate(ox, oy) + ax.transData
    for d in d_list:
        patch = PathPatch(parse_path(d), facecolor="black", edgecolor="none", transform=transform)
        ax.add_patch(patch)
    fig.canvas.draw()
    rgba = np.asarray(fig.canvas.buffer_rgba())
    plt.close(fig)
    return rgba[..., 0] < 128


def logo_points(mask: np.ndarray) -> np.ndarray:
    ys, xs = np.where(mask)
    # 400px de lienzo -> 270px dentro del marco del retrato.
    k = 0.675
    cx = GRID_X + GRID_W / 2 - 200 * k
    cy = GRID_Y + GRID_H / 2 - 200 * k
    return np.column_stack((cx + xs * k, cy + ys * k)).astype(np.float32)


def sample(points: np.ndarray, rng: np.random.Generator, count: int) -> np.ndarray:
    return points[rng.choice(len(points), count, replace=len(points) < count)]


def load_logos() -> dict[str, np.ndarray]:
    logos = {}
    for name in LOGO_ORDER:
        path = LOGOS / f"{name}.svg"
        if not path.exists():
            raise SystemExit(f"Falta el logo {path.relative_to(ROOT)}")
        logos[name] = logo_points(rasterize_svg(path))
    return logos


# --------------------------------------------------------------------------- #
# SVG
# --------------------------------------------------------------------------- #


def num(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def tnum(v: float) -> str:
    return f"{v:.4f}".rstrip("0").rstrip(".")


def runs_path(points: np.ndarray) -> str:
    """Une puntos horizontales contiguos en segmentos para que el SVG pese menos."""
    if not len(points):
        return ""
    pts = sorted({(int(x), int(y)) for x, y in np.rint(points)}, key=lambda p: (p[1], p[0]))
    out, i = [], 0
    while i < len(pts):
        x0, y = pts[i]
        x1 = x0
        i += 1
        while i < len(pts) and pts[i][1] == y and pts[i][0] <= x1 + 1:
            x1 = pts[i][0]
            i += 1
        out.append(f"M{x0} {y}h{x1 - x0 + 1}")
    return "".join(out)


def dots_path(points: np.ndarray) -> str:
    pts = sorted({(int(x), int(y)) for x, y in np.rint(points)}, key=lambda p: (p[1], p[0]))
    return "".join(f"M{x} {y}h1" for x, y in pts)


def match(source: np.ndarray, target: np.ndarray) -> np.ndarray:
    """Reordena target para que cada punto viaje la distancia mínima."""
    rows, cols = linear_sum_assignment(cdist(source, target, "sqeuclidean"))
    ordered = np.empty_like(target)
    ordered[rows] = target[cols]
    return ordered


def text(x, y, body, fill, size=13, anchor=None, weight=None, extra=""):
    attrs = f'x="{num(x)}" y="{num(y)}" fill="{fill}" font-family="{FONT}" font-size="{size}"'
    if anchor:
        attrs += f' text-anchor="{anchor}"'
    if weight:
        attrs += f' font-weight="{weight}"'
    return f"<text {attrs}{extra}>{body}</text>"


def render(theme: str, portrait: np.ndarray, logos: dict[str, np.ndarray],
           rng: np.random.Generator) -> str:
    t = THEMES[theme]
    n = min(TRAVELLERS, len(portrait))
    start = portrait[rng.choice(len(portrait), n, replace=False)]

    frames, times = [start, start], [0.0, PORTRAIT_HOLD]
    current = start
    for pts in logos.values():
        current = match(current, sample(pts, rng, n))
        frames += [current, current]
        times += [times[-1] + TRANSITION_SECONDS, times[-1] + TRANSITION_SECONDS + LOGO_HOLD_SECONDS]
    frames.append(start)
    times.append(times[-1] + TRANSITION_SECONDS)
    loop = times[-1]
    dur = tnum(loop)
    key_times = ";".join(tnum(v / loop) for v in times)
    anim = f'begin="{INTRO_SECONDS}s" dur="{dur}s" repeatCount="indefinite" keyTimes="{key_times}"'

    p = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
        'role="img" aria-labelledby="title desc">',
        f'<title id="title">{USERNAME} · profile.yml</title>',
        '<desc id="desc">Perfil animado estilo terminal: retrato en puntos que se transforma '
        f'en los logos de {", ".join(logos)}.</desc>',
        "<defs>",
        '<filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">'
        f'<feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="{t["shadow"]}" flood-opacity=".3"/></filter>',
        '<clipPath id="clip"><rect x="49" y="124" width="390" height="414" rx="3"/></clipPath>',
        '<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">'
        f'<path d="M0 0H4" stroke="{t["portrait"]}" stroke-opacity=".05"/></pattern>',
        "</defs>",
        f'<rect width="{W}" height="{H}" rx="18" fill="{t["bg"]}"/>',
        f'<rect x="13" y="13" width="1154" height="584" rx="13" fill="{t["panel"]}" stroke="{t["line"]}" filter="url(#shadow)"/>',
        f'<path d="M13 62H1167" stroke="{t["line"]}"/>',
        '<circle cx="38" cy="38" r="6" fill="#FF5F57"/><circle cx="59" cy="38" r="6" fill="#FEBC2E"/>'
        '<circle cx="80" cy="38" r="6" fill="#28C840"/>',
        text(590, 43, "vim ~/profile.yml", t["muted"], anchor="middle", extra=' letter-spacing=".4"'),
        # Marco izquierdo
        f'<rect x="35" y="88" width="418" height="472" rx="6" fill="{t["panel2"]}" stroke="{t["line"]}"/>',
        f'<rect x="36" y="125" width="416" height="434" fill="url(#scan)"/>',
        f'<path d="M35 124H453" stroke="{t["line"]}"/>',
        text(49, 111, "VISUAL.MAP", t["chrome"], weight="700", extra=' letter-spacing="1.2"'),
        text(438, 111, "300×340 / 1-BIT", t["muted"], size=11, anchor="end"),
        f'<path d="M49 141h12M49 141v12M439 141h-12M439 141v12M49 539h12M49 539v-12M439 539h-12M439 539v-12" '
        f'fill="none" stroke="{t["chrome"]}" opacity=".55"/>',
        '<g clip-path="url(#clip)" shape-rendering="crispEdges"><g>',
    ]

    # Capa del retrato: se desvanece mientras los viajeros forman los logos.
    fade = [".94", ".94"] + ["0"] * (len(frames) - 3) + [".94"]
    groups = rng.integers(0, 80, size=len(portrait))
    centroid = frames[2].mean(axis=0)
    jitter = rng.normal(0, 4, size=(80, 2))
    for g in range(80):
        pts = portrait[groups == g]
        if not len(pts):
            continue
        dx, dy = (centroid - pts.mean(axis=0)) * 0.18 + jitter[g]
        shift = ["0 0", "0 0", f"{num(dx)} {num(dy)}", f"{num(dx)} {num(dy)}"]
        shift += ["0 0"] * (len(frames) - len(shift))
        p.append(
            f'<path d="{runs_path(pts)}" fill="none" stroke="{t["portrait"]}" opacity=".94">'
            f'<animateTransform attributeName="transform" type="translate" {anim} values="{";".join(shift)}"/>'
            f'<animate attributeName="opacity" {anim} values="{";".join(fade)}"/></path>'
        )

    # Viajeros: cuadraditos que se mueven entre retrato y logos.
    show = ";".join(["0", "0"] + ["1"] * (len(frames) - 3) + ["0"])
    for i in range(n):
        values = ";".join(f"{num(f[i, 0])} {num(f[i, 1])}" for f in frames)
        p.append(
            f'<path d="M-.65-.65h1.3v1.3h-1.3z" fill="{t["portrait"]}">'
            f'<animateTransform attributeName="transform" type="translate" calcMode="linear" {anim} values="{values}"/>'
            f'<animate attributeName="opacity" {anim} values="{show}"/></path>'
        )

    # Nube densa que rellena cada logo mientras se mantiene quieto.
    for idx, pts in enumerate(logos.values()):
        vis = ["0"] * len(frames)
        vis[idx * 2 + 2] = vis[idx * 2 + 3] = ".85"
        p.append(
            f'<path d="{dots_path(sample(pts, rng, HOLD_PARTICLES))}" fill="none" stroke="{t["portrait"]}" opacity="0">'
            f'<animate attributeName="opacity" {anim} values="{";".join(vis)}"/></path>'
        )
    p.append("</g>")

    # Intro: el retrato aparece por grupos aleatorios.
    intro = rng.integers(0, 60, size=len(portrait))
    starts = np.empty(60)
    starts[rng.permutation(60)] = np.linspace(0.05, 1.2, 60)
    for g in range(60):
        pts = portrait[intro == g]
        if not len(pts):
            continue
        p.append(
            f'<path d="{runs_path(pts)}" fill="none" stroke="{t["portrait"]}" opacity="0">'
            f'<animate attributeName="opacity" begin="{num(starts[g])}s" dur=".8s" values="0;1" fill="freeze"/>'
            f'<animate attributeName="opacity" begin="{INTRO_SECONDS - 0.12:.2f}s" dur=".12s" values="1;0" fill="freeze"/></path>'
        )
    p.append("</g>")
    p.append(text(58, 551, f"PTS {len(portrait):05d} · FS/SERPENTINE", t["muted"], size=10))

    # Panel derecho: editor vim con el YAML.
    handle = f"@{USERNAME}"
    pill_w = max(132, len(handle) * 8 + 28)
    p += [
        f'<rect x="474" y="88" width="672" height="472" rx="6" fill="{t["panel2"]}" stroke="{t["line"]}"/>',
        f'<path d="M474 124H1146" stroke="{t["line"]}"/>',
        text(490, 111, "profile.yml", t["chrome"], weight="700", extra=' letter-spacing=".5"'),
        text(580, 111, "[YAML]", t["muted"], size=11),
        f'<rect x="{1128 - pill_w}" y="94" width="{pill_w}" height="24" rx="12" fill="{t["chrome"]}" '
        f'fill-opacity=".14" stroke="{t["chrome"]}"/>',
        text(1128 - pill_w / 2, 111, html.escape(handle), t["chrome"], anchor="middle", weight="700"),
    ]
    y = 148.0
    for i, (indent, key, value) in enumerate(YAML_ROWS, 1):
        if indent == 0:
            body = f'<tspan fill="{t["chrome"]}" font-weight="700">{html.escape(key)}:</tspan>'
            x = 525
        else:
            body = (f'<tspan fill="{t["portrait"]}">{html.escape(key)}: </tspan>'
                    f'<tspan fill="{t["text"]}">{html.escape(value)}</tspan>')
            x = 542
        p.append(text(506, y, f"{i:2d}", t["muted"], anchor="end", extra=' opacity=".5"'))
        p.append(text(x, y, body, t["text"]))
        y += 21.5

    # Cursor parpadeante al final del archivo.
    p.append(
        f'<rect x="525" y="{num(y - 13)}" width="8" height="16" fill="{t["portrait"]}">'
        '<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.5;.5;1" dur="1.1s" repeatCount="indefinite"/></rect>'
    )
    size_bytes = sum(len(f"{k}: {v}") + 2 * ind + 1 for ind, k, v in YAML_ROWS)
    rows = len(YAML_ROWS)
    p += [
        f'<path d="M474 526H1146" stroke="{t["line"]}"/>',
        f'<rect x="475" y="527" width="670" height="32" fill="{t["panel"]}"/>',
        f'<rect x="485" y="533" width="72" height="20" rx="3" fill="{t["portrait"]}"/>',
        text(521, 547, "NORMAL", t["bg"], size=11, anchor="middle", weight="700"),
        text(569, 547, "profile.yml", t["text"], size=12, weight="600"),
        text(740, 547, "[utf-8]", t["muted"], size=11),
        text(1134, 547, f"{rows}L, {size_bytes}B  100%  {rows}:1", t["muted"], size=11, anchor="end"),
        "</svg>",
    ]
    return "".join(p)


def main() -> None:
    logos = load_logos()
    for index, theme in enumerate(THEMES):
        rng = np.random.default_rng(SEED + index)
        portrait = portrait_points(theme)
        svg = render(theme, portrait, logos, rng)
        out = ASSETS / f"banner-{theme}.svg"
        out.write_text(svg, encoding="utf-8")
        print(f"{out.relative_to(ROOT)}: {out.stat().st_size / 1024:.0f} KiB, {len(portrait):,} puntos")
    print("secuencia:", " -> ".join(logos))


if __name__ == "__main__":
    main()
