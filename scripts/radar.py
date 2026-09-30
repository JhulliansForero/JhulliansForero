#!/usr/bin/env python3
"""Dibuja un gráfico de radar como SVG (versión oscura y clara). Solo librería estándar.

    python scripts/radar.py --data assets/skills.json -o assets/radar
    python scripts/radar.py --data assets/langmix.json -o assets/radar-langs

El JSON tiene la forma:
    {"title": "...", "axes": [{"label": "Java", "value": 80}, ...]}   # valores 0-100
"""

from __future__ import annotations

import argparse
import html
import json
import math
from pathlib import Path

THEMES = {
    "dark": {"grid": "#1B3526", "label": "#D6F5DF", "value": "#5F8A6E", "title": "#5EEAD4",
             "fill": "#39FF8A", "stroke": "#39FF8A"},
    "light": {"grid": "#B5DCC1", "label": "#0E2417", "value": "#5A7B64", "title": "#0F766E",
              "fill": "#0E8A45", "stroke": "#0E8A45"},
}
FONT = "ui-monospace,SFMono-Regular,Consolas,monospace"
WIDTH, HEIGHT = 440, 390
CX, CY, R = WIDTH / 2, HEIGHT / 2 + 14, 112
RINGS = 4


def point(i: int, n: int, radius: float) -> tuple[float, float]:
    angle = -math.pi / 2 + 2 * math.pi * i / n
    return CX + radius * math.cos(angle), CY + radius * math.sin(angle)


def fmt(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def polygon(pts) -> str:
    return " ".join(f"{fmt(x)},{fmt(y)}" for x, y in pts)


def render(title: str, axes: list[tuple[str, float]], theme: str) -> str:
    t = THEMES[theme]
    n = len(axes)
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" '
        f'role="img" aria-label="{html.escape(title)}">',
        f'<text x="{CX}" y="26" text-anchor="middle" fill="{t["title"]}" font-family="{FONT}" '
        f'font-size="14" font-weight="700" letter-spacing=".6">{html.escape(title)}</text>',
    ]
    for ring in range(1, RINGS + 1):
        pts = [point(i, n, R * ring / RINGS) for i in range(n)]
        out.append(f'<polygon points="{polygon(pts)}" fill="none" stroke="{t["grid"]}" '
                   f'stroke-dasharray="{"0" if ring == RINGS else "3 3"}"/>')
    for i in range(n):
        x, y = point(i, n, R)
        out.append(f'<path d="M{CX} {fmt(CY)}L{fmt(x)} {fmt(y)}" stroke="{t["grid"]}"/>')

    shape = [point(i, n, R * max(0.0, min(v, 100.0)) / 100) for i, (_, v) in enumerate(axes)]
    center = polygon([(CX, CY)] * n)
    out.append(
        f'<polygon points="{polygon(shape)}" fill="{t["fill"]}" fill-opacity=".18" stroke="{t["stroke"]}" '
        f'stroke-width="2" stroke-linejoin="round">'
        f'<animate attributeName="points" from="{center}" to="{polygon(shape)}" dur="1.2s" '
        'calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1" fill="freeze"/></polygon>'
    )
    for x, y in shape:
        out.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="3.5" fill="{t["stroke"]}"/>')

    for i, (label, value) in enumerate(axes):
        x, y = point(i, n, R + 26)
        dx = x - CX
        anchor = "middle" if abs(dx) < 8 else ("start" if dx > 0 else "end")
        y_off = -6 if y < CY - R * 0.5 else (10 if y > CY + R * 0.5 else 0)
        out.append(f'<text x="{fmt(x)}" y="{fmt(y + y_off)}" text-anchor="{anchor}" fill="{t["label"]}" '
                   f'font-family="{FONT}" font-size="12">{html.escape(label)}</text>')
        out.append(f'<text x="{fmt(x)}" y="{fmt(y + y_off + 15)}" text-anchor="{anchor}" fill="{t["value"]}" '
                   f'font-family="{FONT}" font-size="11">{fmt(value)}%</text>')
    out.append("</svg>")
    return "".join(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("-o", "--out", required=True)
    args = parser.parse_args()

    data = json.loads(args.data.read_text(encoding="utf-8"))
    axes = [(a["label"], float(a["value"])) for a in data["axes"]]
    if len(axes) < 3:
        raise SystemExit("Se necesitan al menos 3 ejes")
    for theme in THEMES:
        path = Path(f"{args.out}-{theme}.svg")
        path.write_text(render(data.get("title", "Skill Radar"), axes, theme), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()
