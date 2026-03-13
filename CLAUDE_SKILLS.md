# Aladin Lite Tour System — Claude Skills Reference

This document captures lessons learned building and debugging a multi-waypoint
astronomical image tour on top of Aladin Lite 3.8.1. It is intended to help
Claude (or any developer) work on this codebase without re-discovering the same
pitfalls.

---

## 1. Aladin Lite 3.8.1 — Setup and Critical Gotchas

### 1.1 Local bundle vs CDN

Always use a **locally downloaded** copy of `aladin.js` instead of the CDS CDN:

```html
<!-- CORRECT -->
<script src='aladin.js' charset='utf-8' defer></script>

<!-- AVOID — CDN may be blocked by ad-blockers, corporate proxies, etc. -->
<script src='https://aladin.cds.unistra.fr/AladinLite/api/v3/3.8.1/aladin.js'></script>
```

Download a fresh copy:
```bash
curl -o aladin.js \
  "https://aladin.cds.unistra.fr/AladinLite/api/v3/3.8.1/aladin.js"
```

### 1.2 CRITICAL: `defer` is required on the `aladin.js` script tag

Aladin Lite 3.8.1's bundle runs `A.init = (async () => { ... })()` as a
**synchronous IIFE at parse time**. If the `#aladin-lite-div` element does not
yet exist in the DOM, the IIFE fails internally with:

```
Uncaught TypeError: can't access property "addEventListener", A is null
```

and `A` is left undefined for all subsequent code.

**Fix:** add `defer` to the `<script>` tag. `defer` scripts execute after HTML
parsing completes (so the DOM exists) but before `DOMContentLoaded` fires (so
`A` is defined when `loadWaypoints` runs).

```html
<head>
  <!-- aladin.js can stay in <head> as long as defer is present -->
  <script src='aladin.js' charset='utf-8' defer></script>
  <script src='draggable.js' defer></script>
  <script src='tour-common.js' defer></script>
</head>
<body>
  <div id="aladin-lite-div"></div>
  ...
</body>
```

This was the underlying cause of all "A is not defined" / "ReferenceError: A
is not defined" errors seen throughout debugging.

**Note:** `min.html` worked without `defer` only because it places the
`<script>` tag *after* the `<div>` in a tag-soup file with no `<head>`.

### 1.3 `A.init` is a Promise (3.x API)

In Aladin Lite ≥ 3.x, `A.init` is an **already-running IIFE Promise**. Access
it with `.then()`:

```javascript
A.init.then(() => {
    aladin = A.aladin('#aladin-lite-div', {
        survey: 'P/DSS2/color',
        fov: 60,
        target: 'galactic center',
        cooFrame: 'GAL',
    });
}).catch(err => {
    console.error('Aladin init failed:', err);
});
```

Wrap in `try/catch` to handle the case where `aladin.js` failed to execute:

```javascript
try {
    A.init.then(() => { ... }).catch(err => { ... });
} catch (e) {
    // A itself is not defined — show user-facing error
    document.getElementById('loading-div').textContent =
        'Error: Aladin failed to initialize: ' + e;
}
```

### 1.4 `aladin.min.css` is a 404 at 3.8.1

The `aladin.min.css` file served from the CDS CDN returns HTTP 404 for 3.8.1.
The 3.8.1 bundle **injects its own CSS** internally. Remove any `<link>` tags
pointing to it.

### 1.5 `createImageSurvey` vs `A.imageHiPS`

`aladin.createImageSurvey(id, name, url)` is deprecated since 3.3.0 but still
present and working in 3.8.1. The documented replacement is `A.imageHiPS()`,
but `createImageSurvey` is more reliably supported for overlay layers and is
fine to continue using.

```javascript
// Still works in 3.8.1:
const layer = aladin.createImageSurvey(url, layerName, url);
aladin.setOverlayImageLayer(layer, layerName);
```

---

## 2. Minimum Working Example (MWE)

See `mwe_tour.html` for a self-contained example. Key structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Aladin Tour MWE</title>
    <!-- defer is REQUIRED — see Section 1.2 -->
    <script src='aladin.js' charset='utf-8' defer></script>
    <script src='draggable.js' defer></script>
    <script src='tour-common.js' defer></script>
    <style>
        #aladin-lite-div { width: 100vw; height: 100vh; }
        /* ... other styles ... */
    </style>
