#!/usr/bin/env python
"""Render the Sgr B2 DS ALMA continuum with Nazar's contours burned in.

The paper panels were made in CARTA, so there is no script and no contour
level list to copy.  The contours are recoverable from the images themselves:
`SgrB2_RGB_..._sub_alma.png` is the background-subtracted JWST RGB with the
ALMA contours drawn on it, and `SgrB2_RGB_..._sub.png` is the same image
without them, so the difference between the two is exactly the contour ink.

That difference is reprojected onto the ALMA continuum grid and composited
over a magma rendering, giving a right-hand panel that carries the same
contours as the left-hand one, registered by WCS rather than by hand.

    python sgrb2_ds_alma_panels.py --vmin 0 --vmax 0.0065 --out alma_rows12.png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

JWST_DIR = Path('/orange/adamginsburg/jwst/sgrb2/pngs_466')
PLAIN = JWST_DIR / 'SgrB2_RGB_405410-212210-187182_sub.png'
WITH_CONTOURS = JWST_DIR / 'SgrB2_RGB_405410-212210-187182_sub_alma.png'
ALMA_FITS = Path('/orange/adamginsburg/sgrb2/2017.1.00114.S/imaging_results/'
                 'Sgr_B2_DS_B6_uid___A001_X1290_X46_continuum_merged_12M_reclean_'
                 'robust0.image.tt0.pbcor.fits')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--vmin', type=float, default=0.0)
    parser.add_argument('--vmax', type=float, default=0.0065)
    parser.add_argument('--cmap', default='magma')
    parser.add_argument('--contour-color', default='255,255,255')
    parser.add_argument('--no-contours', action='store_true')
    return parser.parse_args()


def contour_alpha(plain: Path, marked: Path):
    """Return (alpha, wcs): how much contour ink each JWST pixel carries."""
    from PIL import Image
    from pyavm import AVM

    Image.MAX_IMAGE_PIXELS = None
    a = np.asarray(Image.open(plain).convert('RGB')).astype(np.int16)
    b = np.asarray(Image.open(marked).convert('RGB')).astype(np.int16)
    if a.shape != b.shape:
        raise SystemExit(f'shape mismatch: {a.shape} vs {b.shape}')

    # Contours are drawn light over a dark image; use the brightening, scaled
    # so a fully drawn contour pixel is 1.0. Keeps the anti-aliased edges.
    diff = (b - a).max(axis=-1).astype(float)
    diff[diff < 8] = 0.0
    if diff.max() > 0:
        diff /= diff.max()

    wcs = AVM.from_image(str(marked)).to_wcs()
    wcs = wcs.celestial
    # AVM images are top-down; the WCS from AVM already accounts for that.
    print(f'  contour ink covers {(diff > 0.05).mean() * 100:.2f}% of the JWST image')
    return diff, wcs


def main() -> None:
    args = parse_args()

    from astropy.io import fits
    from astropy.wcs import WCS
    from astropy.visualization import LinearStretch, ManualInterval, ImageNormalize
    from reproject import reproject_interp
    import matplotlib as mpl
    from PIL import Image
    from pyavm import AVM

    print('reading ALMA continuum')
    with fits.open(ALMA_FITS) as hdul:
        data = np.squeeze(hdul[0].data).astype(float)
        alma_wcs = WCS(hdul[0].header).celestial

    norm = ImageNormalize(interval=ManualInterval(args.vmin, args.vmax),
                          stretch=LinearStretch(), clip=True)
    rgba = (mpl.colormaps[args.cmap](norm(np.nan_to_num(data, nan=args.vmin))) * 255)
    rgba[..., 3] = np.where(np.isfinite(data), 255, 0)

    if not args.no_contours:
        print('extracting contour ink from the JWST pair')
        ink, jwst_wcs = contour_alpha(PLAIN, WITH_CONTOURS)

        print('reprojecting contours onto the ALMA grid')
        ink_on_alma, _ = reproject_interp((ink, jwst_wcs), alma_wcs, shape_out=data.shape,
                                          order='bilinear')
        ink_on_alma = np.nan_to_num(ink_on_alma, nan=0.0).clip(0, 1)
        print(f'  {(ink_on_alma > 0.05).mean() * 100:.2f}% of the ALMA image is under a contour')

        color = np.array([float(c) for c in args.contour_color.split(',')])
        w = ink_on_alma[..., None]
        rgba[..., :3] = rgba[..., :3] * (1 - w) + color[None, None, :] * w

    out = np.flipud(rgba.astype(np.uint8))  # FITS is bottom-up, PNG top-down
    Image.fromarray(out, mode='RGBA').save(args.out)

    AVM.from_wcs(alma_wcs, shape=data.shape).embed(str(args.out), str(args.out))
    print(f'wrote {args.out} ({data.shape[1]} x {data.shape[0]} px) with AVM tags')


if __name__ == '__main__':
    main()
