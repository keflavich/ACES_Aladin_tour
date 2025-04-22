#!/usr/bin/env python
import os
import sys
import shutil
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from astropy.coordinates import SkyCoord
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
import matplotlib
from PIL import Image
import math
from datetime import datetime

# Force matplotlib to not use any Xwindows backend
matplotlib.use('Agg')

def create_custom_cmap():
    """Create a custom colormap that transitions from grayscale to hot."""
    # Define colors for custom colormap
    # Start with grayscale (black to white)
    # Then transition to hot colors (white to yellow to red)
    colors = [(0, 0, 0),      # black
              (0.3, 0.3, 0.3), # dark gray
              (0.6, 0.6, 0.6), # medium gray
              (0.9, 0.9, 0.9), # light gray
              (1, 1, 1),      # white
              (1, 1, 0.8),    # pale yellow
              (1, 0.8, 0.4),  # yellow
              (1, 0.4, 0),    # orange
              (1, 0, 0)]      # red

    # Create the colormap
    positions = np.linspace(0, 1, len(colors))
    cmap_dict = {'red': [], 'green': [], 'blue': []}

    for pos, color in zip(positions, colors):
        cmap_dict['red'].append((pos, color[0], color[0]))
        cmap_dict['green'].append((pos, color[1], color[1]))
        cmap_dict['blue'].append((pos, color[2], color[2]))

    return LinearSegmentedColormap('gray_to_hot', cmap_dict)

def process_fits_to_image(fits_file, output_dir="temp_fits_processed"):
    """
    Process FITS file to create a scaled and colored image with WCS information.
    Returns the processed data, WCS object, and file path.
    """
    # Create output directory if it doesn't exist
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir)

    print(f"Opening FITS file: {fits_file}")
    # Open FITS file
    with fits.open(fits_file) as hdul:
        data = hdul[0].data
        header = hdul[0].header
        wcs = WCS(header)

    print("Processing FITS data...")
    # Get data min/max for scaling after dealing with NaN values
    data_clean = data.copy()
    mask = np.isnan(data_clean)
    data_clean[mask] = 0

    vmin = np.percentile(data_clean[data_clean > 0], 1)
    vmax = np.percentile(data_clean, 99.8)

    # Apply log scaling to enhance visibility of features
    # Handle zero or negative values safely before log
    data_clean_pos = np.where(data_clean > vmin, data_clean, vmin)
    data_scaled = np.log10(data_clean_pos)

    # Normalize to 0-1 range
    data_min = np.min(data_scaled)
    data_max = np.max(data_scaled)
    data_normalized = (data_scaled - data_min) / (data_max - data_min)

    # Create custom colormap
    cmap = create_custom_cmap()

    # Create the colored image using matplotlib
    plt.figure(figsize=(10, 10), dpi=300)
    ax = plt.subplot(projection=wcs)
    im = ax.imshow(data_normalized, origin='lower', cmap=cmap, vmin=0, vmax=1)

    # Remove axes for a clean image
    ax.set_axis_off()

    # Add WCS grid
    ax.coords.grid(True, color='white', ls='dotted', alpha=0.5)

    # Remove the colorbar as it's not needed for HiPS display
    # cbar = plt.colorbar(im, pad=0.01)
    # cbar.set_label('Normalized Intensity')

    # Save the image with WCS information as PNG
    figfile = os.path.join(output_dir, "colored_fits.png")
    plt.savefig(figfile, dpi=300, bbox_inches='tight')
    plt.close()

    # Save also as a FITS file (the normalized data)
    fitsfile = os.path.join(output_dir, "normalized.fits")
    hdu = fits.PrimaryHDU(data=data_normalized, header=header)
    hdu.writeto(fitsfile, overwrite=True)

    return data_normalized, wcs, figfile, fitsfile

