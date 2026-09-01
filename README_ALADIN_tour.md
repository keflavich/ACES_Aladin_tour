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

### Rebuilding a HiPS at the right resolution

`reproject_to_hips` chooses the tile order automatically, and for small,
finely-sampled images it can pick an order far coarser than the data — the
image then renders smeared over a degree of sky instead of a few arcminutes,
which looks like it has been pasted down in the wrong place.  `rebuild_hips.py`
derives the order from the image's own AVM pixel scale:

```bash
python rebuild_hips.py image_with_avm.jpg --check-only     # report scale + order
python rebuild_hips.py image_with_avm.jpg out_hips         # build at that order
```

The Gemini/GeMS Trapezium mosaic (0.02"/px, 2.9' x 3.7') had been built at order
7, i.e. 3.2"/px, roughly 128x too coarse; it is now
`Trapezium_GEMS_avm_o14_hips`.

## Running a tour as a screensaver

The tours support an unattended kiosk mode driven entirely by URL parameters:

```
https://data.rc.ufl.edu/pub/adamginsburg/ACES_Aladin_tour/research_group_tour.html?kiosk=true&random=true&speed=2
```

| Parameter | Effect |
|-----------|--------|
| `kiosk=true` | hides buttons, progress bar and countdown, and forces autoplay |
| `random=true` | opens on a random waypoint, so a loop is not identical every time |
| `speed=1\|2\|4` | pace multiplier |
| `description=false` | also collapse the text panel (image only) |
| `autoplay=true` | autoplay without hiding the controls |

The tour loops forever on its own, so nothing else is needed to keep it running.

### Windows

`screensaver/windows/` contains a WebView2-based screensaver.  A `.scr` file is
just an executable with a different extension, invoked by Windows as `/s`
(show), `/p <hwnd>` (preview) and `/c` (configure); `AladinTourSaver` implements
all three.  On a multi-monitor machine it fills every screen and shows the text
panel only on the primary one.

```powershell
cd screensaver\windows
dotnet publish -c Release
copy bin\Release\net8.0-windows\win-x64\publish\AladinTourSaver.exe AladinTourSaver.scr
```

Right-click the `.scr` and choose Install, or copy it to `C:\Windows\`.  The
tour URL is set through the screensaver Settings button and stored under
`HKCU\Software\AladinTourSaver`.  WebView2 ships with Windows 10/11; on older
builds install the Evergreen runtime.  Any key press, mouse click or real mouse
movement exits, and the first second of input is ignored so the saver does not
close the instant it starts.

### macOS

macOS has no HTML screensaver slot, so use
[WebViewScreenSaver](https://github.com/liquidx/webviewscreensaver): install the
`.saver` bundle into `~/Library/Screen Savers/`, add the kiosk URL above, then
pick it in System Settings -> Screen Saver.  Recent macOS releases are strict
about unsigned bundles, so expect a Gatekeeper prompt on first use.

### Offline machines (either platform)

Both routes above stream HiPS tiles from the network and degrade to a blank sky
without it.  For booth machines and travelling laptops, pre-render the tour:

```bash
pip install playwright && playwright install chromium
python screensaver/capture_tour.py --seconds 420 --size 3840x2160 --out tour_4k.mp4
```

`capture_tour.py` drives headless Chromium at the tour's own pace, screenshots
each frame and encodes with `ffmpeg` (required on PATH).  Play the result with
[Aerial](https://github.com/JohnCoates/Aerial) on macOS, or any video
screensaver on Windows.

Rule of thumb: live page for displays on a reliable network, since they pick up
tour edits with no redeploy; pre-rendered video for anything that travels.

## References

- [Aladin Lite Documentation](https://aladin.u-strasbg.fr/AladinLite/doc/)
- [HiPS Standard](https://www.ivoa.net/documents/HiPS/)
- [FITS Format](https://fits.gsfc.nasa.gov/fits_documentation.html) 