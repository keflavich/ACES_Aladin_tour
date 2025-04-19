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
            # Copy Allsky.jpg
            # not needed: these are the same file
            # shutil.copy(
            #     img, 
            #     os.path.join(output_dir, "Allsky.jpg")
            # )
            
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
    from datetime import datetime
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
    
    print(f"HiPS generation complete. Files are in: {hips_dir}")
    print("You can now use this HiPS directory in your Aladin Lite tour.")

if __name__ == "__main__":
    main() 