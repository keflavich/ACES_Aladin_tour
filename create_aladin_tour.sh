#!/bin/bash

# This script automates the creation of an Aladin Lite tour from a FITS file

# Check for input FITS file
if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <fits_file> [output_directory] [title]"
    echo "Example: $0 12m_continuum_commonbeam_circular_mosaic.fits hips_output \"ACES Continuum\""
    exit 1
fi

FITS_FILE="$1"
OUTPUT_DIR="${2:-hips_output}"
TITLE="${3:-ACES Continuum}"

# Ensure the FITS file exists
if [ ! -f "$FITS_FILE" ]; then
    echo "Error: FITS file '$FITS_FILE' not found!"
    exit 1
fi

echo "=== Creating HiPS from FITS file ==="
echo "Input: $FITS_FILE"
echo "Output directory: $OUTPUT_DIR"
echo "Title: $TITLE"

# Convert FITS to HiPS
python fits_to_hips.py "$FITS_FILE" "$OUTPUT_DIR" "$TITLE"

# Check if the conversion was successful
if [ ! -d "$OUTPUT_DIR" ]; then
    echo "Error: HiPS creation failed! Output directory not created."
    exit 1
fi

# Create a more complete HiPS structure for Aladin Lite
echo "=== Enhancing HiPS structure for Aladin Lite ==="

# Ensure Norder0/Dir0 exists
mkdir -p "${OUTPUT_DIR}/Norder0/Dir0"

# Check if Allsky.jpg exists and copy it to correct locations if necessary
if [ -f "${OUTPUT_DIR}/Allsky.jpg" ]; then
    # Make sure Npix0.jpg exists
    if [ ! -f "${OUTPUT_DIR}/Norder0/Dir0/Npix0.jpg" ]; then
        echo "Copying Allsky.jpg to Norder0/Dir0/Npix0.jpg"
        cp "${OUTPUT_DIR}/Allsky.jpg" "${OUTPUT_DIR}/Norder0/Dir0/Npix0.jpg"
    fi
else
    echo "Warning: Allsky.jpg not found! HiPS may not display correctly."
fi

# Make sure properties file has the correct minimum content
if [ -f "${OUTPUT_DIR}/properties" ]; then
    echo "Checking properties file..."
    
    # Check and add essential properties if missing
    grep -q "hips_order" "${OUTPUT_DIR}/properties" || echo "hips_order=0" >> "${OUTPUT_DIR}/properties"
    grep -q "hips_frame" "${OUTPUT_DIR}/properties" || echo "hips_frame=galactic" >> "${OUTPUT_DIR}/properties"
    grep -q "hips_tile_format" "${OUTPUT_DIR}/properties" || echo "hips_tile_format=jpg" >> "${OUTPUT_DIR}/properties"
    
    echo "Properties file updated if needed."
else
    echo "Warning: properties file not found! Creating minimal version."
    cat > "${OUTPUT_DIR}/properties" << EOF
creator_did=urn:ACES:${TITLE//' '/_}
obs_collection=ACES
obs_title=${TITLE}
hips_version=1.4
hips_release_date=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
hips_status=public master clonableOnce
hips_order=0
hips_frame=galactic
dataproduct_type=image
hips_tile_format=jpg
client_category=Image/Radio
EOF
fi

# Create symbolic link for the Aladin Lite viewer to find the HiPS if not using default directory
if [ "$OUTPUT_DIR" != "hips_output" ]; then
    echo "Creating symbolic link from $OUTPUT_DIR to hips_output"
    ln -sf "$OUTPUT_DIR" hips_output
    echo "Symbolic link 'hips_output' created pointing to $OUTPUT_DIR"
fi

echo "=== Setup Complete ==="
echo "HiPS data created in: $OUTPUT_DIR"
echo ""

# Verify the HiPS structure
echo "=== Verifying HiPS Structure ==="
ESSENTIAL_FILES=(
    "properties"
    "Allsky.jpg"
    "Norder0/Dir0/Npix0.jpg"
)

MISSING=0
for file in "${ESSENTIAL_FILES[@]}"; do
    if [ ! -f "${OUTPUT_DIR}/$file" ]; then
        echo "❌ Missing essential file: $file"
        MISSING=$((MISSING + 1))
    else
        echo "✅ Found essential file: $file"
    fi
done

if [ $MISSING -gt 0 ]; then
    echo "Warning: $MISSING essential files are missing. HiPS may not display correctly."
else
    echo "All essential HiPS files are present."
fi

echo ""
echo "To view your Aladin Lite tour:"
echo "1. Open aladin_lite_tour.html in a web browser"
echo "2. Select 'Local HiPS (Generated)' from the dropdown if not already selected"
echo "3. Click 'Start Tour' to begin the tour"
echo ""
echo "If you experience any issues:"
echo "- Click the 'Debug' button in the interface to check the HiPS structure"
echo "- Check browser console for JavaScript errors"
echo "- Try refreshing the page after waiting for all resources to load"

# Make this script executable
chmod +x "$0" 