</head>
<body>
    <!-- The #aladin-lite-div MUST exist in the DOM before aladin.js executes -->
    <div id="aladin-lite-div"></div>
    <div id="loading-div">Loading…</div>

    <!-- DOM elements required by tour-common.js -->
    <div id="waypoint-info">
        <div id="waypoint-header">
            <button id="expand-btn">▶</button>
            <h3 id="waypoint-title"></h3>
        </div>
        <div id="waypoint-content">
            <p id="waypoint-description"></p>
        </div>
    </div>

    <div id="progress-container">
        <div id="progress-bar"><div id="progress"></div></div>
        <span id="current-waypoint">1/1</span>
    </div>

    <div id="countdown-timer" style="display:none">
        <span id="countdown-text">Next in: </span>
        <span id="countdown-value">5</span>
    </div>

    <div id="tour-controls">
        <button id="prev-btn" disabled>‹</button>
        <button id="next-btn" disabled>›</button>
        <button id="start-btn" disabled>▶</button>
        <button id="reset-btn">⟲</button>
        <button id="share-btn">🔗</button>
        <select id="waypoint-dropdown"><option value="">≫</option></select>
        <select id="speed-dropdown">
            <option value="1" selected>1×</option>
            <option value="2">2×</option>
            <option value="4">4×</option>
        </select>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function () {
            loadWaypoints('waypoints.json');
        });
    </script>
</body>
</html>
```

All element IDs listed above are referenced by `tour-common.js` and must be
present. Missing IDs throw at runtime and (because of the outer try/catch)
display the misleading "WebGL2 support" error.

---

## 3. Waypoint JSON Format

Waypoints are loaded from a JSON file with this structure:

```json
{
    "waypoints": [
        {
            "ra": 266.42,
            "dec": -29.01,
            "fov": 3.0,
            "transition_fov": 5.0,
            "title": "Overview",
            "description": "Wide-field overview of the region.",
            "url": "my_hips_directory/",
            "pause_time": 5000,
            "transition_time": 3,
            "zoom_out_time": 2,
            "zoom_in_time": 2
        },
        ...
    ]
}
```

### Required fields
| Field | Type | Description |
|-------|------|-------------|
| `ra` | number | Right ascension in decimal degrees |
| `dec` | number | Declination in decimal degrees |
| `fov` | number | Target field of view in degrees |
| `title` | string | Waypoint title (also used as URL hash anchor) |

### Optional fields
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | string | — | HiPS path or full URL for the overlay image layer |
| `description` | string | `""` | Descriptive text shown in the info panel |
| `transition_fov` | number | `fov` | FOV to zoom out to before panning (for distant waypoints) |
| `transition_time` | number (s) | `2` | Duration of the pan animation |
| `zoom_out_time` | number (s) | `2` | Duration of the zoom-out animation |
| `zoom_in_time` | number (s) | `2` | Duration of the zoom-in animation |
| `pause_time` | number (ms) | `5000` | How long to pause at the waypoint before advancing |
| `fade_in_time` | number (s) | `0.5` | Duration of the layer fade-in after pan/zoom completes |
| `fade_out_time` | number (s) | `1.5` | Duration of the layer fade-out (when `fade_enabled`) |
| `fade_delay` | number (s) | `0.5` | Pause between fade-out and fade-in (when `fade_enabled`) |
| `fade_enabled` | boolean | `false` | Whether to cross-fade between `url` and `fade_layer` |
| `fade_layer` | string | — | URL to show during the cross-fade |
| `is_sticky` | boolean | `false` | Layer persists into subsequent waypoints |

---

## 4. Layer Management System

`tour-common.js` caches all loaded HiPS layers in a `Map` to avoid re-fetching:

```javascript
let layerCache = new Map(); // url -> { layer, name, url, isJPG? }
let layerOrder = [];        // url order for z-ordering
let stickyUrls = new Set(); // urls that persist across waypoints
```

Key functions:

- **`getOrCreateLayer(url)`** — creates the layer if not cached, always returns
  the cache entry. New layers are added via `aladin.createImageSurvey` +
  `aladin.setOverlayImageLayer`.
- **`bringLayerToFront(url)`** — sets the layer opacity to 1.0 and re-inserts
  it as the topmost overlay.
- **`hideOtherLayers(visibleUrl, waypoint)`** — sets all cached layers except
  `visibleUrl` (and any sticky layers) to opacity 0.

### Layer flash bug and fix

When pre-loading a layer before pan/zoom, always set its opacity to `0.0`
immediately after creation:

```javascript
const cachedLayer = getOrCreateLayer(waypoints[index].url);
if (cachedLayer && cachedLayer.layer && !cachedLayer.isJPG) {
    cachedLayer.layer.setOpacity(0.0);   // ← prevent flash during pan/zoom
}
```

If this line is conditional (e.g. gated on a `hide_during_pan` waypoint field),
the layer will appear at full opacity throughout the pan/zoom and then snap to
0 before fading in — producing a visible flash at the end of each animation.
Both the "close waypoints" and "distant waypoints" code paths must hide the
layer unconditionally.

---

## 5. Animation Callbacks

Aladin Lite's animation methods (`animateToRaDec`, `zoomToFoV`) accept a
callback that fires when the animation completes. The tour sequences these:

```
zoomToFoV(transition_fov) → animateToRaDec(ra, dec) → zoomToFoV(fov) → fadeIn layer
```

`animateLayerOpacity(layer, start, end, duration, callback)` (defined in
`tour-common.js`) implements a smooth ramp over 30 steps with ease-in-out using:

```javascript
const easedProgress = progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
```

All callbacks check `interruptAnimation` at the top so navigating away from a
waypoint mid-animation stops cleanly.

---

## 6. URL-Configurable Parameters

The following can be set via URL query string:

| Parameter | Values | Effect |
|-----------|--------|--------|
| `?speed=N` | `1`, `2`, `4`, any positive float | Sets the global speed multiplier |
| `?autoplay=true` | `true`/`false` | Starts the tour playing on load |
| `?description=false` | `true`/`false` | Starts with the description panel collapsed |
| `#waypoint-title` | URL-encoded title | Jumps directly to a named waypoint on load |

