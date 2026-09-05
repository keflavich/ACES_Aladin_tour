#!/usr/bin/env python
"""Write an index.html listing every HiPS under avm_images/.

The bare directory listing is hard to use: it does not say what a layer is, how
deep it goes, or where on the sky it points, and it does not distinguish a real
HiPS from a stray directory.  This reads each layer's `properties` file and
writes a sortable table with a link to the layer, its `properties`, and an
Aladin Lite preview centred on it.

    python make_avm_index.py [--root /orange/adamginsburg/web/public/avm_images]
"""

from __future__ import annotations

import argparse
import html
import re
from datetime import datetime, timezone
from pathlib import Path

PREVIEW = ('https://aladin.cds.unistra.fr/AladinLite/?target={ra}%20{dec}'
           '&fov={fov}&survey={url}')


def parse_properties(path: Path) -> dict:
    out = {}
    for line in path.read_text(errors='replace').splitlines():
        if '=' in line and not line.startswith('#'):
            key, _, value = line.partition('=')
            out[key.strip()] = value.strip()
    return out


def collect(root: Path) -> list[dict]:
    layers = []
    for props in sorted(root.glob('*/properties')):
        directory = props.parent
        p = parse_properties(props)
        orders = sorted(int(m.group(1)) for m in
                        (re.match(r'Norder(\d+)$', d.name) for d in directory.glob('Norder*'))
                        if m)
        try:
            ra = float(p.get('hips_initial_ra', 'nan'))
            dec = float(p.get('hips_initial_dec', 'nan'))
            fov = float(p.get('hips_initial_fov', 'nan'))
        except ValueError:
            ra = dec = fov = float('nan')
        layers.append({
            'name': directory.name,
            'order': p.get('hips_order', '?'),
            'orders_present': f'{min(orders)}-{max(orders)}' if orders else 'none',
            'frame': p.get('hips_frame', '?'),
            'fmt': p.get('hips_tile_format', '?'),
            'ra': ra, 'dec': dec, 'fov': fov,
            'builder': p.get('hips_builder', ''),
            'date': p.get('hips_release_date', '')[:10],
        })
    return layers


def render(layers: list[dict], base_url: str) -> str:
    rows = []
    for layer in layers:
        name = html.escape(layer['name'])
        pos = ('&mdash;' if layer['ra'] != layer['ra']
               else f"{layer['ra']:.5f} {layer['dec']:+.5f}")
        fov = '&mdash;' if layer['fov'] != layer['fov'] else f"{layer['fov'] * 60:.2f}'"
        preview = ('' if layer['ra'] != layer['ra'] else
                   f'<a href="{PREVIEW.format(ra=layer["ra"], dec=layer["dec"], fov=max(layer["fov"], 0.01), url=base_url + name)}" target="_blank">view</a>')
        rows.append(
            f'<tr><td class="n"><a href="{name}/">{name}</a></td>'
            f'<td>{layer["order"]}</td><td>{layer["orders_present"]}</td>'
            f'<td>{layer["frame"]}</td><td>{layer["fmt"]}</td>'
            f'<td class="num">{pos}</td><td class="num">{fov}</td>'
            f'<td>{html.escape(layer["date"])}</td>'
            f'<td><a href="{name}/properties">properties</a> {preview}</td></tr>')

    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>avm_images HiPS index</title>
<style>
 body {{ font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        margin: 24px; color: #1b1f27; }}
 h1 {{ font-size: 1.4rem; margin-bottom: 2px; }}
 p.sub {{ color: #667; margin-top: 0; font-size: 0.9rem; }}
 input {{ padding: 7px 10px; width: 340px; font-size: 0.95rem; margin: 10px 0 14px 0; }}
 table {{ border-collapse: collapse; font-size: 0.86rem; }}
 th, td {{ padding: 4px 10px; border-bottom: 1px solid #e3e6ec; text-align: left;
          white-space: nowrap; }}
 th {{ background: #f4f6fa; position: sticky; top: 0; cursor: pointer; }}
 td.n {{ font-family: ui-monospace, Menlo, Consolas, monospace; }}
 td.num {{ font-variant-numeric: tabular-nums; }}
 tr:hover {{ background: #f8fbff; }}
 a {{ color: #1a56db; text-decoration: none; }}
 a:hover {{ text-decoration: underline; }}
</style>
</head>
<body>
<h1>avm_images HiPS index</h1>
<p class="sub">{len(layers)} layers &middot; generated {now} by
   <code>ACES_Aladin_tour/make_avm_index.py</code></p>
<input id="filter" placeholder="filter by name, e.g. SgrB2 or Brick" autofocus>
<table id="t">
<thead><tr><th>layer</th><th>max order</th><th>orders</th><th>frame</th><th>tiles</th>
<th>centre (ra dec)</th><th>fov</th><th>built</th><th>links</th></tr></thead>
<tbody>
{chr(10).join(rows)}
</tbody></table>
<script>
const box = document.getElementById('filter');
box.addEventListener('input', () => {{
  const q = box.value.toLowerCase();
  for (const tr of document.querySelectorAll('#t tbody tr')) {{
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  }}
}});
document.querySelectorAll('#t th').forEach((th, i) => {{
  th.addEventListener('click', () => {{
    const body = document.querySelector('#t tbody');
    const rows = [...body.querySelectorAll('tr')];
    const asc = th.dataset.asc !== 'true';
    th.dataset.asc = asc;
    rows.sort((a, b) => {{
      const x = a.children[i].textContent.trim(), y = b.children[i].textContent.trim();
      const nx = parseFloat(x), ny = parseFloat(y);
      const cmp = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : x.localeCompare(y);
      return asc ? cmp : -cmp;
    }});
    rows.forEach(r => body.appendChild(r));
  }});
}});
</script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--root', type=Path,
                        default=Path('/orange/adamginsburg/web/public/avm_images'))
    parser.add_argument('--base-url', default='https://data.rc.ufl.edu/pub/adamginsburg/avm_images/')
    args = parser.parse_args()

    layers = collect(args.root)
    (args.root / 'index.html').write_text(render(layers, args.base_url))
    print(f'wrote {args.root / "index.html"} listing {len(layers)} HiPS layers')


if __name__ == '__main__':
    main()