def healpix_to_xy(order, ipix):
    """
    Convert HEALPix pixel index to x,y in the range [0,2^order)
    """
    # This is a simple implementation - the real HEALPix calculation is more complex
    # but for our visualization purposes, this approximation should work
    npix = 12 * (4 ** order)
    nside = 2 ** order

    # Approximate conversion (not accurate for real astronomical use)
    # but sufficient for creating a visual HiPS structure
    face_num = ipix // (nside * nside)
    index_in_face = ipix % (nside * nside)

    x = index_in_face % nside
    y = index_in_face // nside

    # Adjust for the face number to map it to a 2D grid
    face_x = face_num % 4
    face_y = face_num // 4

    x += face_x * nside
    y += face_y * nside

    return x, y

def divide_image_into_tiles(img, order=3):
    """
    Divide an image into tiles for the specified HEALPix order.
    Returns a dictionary of pixel_index: tile_image
    """
    # For real HEALPix we would use more complex math, but for visualization:
    # At order n, we have 12 * 4^n pixels/tiles
    # For order 3, that's 12 * 4^3 = 12 * 64 = 768 tiles

    img_width, img_height = img.size
    npix = 12 * (4 ** order)
    grid_size = int(math.sqrt(npix))  # Approximate grid size

    tile_width = img_width // grid_size
    tile_height = img_height // grid_size

    tiles = {}

    # Create tiles
    for ipix in range(npix):
        x, y = healpix_to_xy(order, ipix)

        # Calculate pixel boundaries
        left = x * tile_width
        upper = y * tile_height
        right = left + tile_width
        lower = upper + tile_height

        # Handle edge cases
        if right > img_width:
            right = img_width
        if lower > img_height:
            lower = img_height

        # just a guess at the right solution based on error message
        if right < left:
            left, right = right, left
        if lower < upper:
            upper, lower = lower, upper

        # Extract the tile
        tile = img.crop((left, upper, right, lower))
        # Resize to ensure consistent size
        tile = tile.resize((512, 512), Image.LANCZOS)

        tiles[ipix] = tile

    return tiles

