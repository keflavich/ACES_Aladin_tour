# ACES Aladin Tour - AI Coding Guidelines

## Project Overview
This project creates interactive astronomical "tours" using Aladin Lite v3, a JavaScript library for displaying astronomical images in HiPS (Hierarchical Progressive Survey) format. Tours include astronomical observations from JWST, ALMA, and other telescopes showcasing star formation in the Galactic Center and other regions.

## Architecture

### Core Components
- **HTML Tour Files** (`*_tour.html`): Individual tour pages, each loads specific waypoint JSON
- **tour-common.js**: Central JavaScript library (~1700 lines) containing all tour logic, layer management, URL routing, and animation controls
- **draggable.js**: Makes UI elements draggable without interfering with interactive controls
- **Waypoint JSON files** (`waypoints_*.json`): Define tour stops with RA/Dec, FOV, descriptions, image layers, timing parameters
- **HiPS directories** (`*_hips/`): Hierarchical Progressive Survey tiles generated from FITS/PNG images

### Data Flow
1. FITS/PNG images → `python_reproject_to_hips.py` or `fits_to_hips.py` → HiPS directory structure
2. Tour HTML loads `tour-common.js` and waypoint JSON
3. JavaScript animates between waypoints, loads image layers dynamically via Aladin Lite v3 API
4. URL anchors enable deep-linking to specific waypoints (e.g., `#cloud-c`)

### Key Design Patterns

**Layer Caching System** (`tour-common.js` lines 15-20):
- Layers cached in `Map()` to avoid reloading same HiPS URL
- `stickyUrls` Set tracks layers that persist across waypoints (`is_sticky: true`)
- Use `layerOrder` array to manage z-ordering

**Environment-Aware URL Resolution** (`tour-common.js` lines 36-60):
- Detects hostname (localhost, data.rc.ufl.edu, GitHub Pages, starformation.astro.ufl.edu)
- Auto-prefixes relative paths with appropriate root URL
- CDS HiPS paths (starting with "CDS/P/") used directly as identifiers

**Waypoint URL Anchors** (`tour-common.js` `titleToAnchor()` function):
- Converts waypoint titles to URL-safe anchors
- Enables shareable links via `#waypoint-name`
- Hash updated via `pushState()` without page reload

## Critical Workflows

### Creating a New Tour
1. Generate HiPS from images: `python python_reproject_to_hips.py` (batch processes multiple images)
2. For single FITS: `./create_aladin_tour.sh <file.fits> <output_dir> "<title>"`
3. Create waypoints JSON (see `waypoints_ACES_EarlyResults.json` for structure)
4. Copy existing tour HTML (e.g., `ACES_EarlyResults.html`), update waypoints file reference
5. Test locally: serve with `python serve_hips.py` (serves on port 8000)

### HiPS Generation Pipeline
- **From PNG with AVM metadata**: `python_reproject_to_hips.py` uses `reproject.hips.reproject_to_hips()`
- **From FITS**: `fits_to_hips.py` creates basic HiPS with custom grayscale-to-hot colormap
- **Enhance structure**: `create_complete_hips.py` adds missing tile directories for Aladin compatibility
- **Transparency**: `convert_black_to_transparent()` makes edge-connected black pixels transparent (preserves interior stars)

### Waypoint JSON Structure
```json
{
  "ra": 266.416667,           // decimal degrees
  "dec": -29.008333,
  "fov": 0.8,                 // field of view in degrees
  "transition_fov": 3.0,      // FOV to zoom out to during transition
  "transition_time": 3,       // seconds
  "zoom_out_time": 2,
  "zoom_in_time": 3,
  "title": "Waypoint Name",
  "description": "Markdown-enabled description",
  "url": "relative/path/to/hips/",  // or CDS identifier like "CDS/P/DSS2/color"
  "is_sticky": true,          // layer persists to next waypoint
  "fade_out_time": 1.5,       // fade timing for smooth transitions
  "pause_time": 6000,         // ms to pause before auto-advancing
  "wavelength_slider": {      // optional: enables wavelength slider for this waypoint
    "enabled": true,
    "wavelengths": [          // array of wavelength configurations
      {
        "wavelength": 140,    // wavelength value (used for slider positioning)
        "url": "path/to/hips/",
        "label": "F140M (1.40 μm)"
      }
    ]
  }
}
```

### Wavelength Slider Feature
A specialized UI component for smoothly fading between multiple wavelength images:
- **Purpose**: Show spectral evolution by sliding through wavelength-specific images
- **Files**: `wavelength-slider.js`, `wavelength-slider.css`
- **Activation**: Include waypoint JSON with `wavelength_slider` configuration (see above)
- **Functions**:
  - `initWavelengthSlider(wavelengthConfigs)`: Initialize with array of wavelength configs
  - `showWavelengthSlider()` / `hideWavelengthSlider()`: Control visibility
  - Automatically creates draggable slider UI at bottom of screen
- **Behavior**: Smoothly cross-fades between adjacent wavelength layers as slider moves
- **Example**: [w51_wavelength_tour.html](w51_wavelength_tour.html) shows W51-IRS2 from 1.4-4.8 μm

## Project-Specific Conventions

### Python Code Standards
- **Never use try/except for bugs**: Only catch known, well-understood errors (e.g., missing optional dependencies)
- **Minimize file creation**: Reuse/extend existing scripts rather than creating new ones
- **HiperGator environment**: Always use conda environments at `/blue/adamginsburg/adamginsburg/miniconda3/envs/python312` or `python313`, never system Python

### JavaScript Patterns
- Layer operations go through `tour-common.js` caching system
- UI controls placed in `#tour-controls` div (prev/next/play/reset/share buttons)
- Speed controls via `speedMultiplier` global (1x, 2x, 4x)
- Info panel collapse state tracked in `isInfoExpanded`

### HiPS Conventions
- Transparent PNG versions created with `_transparent` suffix
- AVM metadata preserved when converting to transparent: `pyavm.AVM.from_image()` → `avm.embed()`
- HiPS directories require `properties` file, `Allsky.jpg`, and `Norder*/Dir*/Npix*.jpg` tiles
- Order 3 minimum for Galactic Center coverage

## External Dependencies
- **Aladin Lite v3**: `https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js`
- **jQuery 3.6.0**: For DOM manipulation in older tour files
- **Python**: `astropy`, `reproject`, `pyavm`, `PIL`, `matplotlib`, `scipy`, `tqdm`
- **CDS HiPS surveys**: Accessed via `CDS/P/*` identifiers (e.g., `CDS/P/DSS2/color`, `CDS/P/JWST/EPO`)

## Common Pitfalls
- Forgetting to run `create_complete_hips_structure.py` after generating HiPS → tiles won't load
- Using absolute paths in waypoint URLs → breaks deployment (use relative paths or CDS identifiers)
- Modifying layer opacity without checking `is_sticky` → layers may fade unexpectedly
- Creating new tour HTML from scratch → always copy existing template to preserve all event handlers

## File Naming Patterns
- Tours: `<region>_tour.html` (e.g., `w51_tour.html`, `sgrb2_tour.html`)
- Waypoints: `waypoints_<region>.json`
- HiPS: `<image_name>_hips/` and `<image_name>_transparent_hips/` for transparent versions
- Scripts: `fix*.py` for AVM metadata corrections, `python_reproject_*.py` for batch processing


