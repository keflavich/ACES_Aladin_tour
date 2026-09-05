#!/usr/bin/env python
"""Render a 2D FITS image to an AVM-tagged PNG on its native pixel grid.

The PNG keeps the image's own WCS (via AVM metadata), so `rebuild_hips.py` can
turn it into a HiPS that lands exactly where the data does -- no manual
pixel<->sky placement anywhere in the chain.

    python fits_to_avm_png.py image.fits out.png --vmin 0 --vmax 0.0065 --cmap magma

Degenerate Stokes/frequency axes are dropped.  Use --stretch asinh/log/sqrt for
a non-linear scaling; the default is linear, which is what a colorbar labelled
with plain flux values implies.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np



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

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("fits", type=Path)
    parser.add_argument("png", type=Path)
    parser.add_argument("--vmin", type=float, default=None, help="default: 0.5th percentile")
    parser.add_argument("--vmax", type=float, default=None, help="default: 99.5th percentile")
    parser.add_argument("--cmap", default="magma")
    parser.add_argument("--stretch", default="linear",
                        choices=["linear", "sqrt", "log", "asinh"])
    parser.add_argument("--transparent-below", type=float, default=None,
                        help="make pixels below this value fully transparent")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    from astropy.io import fits
    from astropy.wcs import WCS
    from astropy.visualization import (LinearStretch, SqrtStretch, LogStretch,
                                       AsinhStretch, ManualInterval, ImageNormalize)
    import matplotlib as mpl
    from PIL import Image

    with fits.open(args.fits) as hdul:
        hdu = hdul[0]
        data = np.squeeze(hdu.data).astype(float)
        wcs = WCS(hdu.header).celestial
        if data.ndim != 2:
            raise SystemExit(f"expected a 2D image after squeezing, got {data.shape}")

    finite = np.isfinite(data)
    vmin = args.vmin if args.vmin is not None else float(np.nanpercentile(data[finite], 0.5))
    vmax = args.vmax if args.vmax is not None else float(np.nanpercentile(data[finite], 99.5))
    stretch = {"linear": LinearStretch, "sqrt": SqrtStretch,
               "log": LogStretch, "asinh": AsinhStretch}[args.stretch]()
    norm = ImageNormalize(interval=ManualInterval(vmin, vmax), stretch=stretch, clip=True)

    print(f"{args.fits.name}: {data.shape[1]} x {data.shape[0]} px, "
          f"{abs(wcs.wcs.cdelt[0]) * 3600:.4f} arcsec/px")
    print(f"  scaling: {args.stretch} {vmin:g} .. {vmax:g}, cmap {args.cmap}")

    rgba = (mpl.colormaps[args.cmap](norm(np.nan_to_num(data, nan=vmin))) * 255).astype(np.uint8)
    alpha = np.where(finite, 255, 0)
    if args.transparent_below is not None:
        alpha = np.where(finite & (data >= args.transparent_below), 255, 0)
    rgba[..., 3] = alpha

    # FITS is bottom-up, PNG is top-down
    Image.fromarray(np.flipud(rgba), mode="RGBA").save(args.png)

    # Tag with the image's own WCS so downstream tools place it correctly
    tag_avm(args.png, wcs, data.shape)
    print(f"wrote {args.png} with AVM tags")


if __name__ == "__main__":
    main()
