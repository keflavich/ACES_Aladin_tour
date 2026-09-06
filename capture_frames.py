#!/usr/bin/env python
"""Capture one PNG per waypoint of a tour, image only -- no text, no buttons.

For pulling a tour into a slide deck: each stop becomes a static frame at the
same field of view the tour uses, with the description panel and every control
hidden, waiting long enough for the HiPS tiles to finish loading.

    python capture_frames.py \\
        --url https://data.rc.ufl.edu/pub/adamginsburg/ACES_Aladin_tour/sgrb2_ds_zoom.html \\
        --waypoints waypoints_sgrb2_ds_zoom.json \\
        --outdir frames/sgrb2_ds --size 1920x1080

Requires playwright (`pip install playwright && playwright install chromium`).
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def slugify(title: str, index: int) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
    return f'{index:02d}_{slug or "frame"}'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--url', required=True, help='tour page URL')
    parser.add_argument('--waypoints', type=Path, required=True,
                        help='the tourdirectory waypoint JSON, for titles and count')
    parser.add_argument('--outdir', type=Path, required=True)
    parser.add_argument('--size', default='1920x1080')
    parser.add_argument('--settle', type=float, default=12.0,
                        help='seconds to wait after each jump for tiles to load')
    parser.add_argument('--first-settle', type=float, default=25.0,
                        help='extra wait on the first frame while Aladin starts up')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise SystemExit('playwright not installed: pip install playwright && '
                         'playwright install chromium')

    width, height = (int(v) for v in args.size.lower().split('x'))
    waypoints = json.loads(args.waypoints.read_text())['waypoints']
    args.outdir.mkdir(parents=True, exist_ok=True)

    # kiosk hides the controls; description=false collapses the text panel
    sep = '&' if '?' in args.url else '?'
    url = f'{args.url}{sep}kiosk=true&description=false'

    written = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--hide-scrollbars', '--mute-audio'])
        page = browser.new_page(viewport={'width': width, 'height': height},
                                device_scale_factor=1)
        print(f'loading {url}')
        page.goto(url, wait_until='domcontentloaded')

        # Hide every bit of chrome. Naming Aladin's control classes one by one
        # misses some (the coordinate-frame and projection pickers), so keep
        # only the canvases inside the Aladin div and drop everything else.
        page.add_style_tag(content='''
            #waypoint-info, #tour-controls, #progress-container, #countdown-timer,
            #intro-overlay, #loading-div, #minimize-btn, #expand-btn
                { display: none !important; }
            #aladin-lite-div > *:not(canvas) { display: none !important; }
            .aladin-box, .aladin-logo-container, .aladin-location, .aladin-fov,
            .aladin-projSelection, .aladin-frameChoice, .aladin-menu
                { display: none !important; }
        ''')

        print(f'settling {args.first_settle:.0f}s for Aladin to initialize')
        page.wait_for_timeout(int(args.first_settle * 1000))

        for i, waypoint in enumerate(waypoints):
            title = waypoint.get('title', f'frame {i}')
            # jumpToWaypointWithLayers puts the layers in the right state without
            # animating, so the frame matches what the tour shows when it arrives
            page.evaluate(f'jumpToWaypointWithLayers({i})')
            page.wait_for_timeout(int(args.settle * 1000))
            out = args.outdir / f'{slugify(title, i)}.png'
            # Aladin redraws continuously, so Playwright's default screenshot
            # stability wait can time out; allow animations and give it room.
            try:
                page.screenshot(path=str(out), timeout=120000, animations='allow',
                                caret='initial')
            except Exception as exc:
                print(f'    screenshot retry after: {type(exc).__name__}')
                page.wait_for_timeout(4000)
                page.screenshot(path=str(out), timeout=180000, animations='allow',
                                caret='initial')
            written.append(out)
            print(f'  [{i + 1}/{len(waypoints)}] {title} -> {out.name}')

        browser.close()

    index = args.outdir / 'index.html'
    rows = '\n'.join(
        f'<figure><img src="{p.name}" loading="lazy">'
        f'<figcaption>{i}. {waypoints[i].get("title", "")}</figcaption></figure>'
        for i, p in enumerate(written))
    index.write_text(f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Tour frames</title>
<style>
 body {{ font-family: system-ui, sans-serif; margin: 24px; background: #111; color: #eee; }}
 figure {{ margin: 0 0 26px 0; }}
 img {{ max-width: 100%; border: 1px solid #333; display: block; }}
 figcaption {{ font-size: 0.85rem; padding-top: 6px; color: #bbb; }}
 a {{ color: #8fb2ff; }}
</style></head><body>
<h1>Tour frames</h1>
<p>Static frames captured from <a href="{args.url}">the tour</a>. Right-click to save.</p>
{rows}
</body></html>''')
    print(f'wrote {len(written)} frames and {index}')


if __name__ == '__main__':
    main()
