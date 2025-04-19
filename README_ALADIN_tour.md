# Aladin Lite Tour for FITS Data

This package provides tools to create an interactive Aladin Lite tour from your FITS data files by converting them to HiPS (Hierarchical Progressive Survey) format.

## Prerequisites

- Python 3.6+
- Required Python packages:
  - numpy
  - astropy
  - matplotlib
- A modern web browser (Chrome, Firefox, Safari, Edge)

## Setup

1. Clone this repository or download the files:
   - `fits_to_hips.py` - Python script to convert FITS to HiPS format
   - `aladin_lite_tour.html` - HTML file for the interactive tour
   - `create_aladin_tour.sh` - Shell script to automate the conversion and setup

2. Make the shell script executable:
   ```
   chmod +x create_aladin_tour.sh
   ```

## Usage

### Automated Setup with Shell Script

1. Run the shell script with your FITS file:
   ```
   ./create_aladin_tour.sh your_fits_file.fits [output_directory] [title]
   ```

   For example:
   ```
   ./create_aladin_tour.sh 12m_continuum_commonbeam_circular_mosaic.fits hips_output "ACES Continuum"
   ```

2. Open `aladin_lite_tour.html` in your web browser

### Manual Setup

If you prefer to run the steps manually:

1. Convert your FITS file to HiPS format:
   ```
   python fits_to_hips.py your_fits_file.fits hips_output "Your Title"
   ```

2. Open `aladin_lite_tour.html` in your web browser

> **Note:** By default, the HTML viewer expects the HiPS data to be in a directory named `hips_output`. If you use a different output directory name, the script will create a symbolic link for you.

## Tour Controls

The tour interface includes:
- **Start Tour** button: Begins the automated tour through predefined waypoints
- **Reset View** button: Returns to the initial view
- **HiPS Source** dropdown: Choose between your local HiPS data or online astronomy surveys

## Troubleshooting

If you encounter issues:

1. **HiPS not loading**:
   - Check that the output directory structure is correct
   - Make sure the HiPS data is in the `hips_output` directory or a symbolic link exists
   - Check the browser console for specific error messages

2. **JavaScript errors**:
   - Try a different browser
   - Clear your browser cache
   - Check if there are any network issues (for external resources)

3. **Image quality issues**:
   - Adjust the FITS processing parameters in `fits_to_hips.py` to change scaling
   - Try different colormap settings

## Customization

- To change the waypoints of the tour, edit the `tourWaypoints` array in `aladin_lite_tour.html`
- To customize the colormap, modify the `create_custom_cmap()` function in `fits_to_hips.py`
- To adjust the HiPS generation parameters, modify the `create_basic_hips_structure()` function

## References

- [Aladin Lite Documentation](https://aladin.u-strasbg.fr/AladinLite/doc/)
- [HiPS Standard](https://www.ivoa.net/documents/HiPS/)
- [FITS Format](https://fits.gsfc.nasa.gov/fits_documentation.html) 