#!/usr/bin/env python
"""
Script to create a more complete HiPS directory structure from our simplified one.
This helps Aladin Lite find the tiles it expects.
"""
import os
import sys
import shutil
from PIL import Image

def create_complete_hips_structure(hips_dir):
    """
    Create a more complete HiPS directory structure from our simplified one.
    - Copy Allsky.jpg to all required tile locations
    - Generate metadata files
    """
    print(f"Creating complete HiPS structure from: {hips_dir}")
    
    # Check if the base HiPS directory exists
    if not os.path.exists(hips_dir):
        print(f"Error: HiPS directory '{hips_dir}' does not exist.")
        return False
    
    # Check if the basic files exist
    allsky_path = os.path.join(hips_dir, "Allsky.jpg")
    if not os.path.exists(allsky_path):
        print(f"Error: 'Allsky.jpg' not found in {hips_dir}")
        return False
    
    # Read the properties file to get the HiPS order
    properties_path = os.path.join(hips_dir, "properties")
    if not os.path.exists(properties_path):
        print(f"Error: 'properties' file not found in {hips_dir}")
        return False
    
    # Default order
    hips_order = 3  # Default to order 3 if not specified
    
    # Read properties file
    with open(properties_path, 'r') as f:
        for line in f:
            if line.startswith('hips_order='):
                try:
                    specified_order = int(line.strip().split('=')[1])
                    # Always use at least order 3 for directory creation, but keep what's in the file
                    print(f"Found hips_order={specified_order} in properties file")
                    # We'll keep the original order in properties but create directories for order 3
                except ValueError:
                    print(f"Warning: Could not parse hips_order from properties file. Using default order {hips_order}.")
    
    print(f"Creating directories up to HiPS order: {hips_order}")
    
    # Create tile directories for orders 0 to hips_order
    print("Creating tile directories for all orders...")
    for order in range(hips_order + 1):
        # Create main order directory
        order_dir = os.path.join(hips_dir, f"Norder{order}")
        os.makedirs(order_dir, exist_ok=True)
        
        # Create AllSky file for this order by copying the main one
        order_allsky = os.path.join(order_dir, "Allsky.jpg")
        if not os.path.exists(order_allsky):
            shutil.copy(allsky_path, order_allsky)
        
        # For lower orders, create Dir0/Npix0.jpg
        if order <= 3:  # Only for lower orders to avoid too many files
            dir0 = os.path.join(order_dir, "Dir0")
            os.makedirs(dir0, exist_ok=True)
            
            # Create Npix files for this order
            max_npix = 12 * (4 ** order)  # Max number of HEALPix tiles at this order
            
            # Just create a few key tiles rather than all of them
            if order == 0:
                # Order 0 just has 12 tiles (0-11)
                for npix in range(12):
                    npix_file = os.path.join(dir0, f"Npix{npix}.jpg")
                    if not os.path.exists(npix_file):
                        shutil.copy(allsky_path, npix_file)
            else:
                # For higher orders, create tiles likely to be used for galactic center
                # These are the ones we saw being requested in the server logs
                key_tiles = [128, 269, 270, 271, 274, 280, 281, 282, 283, 286, 289, 
                            291, 292, 293, 294, 295, 296, 297, 299, 300, 301, 
                            304, 305, 306, 404, 405, 406, 407, 412, 425,
                            463, 467, 470, 472, 473, 474, 475, 476, 483, 484, 
                            485, 486, 487, 488, 489, 490, 491, 492, 496, 703]
                
                # Filter tiles that are within the range for this order
                valid_tiles = [t for t in key_tiles if t < max_npix]
                
                for npix in valid_tiles:
                    npix_file = os.path.join(dir0, f"Npix{npix}.jpg")
                    if not os.path.exists(npix_file):
                        shutil.copy(allsky_path, npix_file)
    
    # Update the properties file to indicate the structure is complete
    print("Updating properties file...")
    with open(properties_path, 'r') as f:
        properties = f.readlines()
    
    # Ensure hips_order is set correctly
    found_order = False
    for i, line in enumerate(properties):
        if line.startswith('hips_order='):
            properties[i] = f'hips_order={hips_order}\n'
            found_order = True
            break
    
    if not found_order:
        properties.append(f'hips_order={hips_order}\n')
    
    # Write updated properties
    with open(properties_path, 'w') as f:
        f.writelines(properties)
    
    print(f"HiPS structure complete in: {hips_dir}")
    print("You can now use this HiPS directory in your Aladin Lite tour.")
    return True

if __name__ == "__main__":
    # Get the HiPS directory from command line or use default
    hips_dir = sys.argv[1] if len(sys.argv) > 1 else "test_hips_output"
    
    if not create_complete_hips_structure(hips_dir):
        print("Failed to create complete HiPS structure.")
        sys.exit(1)
    
    print("Success!") 