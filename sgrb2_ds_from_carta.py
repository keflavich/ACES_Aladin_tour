#!/usr/bin/env python
"""Reproduce Nazar's Sgr B2 DS figure panels from his CARTA workspace.

The workspace (/orange/adamginsburg/sgrb2/NB/JWST_480_paper_fig.json) records
every choice the figure was made with: which files, which colormaps, the
scaling function and limits per layer, the contour source and its levels, and
the three panel regions.  This reads those out and renders

  * the JWST RGB   -- f480m-f410m (red), f405n-f410m (green), f187n-f182m (blue),
                      each sqrt-scaled between CARTA's own limits
  * the ALMA panel -- 1.3 mm continuum, inferno, linear, CARTA's limits
  * the contours   -- from the masked moment-0 map at CARTA's five levels,
                      as sky polygons for a vector overlay

as AVM-tagged PNGs plus a polygon JSON, ready for `rebuild_hips.py`.

    python sgrb2_ds_from_carta.py --what all --outdir .
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

WORKSPACE = Path('/orange/adamginsburg/sgrb2/NB/JWST_480_paper_fig.json')

# CARTA FrameScaling enum
SCALING = {0: 'linear', 1: 'log', 2: 'sqrt', 3: 'squared', 4: 'gamma', 5: 'power'}



def tag_avm(png, wcs, shape):
    """Attach WCS to a PNG as AVM metadata.

    pyavm's AVM.from_wcs stores Scale+Rotation, which is degenerate near
    position angle 90 deg -- exactly where Galactic Center fields sit -- and
    silently reconstructs a mirrored WCS, putting the HiPS out by hundreds of
    arcsec.  jwst_rgb.save_rgb.faithful_avm stores the full CD matrix instead.
    """
    try:
        from jwst_rgb.save_rgb import faithful_avm
        avm = faithful_avm(wcs, shape=shape)
    except ImportError:
        from pyavm import AVM
        import warnings as _w
        _w.warn('jwst_rgb not available; falling back to AVM.from_wcs, which is '
                'degenerate near PA=90 deg and may mirror the image')
        avm = AVM.from_wcs(wcs, shape=shape)
    avm.embed(str(png), str(png))

def load_workspace() -> dict:
    return json.loads(WORKSPACE.read_text())


def carta_path(entry: dict) -> Path:
    """CARTA stores /orange_link/... which is /orange/adamginsburg/... here."""
    directory = entry['directory'].replace('/orange_link/', '/orange/adamginsburg/')
    return Path(directory) / entry['filename']


def scale(data: np.ndarray, vmin: float, vmax: float, how: str) -> np.ndarray:
    """Apply CARTA's scaling, returning values in [0, 1]."""
    x = np.clip((np.nan_to_num(data, nan=vmin) - vmin) / (vmax - vmin), 0, 1)
    if how == 'linear':
        return x
    if how == 'sqrt':
        return np.sqrt(x)
    if how == 'squared':
        return x ** 2
    if how == 'log':
        return np.log1p(1000 * x) / np.log(1001)
    raise SystemExit(f'unhandled CARTA scaling: {how}')


def read_layer(entry: dict):
    from astropy.io import fits
    from astropy.wcs import WCS
    path = carta_path(entry)
    with fits.open(path) as hdul:
        hdu = next(h for h in hdul if h.data is not None)
        data = np.squeeze(hdu.data).astype(float)
        wcs = WCS(hdu.header).celestial
    rc = entry['renderConfig']
    return data, wcs, float(rc['scaleMin'][0]), float(rc['scaleMax'][0]), SCALING[rc['scaling']]


def build_rgb(ws: dict, out: Path) -> None:
    """Red/green/blue layers, reprojected onto the red layer's grid."""
    from reproject import reproject_interp
    from PIL import Image

    by_name = {f['filename']: f for f in ws['files']}
    channels = [('f480m_minus_f410m_unscaledsub.fits', 'R'),
                ('f405n_minus_f410m.fits', 'G'),
                ('f187n_minus_f182m.fits', 'B')]

    base_data, base_wcs, vmin, vmax, how = read_layer(by_name[channels[0][0]])
    print(f'R {channels[0][0]}: {base_data.shape[1]}x{base_data.shape[0]}, '
          f'{how} {vmin:.4g}..{vmax:.4g}')
    planes = [scale(base_data, vmin, vmax, how)]

    for filename, label in channels[1:]:
        data, wcs, vmin, vmax, how = read_layer(by_name[filename])
        print(f'{label} {filename}: {data.shape[1]}x{data.shape[0]}, {how} {vmin:.4g}..{vmax:.4g}'
              + ('  (reprojecting)' if data.shape != base_data.shape else ''))
        if data.shape != base_data.shape or not np.allclose(wcs.wcs.cdelt, base_wcs.wcs.cdelt):
            data, _ = reproject_interp((data, wcs), base_wcs, shape_out=base_data.shape,
                                       order='bilinear')
        planes.append(scale(data, vmin, vmax, how))

    rgb = (np.dstack(planes) * 255).astype(np.uint8)
    alpha = np.where(np.isfinite(base_data), 255, 0).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])
    Image.fromarray(np.flipud(rgba), mode='RGBA').save(out)
    tag_avm(out, base_wcs, base_data.shape)
    print(f'wrote {out}')


