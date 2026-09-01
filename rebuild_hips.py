#!/usr/bin/env python
"""Rebuild a HiPS from an AVM-tagged JPEG/PNG at an explicitly chosen order.

``reproject_to_hips(..., level=None)`` picks the tile order automatically, and
for small, finely-sampled images (the Gemini/GeMS Trapezium mosaic, for
instance) it can choose an order far coarser than the data.  The image then
renders smeared across a degree of sky instead of a few arcminutes, which looks
like the image is superposed in the wrong place.

This script computes the order from the image's own pixel scale and rebuilds.

    python rebuild_hips.py /path/to/image_with_avm.jpg /path/to/output_hips
    python rebuild_hips.py image.jpg out_hips --level 14     # force an order
    python rebuild_hips.py image.jpg out_hips --check-only   # just report
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np

# HEALPix pixel size in arcsec at nside=1; pixel nside for a HiPS of tile order
# k with 512-pixel tiles is 2**(k+9).
HEALPIX_NSIDE1_ARCSEC = 58.6323 * 3600
TILE_PIXELS_LOG2 = 9  # log2(512)


def pixel_scale_arcsec(image_path: Path) -> tuple[float, tuple[int, int]]:
    """Pixel scale in arcsec and (width, height) from the file's AVM metadata."""
    from PIL import Image
    from pyavm import AVM

    Image.MAX_IMAGE_PIXELS = None
    with Image.open(image_path) as im:
        size = im.size

    avm = AVM.from_image(str(image_path))
    scale = avm.Spatial.Scale
    if scale is None:
        raise SystemExit(f"{image_path} has no Spatial.Scale in its AVM metadata")
    return abs(float(scale[0])) * 3600, size


def level_for_scale(scale_arcsec: float) -> int:
    """Smallest tile order whose pixels are at least as fine as the image."""
    # tile order k -> pixel size = HEALPIX_NSIDE1_ARCSEC / 2**(k + 9)
    exact = math.log2(HEALPIX_NSIDE1_ARCSEC / scale_arcsec) - TILE_PIXELS_LOG2
    return int(math.ceil(exact))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("image", type=Path, help="AVM-tagged JPEG or PNG")
    parser.add_argument("output", type=Path, nargs="?", help="output HiPS directory")
    parser.add_argument("--level", type=int, default=None,
                        help="tile order to force (default: from the pixel scale)")
    parser.add_argument("--frame", default="galactic",
                        choices=["galactic", "equatorial", "ecliptic"],
                        help="HiPS coordinate frame (existing tours use galactic)")
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--check-only", action="store_true",
                        help="report the scale and recommended order, build nothing")
    args = parser.parse_args()

    scale, (width, height) = pixel_scale_arcsec(args.image)
    level = args.level if args.level is not None else level_for_scale(scale)
    hips_pixel = HEALPIX_NSIDE1_ARCSEC / 2 ** (level + TILE_PIXELS_LOG2)

    print(f"{args.image.name}")
    print(f"  image        : {width} x {height} px")
    print(f"  pixel scale  : {scale:.4f} arcsec/px")
    print(f"  extent       : {width * scale / 60:.2f}' x {height * scale / 60:.2f}'")
    print(f"  tile order   : {level}  ({hips_pixel:.4f} arcsec/px in the HiPS)")

    if args.check_only:
        return
    if args.output is None:
        parser.error("output directory is required unless --check-only is given")
    if args.output.exists():
        raise SystemExit(f"{args.output} already exists; remove it or pick another name")

    from reproject import reproject_interp
    from reproject.hips import reproject_to_hips

    reproject_to_hips(
        str(args.image),
        coord_system_out=args.frame,
        reproject_function=reproject_interp,
        output_directory=str(args.output),
        level=level,
        threads=args.threads,
        progress_bar=None,
    )
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