def create_hips_structure(output_dir, max_order, img):
    """
    Create the HiPS directory structure with tiles up to max_order.
    """
    print(f"Creating HiPS structure with orders 0 to {max_order}...")

    # For each order
    for order in range(max_order + 1):
        print(f"Processing order {order}...")
        # Calculate number of pixels at this order
        npix = 12 * (4 ** order)

        # Create directory structure
        for ipix in range(npix):
            # Calculate directory for this pixel
            dir_idx = ipix // 10000
            dir_path = os.path.join(output_dir, f"Norder{order}", f"Dir{dir_idx}")
            os.makedirs(dir_path, exist_ok=True)

        # For order 0, we just have Allsky.jpg and 12 base pixels
        if order == 0:
            # Copy Allsky.jpg to the order directory
            order_allsky = os.path.join(output_dir, f"Norder{order}", "Allsky.jpg")
            shutil.copy(img, order_allsky)

            # Generate the 12 base tiles
            # For simplicity, we'll divide the image into 12 parts
            pil_img = Image.open(img)
            tiles = divide_image_into_tiles(pil_img, order=0)

            for ipix, tile in tiles.items():
                tile_path = os.path.join(output_dir, f"Norder{order}", f"Dir0", f"Npix{ipix}.jpg")
                tile.save(tile_path, quality=90)
        else:
            # For higher orders, generate tiles by dividing the source image
            pil_img = Image.open(img)
            # Resize to a larger size for higher quality tiles
            width, height = pil_img.size
            scale_factor = 2 ** order
            resized_img = pil_img.resize((width * scale_factor // 4, height * scale_factor // 4), Image.LANCZOS)

            tiles = divide_image_into_tiles(resized_img, order=order)

            for ipix, tile in tiles.items():
                dir_idx = ipix // 10000
                tile_path = os.path.join(output_dir, f"Norder{order}", f"Dir{dir_idx}", f"Npix{ipix}.jpg")
                tile.save(tile_path, quality=90)

    print(f"Created HiPS structure with orders 0 to {max_order}")

def create_basic_hips_structure(output_dir, fits_file, title, coordsys="galactic", max_order=3):
    """
    Create a basic HiPS directory structure with the minimum necessary files.
    Now supports higher order tiles.
    """
    # Process the FITS file
    data, wcs, png_file, fits_file = process_fits_to_image(fits_file)

    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Get the current date and time
    current_date = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    # Create the basic HiPS structure
    os.makedirs(os.path.join(output_dir, "Norder0", "Dir0"), exist_ok=True)

    # Convert PNG to JPG for Allsky
    plt.figure(figsize=(10, 10), dpi=300)
    img = plt.imread(png_file)
    plt.imshow(img)
    plt.axis('off')
    allsky_path = os.path.join(output_dir, "Allsky.jpg")
    plt.savefig(allsky_path, format='jpg', dpi=300, bbox_inches='tight')
    plt.close()

    # Make sure the Allsky.jpg file exists
    if not os.path.exists(allsky_path):
        print(f"Error: Failed to create Allsky.jpg at {allsky_path}")
        return None

    # Also create the Norder0 Allsky.jpg
    norder0_allsky = os.path.join(output_dir, "Norder0", "Allsky.jpg")
    shutil.copy(allsky_path, norder0_allsky)

    # Create tile files for order 0
    for npix in range(12):
        npix_file = os.path.join(output_dir, "Norder0", "Dir0", f"Npix{npix}.jpg")
        shutil.copy(allsky_path, npix_file)
        print(f"Created tile Norder0/Dir0/Npix{npix}.jpg")

    # Create the HiPS structure with tiles
    create_hips_structure(output_dir, max_order, allsky_path)

    # Create a properties file for the HiPS dataset
    properties = f"""creator_did=urn:ACES:{title.replace(' ', '_')}
obs_collection=ACES
obs_title={title}
hips_version=1.4
hips_release_date={current_date}
hips_status=public master clonableOnce
hips_order={max_order}
hips_frame={coordsys}
dataproduct_type=image
hips_tile_format=jpg
client_category=Image/Radio
client_sort_key=04-03-01
"""

    with open(os.path.join(output_dir, "properties"), 'w') as f:
        f.write(properties)

    print(f"HiPS structure created in: {output_dir}")
    return output_dir

def create_hpxfinder_structure(hips_dir, title, max_order):
    """
    Create the HpxFinder directory structure with metadata files.
    """
    print(f"Creating HpxFinder directory structure...")

    # Create HpxFinder directory
    hpxfinder_dir = os.path.join(hips_dir, "HpxFinder")
    os.makedirs(hpxfinder_dir, exist_ok=True)

    # Create properties file for HpxFinder
    creator_did = f"ivo://UNK.AUTH/P/{title.replace(' ', '')}/meta"
    properties_content = f"""creator_did          = {creator_did}
obs_title            = {title}-meta
dataproduct_type     = meta
hips_frame           = equatorial
hips_order           = {max_order}
hips_tile_width      = 512
hips_release_date    = {datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")}
hips_version         = 1.4
hips_builder         = Aladin/HipsGen v12.119
"""

    with open(os.path.join(hpxfinder_dir, "properties"), 'w') as f:
        f.write(properties_content)

    # Create metadata.xml file
    metadata_content = """<?xml version="1.0" encoding="UTF-8"?>

<!-- VOTable HiPS hpxfinder mapping file.
     Use to map and build from a HpxFinder JSON tile a classical VOTable HiPS tile.
     Adapt it according to your own (see examples below in the comments)
-->

<VOTABLE version="1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns="http://www.ivoa.net/xml/VOTable/v1.2"
  xsi:schemaLocation="http://www.ivoa.net/xml/VOTable/v1.2 http://www.ivoa.net/xml/VOTable/v1.2">

<RESOURCE>
  <COOSYS ID="J2000" system="eq_FK5" equinox="J2000"/>
  <TABLE name="{0} details">
    <FIELD name="RAJ2000" ucd="pos.eq.ra" ref="J2000" datatype="double" precision="5" unit="deg">
      <DESCRIPTION>Right ascension</DESCRIPTION>
    </FIELD>
    <FIELD name="DEJ2000" ucd="pos.eq.dec" ref="J2000" datatype="double" precision="5" unit="deg">
      <DESCRIPTION>Declination</DESCRIPTION>
    </FIELD>
    <FIELD name="id" ucd="meta.id;meta.dataset" datatype="char" arraysize="13*">
      <DESCRIPTION>Dataset name, uniquely identifies the data for a given exposure.</DESCRIPTION>
    </FIELD>
    <FIELD name="access" datatype="char" arraysize="9*">
      <DESCRIPTION>Display original image</DESCRIPTION>
       <LINK content-type="image/fits" href="${{access}}"/>
    </FIELD>
    <FIELD name="FoV" datatype="char" utype="stc:ObservationLocation.AstroCoordArea.Region" arraysize="12*">
       <DESCRIPTION>Field of View (STC description)</DESCRIPTION>
    </FIELD>
   <FIELD name="MJDREF" datatype="double">
      <DESCRIPTION>[d] MJD of fiducial time</DESCRIPTION>
   </FIELD>
<DATA>
   <TABLEDATA>
      <TR>
      <TD>$[ra]</TD>
      <TD>$[dec]</TD>
      <TD>$[name]</TD>
      <TD>$[path:([^\\[]*).*]</TD>
      <TD>$[stc]</TD>
      <TD>$[MJDREF]</TD>
      </TR>
   </TABLEDATA>
</DATA>
</TABLE>
</RESOURCE>
</VOTABLE>
""".format(title)

    with open(os.path.join(hpxfinder_dir, "metadata.xml"), 'w') as f:
        f.write(metadata_content)

    # Create Norder directories for HpxFinder
    for order in range(3, max_order + 1):
        order_dir = os.path.join(hpxfinder_dir, f"Norder{order}")
        os.makedirs(order_dir, exist_ok=True)

    print(f"HpxFinder directory structure created in {hpxfinder_dir}")

def create_index_html(hips_dir, title):
    """
    Create the index.html file for the HIPS directory.
    """
    print(f"Creating index.html file...")

    index_content = """<!DOCTYPE html>

<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, height=device-height, initial-scale=1.0, user-scalable=no">

  <script type="text/javascript">
const cEl = function(a) {{return document.createElement(a)}};
const cTn = function(a) {{return document.createTextNode(a)}};

// Show more javascript code
var ShowMore = function () {{ "use strict"; var e = function (e, t) {{ var n = e.rows, r = e.children, a = "table" === t ? n : r, i = [].slice.call(a).filter((function (e) {{ return e.classList.contains("hidden") }})).length; return 0 !== i ? " " + i : "" }}, t = function (e, t) {{ return void 0 === t && (t = !1), e.classList[t ? "add" : "remove"]("hidden") }}, n = function (e, t) {{ for (var n in t) e.setAttribute(n, t[n]) }}, r = function (e) {{ return cEl(e) }}, a = {{ newLine: {{ match: /(\\r\\n|\\n|\\r)/gm, replace: "" }}, space: {{ match: /\\s\\s+/gm, replace: " " }}, br: {{ match: /<br\\s*\\/?>/gim, replace: "" }}, html: {{ match: /(<((?!b|\\/b|!strong|\\/strong)[^>]+)>)/gi, replace: "" }} }}, i = {{ typeElement: "span", more: !1, less: !1, number: !1, nobutton: !1, after: 0, btnClass: "show-more-btn", btnClassAppend: null }}; return function (o, f) {{ var l = this, s = void 0 === f ? {{}} : f, c = s.onMoreLess, u = void 0 === c ? function () {{ }} : c, d = s.regex, v = void 0 === d ? {{}} : d, b = s.config; this.t = function () {{ var e = l.i, a = e.element, i = e.after, o = e.ellipsis, f = e.nobutton, s = e.limit, c = e.type; n(a, {{ "aria-expanded": "false" }}); var u = s + i, d = !1 === o ? "" : "..."; if ("text" === c) {{ var v = a.innerHTML.trim(); if (a.textContent.trim().length > u) {{ var b = v; for (var p in l.o) {{ var h = l.o[p], m = h.match, x = h.replace; p && m && (b = b.replace(m, x)) }} var g = function (e, t) {{ var n = r("div"); return n.insertAdjacentHTML("afterbegin", e), function e(t, n) {{ var r = t.firstChild; do {{ 3 === r.nodeType ? n(r) : 1 === r.nodeType && r.childNodes && r.childNodes[0] && e(r, n) }} while (r = r.nextSibling) }}(n, (function (e) {{ if (t > 0) {{ var n = e.data.length; (t -= n) <= 0 && (e.data = e.substringData(0, e.data.length + t)) }} else e.data = "" }})), n.innerHTML }}(b, s - 1).concat(d); if (a.textContent = "", a.insertAdjacentHTML("beforeend", g), l.l(a, Object.assign({{}}, l.i, {{ originalText: v, truncatedText: g }})), f) return; l.s(l.i) }} }} if ("list" === c || "table" === c) {{ var w = l.u(a, c); if (w.length > u) {{ for (var O = s; O < w.length; O++)t(w[O], !0); if (f || l.s(l.i), l.l("list" === c ? a : a.nextElementSibling, l.i), f) return }} }} }}, this.l = function (e, t) {{ return e.addEventListener("click", l.v.bind(l, t)) }}, this.p = function (t) {{ var a = t.element, i = t.number, o = t.less, f = t.more, s = t.type, c = t.btnClass, u = t.btnClassAppend, d = l.h ? o || "" : f || "", v = l.h ? "collapse" : "expand", b = !!l.h, p = r("button"); return p.className = null == u ? c : c + " " + u, n(p, {{ "aria-expanded": b, "aria-label": v, tabindex: 0 }}), p.insertAdjacentHTML("beforeend", i ? d + e(a, s) : d), p }}, this.v = function (e, n) {{ var a = n.target, i = e.element, o = e.type, f = e.limit, s = e.less, c = e.typeElement, u = e.originalText, d = e.truncatedText, v = e.btnClass, b = a.classList.contains(v); if (b) {{ var p = i.getAttribute("aria-expanded"); if (l.h = "false" === p, "text" === o && b && (i.textContent = "", i.insertAdjacentHTML("beforeend", l.h ? u : d), s)) {{ var h = r(c); h.classList.add("show-more-wrapper"), h.insertAdjacentElement("beforeend", l.p(e)), i.appendChild(h) }} if ("list" === o || "table" === o) for (var m = l.u(i, o), x = 0; x < m.length; x++) {{ var g = "list" === o ? x >= f && x < m.length - 1 : x >= f; "false" === p ? t(m[x]) : g && t(m[x], !0) }} o && l.m(Object.assign({{}}, e, {{ target: a }})) }} }}, this.u = function (e, t) {{ return "list" === t ? [].slice.call(e.children) : e.rows }}, this.s = function (e) {{ var t = e.type, n = e.element, a = e.more, i = e.typeElement; if (a) if ("table" === t) n.insertAdjacentElement("afterend", l.p(e)); else {{ var o = r(i); o.classList.add("show-more-wrapper"), o.appendChild(l.p(e)), n.appendChild(o) }} }}, this.m = function (t) {{ var r = t.element, a = t.type, i = t.less, o = t.more, f = t.number, s = t.target, c = l.h ? i : o, u = l.h ? "expand" : "collapse", d = "table" === a ? a : "the " + a, v = r.lastElementChild; n(r, {{ "aria-expanded": l.h }}), n(s, {{ "aria-expanded": l.h, "aria-label": u + " " + d }}), l.g(u, t), c ? s.innerHTML = f ? c + e(r, a) : c : "table" === a ? s.parentNode.removeChild(s) : "list" === a && v.parentNode.removeChild(v) }}; var p = [].slice.call(document.querySelectorAll(o)); this.g = u, this.o = Object.assign({{}}, a, v), p.map((function (e, t) {{ var n = JSON.parse(e.getAttribute("data-config")), r = b, a = Object.assign({{}}, r, n); l.i = Object.assign({{ index: t, classArray: e.classList }}, i, a, {{ typeElement: a.element || "span", element: e }}), l.t() }})) }} }}();
  </script>

  <style>
    html, body {{
      margin: 0;
      padding: 0;
      width: 100%;
    }}

    body {{
      background-color: #232323;
    }}

    html {{
      font-family: sans-serif;
      line-height: 1.15;
    }}

    [type="checkbox"] {{
      vertical-align: text-bottom;
    }}

    a {{
      text-decoration: none;
      color: #47a4eb;
    }}

    h1 {{
      font-size: 2rem;
      font-weight: 400;
      color: #eeeeee;
      text-align: center;
    }}

    h2 {{
      font-size: 1.4rem;
      overflow-wrap: anywhere;
      padding-left: 4rem;
      padding-right: 1rem;
      color: #eeeeee;
      text-align: center;
    }}

    h3 {{
      background-color: #232323;
      color: #eeeeee;
      margin: 0;
      padding: 0.6rem;
    }}

    .dataAccess {{
      background-color: #eee;
      padding: 1rem;
    }}

    .doiDisplay {{
      background-color: #eee;
      padding: 1rem;
    }}

    .box_h {{
      display: flex;
      flex-direction: column;
    }}

    .box_v {{
      display: flex;
      flex-direction: row;
    }}
  </style>
</head>

<body class="box_h">
  <h1>{0}</h1>

  <div class="box_v" style="flex: 1;">
    <div id="aladin-lite-div" style="width:100%;height:100%;"></div>
  </div>

  <script type="module">
    import Aladin from "./aladin.js";

    let aladin = A.aladin('#aladin-lite-div', {{
      showReticle: false,
      showZoomControl: true,
      showFullscreenControl: true,
      showLayersControl: true,
      showGotoControl: true,
      showShareControl: true,
      showMeasureDistanceControl: true,
      showSimbadPointerControl: true,
      cooFrame: "J2000",
      survey: "P/{0}",
      fov: 1.5,
      target: "266.51465 -28.8341",
    }});
  </script>
</body>
</html>
""".format(title)

    with open(os.path.join(hips_dir, "index.html"), 'w') as f:
        f.write(index_content)

    print(f"index.html created in {hips_dir}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python fits_to_hips.py <fits_file> [output_directory] [title] [max_order]")
        sys.exit(1)

    fits_file = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "hips_output"
    title = sys.argv[3] if len(sys.argv) > 3 else "ACES Continuum"
    max_order = int(sys.argv[4]) if len(sys.argv) > 4 else 3  # Default to order 3

    print(f"Processing {fits_file}...")
    print(f"Output directory: {output_dir}")
    print(f"Maximum HiPS order: {max_order}")

    # Create HiPS from FITS
    hips_dir = create_basic_hips_structure(output_dir, fits_file, title, max_order=max_order)

    # Create HpxFinder and index.html
    create_hpxfinder_structure(hips_dir, title, max_order)
    create_index_html(hips_dir, title)

    print(f"HiPS generation complete. Files are in: {hips_dir}")
    print("You can now use this HiPS directory in your Aladin Lite tour.")

if __name__ == "__main__":
    main()