def build_alma(ws: dict, out: Path, pad_arcsec: float = 20.0) -> None:
    """ALMA continuum cut down to the region containing the CARTA panels."""
    import matplotlib as mpl
    from astropy.coordinates import SkyCoord
    from astropy.nddata import Cutout2D
    import astropy.units as u
    from PIL import Image

    entry = next(f for f in ws['files'] if f['filename'].startswith('Sgr_B2_DS_B6'))
    data, wcs, vmin, vmax, how = read_layer(entry)
    cmap = entry['renderConfig']['colorMap'].lower()
    print(f'ALMA {entry["filename"][:50]}: {how} {vmin:.4g}..{vmax:.4g}, cmap {cmap}')

    regions = panel_regions(ws, wcs)
    centers = SkyCoord([r['ra'] for r in regions] * u.deg, [r['dec'] for r in regions] * u.deg)
    center = SkyCoord(centers.ra.mean(), centers.dec.mean())
    span = max(centers.separation(center).max().to_value(u.arcsec) * 2,
               max(r['size'] for r in regions)) + 2 * pad_arcsec
    pixscale = abs(wcs.wcs.cdelt[0]) * 3600
    size = int(span / pixscale)
    cut = Cutout2D(data, center, (size, size), wcs=wcs)
    print(f'  cutout {size}x{size} px ({span:.1f} arcsec) around the three panels')

    rgba = (mpl.colormaps[cmap](scale(cut.data, vmin, vmax, how)) * 255)
    rgba[..., 3] = np.where(np.isfinite(cut.data), 255, 0)
    Image.fromarray(np.flipud(rgba.astype(np.uint8)), mode='RGBA').save(out)
    tag_avm(out, cut.wcs, cut.data.shape)
    print(f'wrote {out}')


def build_contours(ws: dict, out: Path) -> None:
    """Contours from the moment-0 map, as sky polygons for a vector overlay."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from scipy.ndimage import gaussian_filter

    entry = next(f for f in ws['files'] if 'contourConfig' in f)
    cfg = entry['contourConfig']
    data, wcs, *_ = read_layer(entry)
    levels = cfg['levels']
    smoothing = cfg.get('smoothingFactor', 1)
    print(f'contours from {entry["filename"]}: levels {levels}, '
          f'smoothing mode {cfg.get("smoothingMode")} factor {smoothing}')

    # CARTA smoothing mode 2 is a Gaussian of the given factor (in pixels)
    smoothed = gaussian_filter(np.nan_to_num(data, nan=0.0), smoothing / 2.0)

    polygons = []
    cs = plt.contour(smoothed, levels=levels)
    for path_collection in cs.allsegs:
        for seg in path_collection:
            if len(seg) < 3:
                continue
            world = wcs.pixel_to_world(seg[:, 0], seg[:, 1])
            polygons.append([[round(float(r), 7), round(float(d), 7)]
                             for r, d in zip(world.ra.deg, world.dec.deg)])
    plt.close('all')

    color = cfg.get('color', {})
    out.write_text(json.dumps({
        'polygons': polygons,
        'levels': levels,
        'color': f"rgb({color.get('r', 255)},{color.get('g', 255)},{color.get('b', 255)})",
        'source': f"{entry['filename']} via {WORKSPACE.name}",
    }))
    print(f'wrote {out}: {len(polygons)} contour polylines')


def panel_regions(ws: dict, wcs=None) -> list[dict]:
    """The three saved CARTA rectangles, as sky center + size in arcsec."""
    from astropy.wcs import WCS
    from astropy.io import fits

    entry = next(f for f in ws['files'] if f.get('regionsSet', {}).get('regions'))
    if wcs is None:
        with fits.open(carta_path(entry)) as hdul:
            wcs = WCS(next(h for h in hdul if h.data is not None).header).celestial
    pixscale = abs(wcs.wcs.cdelt[0]) * 3600

    out = []
    for region in entry['regionsSet']['regions']:
        (cx, cy), (sx, _) = ((p['x'], p['y']) for p in region['points'])
        sky = wcs.pixel_to_world(cx - 1, cy - 1)
        out.append({'ra': float(sky.ra.deg), 'dec': float(sky.dec.deg),
                    'size': float(sx * pixscale)})
    # north to south, which is the order the figure rows run in
    return sorted(out, key=lambda r: -r['dec'])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--what', default='all', choices=['all', 'rgb', 'alma', 'contours', 'regions'])
    parser.add_argument('--outdir', type=Path, default=Path('.'))
    args = parser.parse_args()

    import warnings
    warnings.filterwarnings('ignore')

    ws = load_workspace()
    args.outdir.mkdir(parents=True, exist_ok=True)

    if args.what in ('all', 'regions'):
        for i, r in enumerate(panel_regions(ws), 1):
            print(f"panel {i}: ra={r['ra']:.6f} dec={r['dec']:.6f} "
                  f"size={r['size']:.2f} arcsec (fov={r['size'] / 3600:.5f})")
    if args.what in ('all', 'rgb'):
        build_rgb(ws, args.outdir / 'SgrB2_DS_jwst_rgb.png')
    if args.what in ('all', 'alma'):
        build_alma(ws, args.outdir / 'SgrB2_DS_alma_inferno.png')
    if args.what in ('all', 'contours'):
        build_contours(ws, args.outdir / 'sgrb2_ds_contours.json')


if __name__ == '__main__':
    main()