The share button (🔗) copies the current URL (including hash) to the clipboard.

---

## 7. Environment / Root URL Detection

`tour-common.js` sets `rootUrl` based on `window.location.hostname` so that
relative HiPS paths resolve correctly in each deployment environment:

| Hostname | `rootUrl` |
|----------|-----------|
| `localhost` / `127.0.0.1` | `./` |
| `data.rc.ufl.edu` | `https://data.rc.ufl.edu/pub/adamginsburg/avm_images/` |
| `*.github.io` | `https://keflavich.github.io/avm_images/` |
| `az1-apacheint-prod02.server.ufl.edu` | `https://starformation.astro.ufl.edu/avm_images/` |
| (default) | `https://starformation.astro.ufl.edu/avm_images/` |

If a `url` in the waypoint JSON:
- starts with `http://` or `https://` → used as-is
- starts with `CDS/P/` → used as a HiPS identifier (no prefix added)
- otherwise → `rootUrl` is prepended

---

## 8. Debugging Checklist

When something is broken, check in this order:

1. **`A is not defined`** → `defer` missing on `aladin.js`, or `#aladin-lite-div`
   not in DOM when `aladin.js` executes.

2. **"WebGL2 support" error message** → This is a catch-all from the outer
   `try/catch` in `initializeTour`. Check the actual error text, which is now
   included in the displayed message. Any synchronous throw inside
   `initializeTour` (missing DOM element, undefined variable, etc.) shows
   this message.

3. **"Error loading tour waypoints"** → The `fetch()` of the JSON file failed.
   Check that the `.json` file exists and the HTTP server is running.

4. **Layer flash at end of pan/zoom** → The new layer's opacity is not being
   set to 0 before the animation starts. Ensure `getOrCreateLayer` result is
   immediately hidden in both the "close" and "distant" waypoint code paths
   (there are two separate `if (distance < 0.2)` branches in `goToWaypoint`).

5. **Images not loading / wrong URLs** → Check the `rootUrl` detection log
   line (printed to console on load) and verify the HiPS directories are
   accessible at that URL.

6. **Tour works locally but not on the remote server** → Add the new hostname
   to the `rootUrl` detection block in `tour-common.js`.
