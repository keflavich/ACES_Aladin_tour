/**
 * Layer Slider Component for Aladin Tours
 * Allows switching between all unique waypoint image layers
 * without moving the view.
 */

let layerSliderLayers = [];    // [{url, label, layer}]
let currentLayerSliderIndex = 0;
let isLayerSliderMinimized = false;

/**
 * Build the layer list from waypoints, deduplicating by URL.
 * Uses the waypoint title of the first waypoint that references each URL.
 */
function initLayerSlider(waypoints) {
    const seen = new Set();
    layerSliderLayers = [];

    waypoints.forEach(wp => {
        if (!wp.url || seen.has(wp.url)) return;
        seen.add(wp.url);
        layerSliderLayers.push({
            url: wp.url,
            label: getLayerDisplayName(wp.url),
            title: wp.title || getLayerDisplayName(wp.url),
            layer: null  // populated lazily via getOrCreateLayer
        });
    });

    console.log('Layer slider: found', layerSliderLayers.length, 'unique layers');
}

/**
 * Ensure every layer exists in the cache (pre-warm).
 * Called after aladin is ready.
 */
function preloadLayerSliderLayers() {
    layerSliderLayers.forEach(item => {
        const fullUrl = getImageUrl(item.url);
        const cached = getOrCreateLayer(fullUrl);
        if (cached && cached.layer) {
            item.layer = cached.layer;
            item.layer.setOpacity(0.0);
        }
    });

    // Show first layer at full opacity
    if (layerSliderLayers.length > 0 && layerSliderLayers[0].layer) {
        layerSliderLayers[0].layer.setOpacity(1.0);
    }
}

/**
 * Switch to a specific layer index, optionally with opacity blending.
 */
function onLayerSliderChange(value) {
    if (!layerSliderLayers.length) return;

    const sliderValue = parseFloat(value);
    const maxIndex = layerSliderLayers.length - 1;
    let lowerIndex = Math.max(0, Math.min(maxIndex, Math.floor(sliderValue)));
    let upperIndex = Math.max(0, Math.min(maxIndex, Math.ceil(sliderValue)));
    const isExact = Math.abs(sliderValue - Math.round(sliderValue)) < 0.05 || lowerIndex === upperIndex;

    if (isExact) {
        const exactIndex = Math.round(sliderValue);
        setAllLayerSliderOpacities(0);
        const item = layerSliderLayers[exactIndex];
        if (item.layer) item.layer.setOpacity(1.0);
        currentLayerSliderIndex = exactIndex;
        updateLayerSliderUI(true);
        updateLayerSliderStatus(item.title || item.label);
    } else {
        const position = sliderValue - lowerIndex;
        setAllLayerSliderOpacities(0);
        const lo = layerSliderLayers[lowerIndex];
        const hi = layerSliderLayers[upperIndex];
        if (lo.layer) lo.layer.setOpacity(1.0 - position);
        if (hi.layer) hi.layer.setOpacity(position);
        updateLayerSliderUI(false);
        updateLayerSliderStatus(`${lo.label} → ${hi.label}`);
    }
}

function setAllLayerSliderOpacities(opacity) {
    layerSliderLayers.forEach(item => {
        if (item.layer) item.layer.setOpacity(opacity);
    });
}

function updateLayerSliderUI(isExact) {
    const container = document.getElementById('layer-slider-container');
    if (!container) return;
    if (isExact) {
        container.classList.add('exact-wavelength');
        container.classList.remove('blended-wavelength');
    } else {
        container.classList.remove('exact-wavelength');
        container.classList.add('blended-wavelength');
    }
}

function updateLayerSliderStatus(text) {
    const el = document.getElementById('layer-slider-status-text');
    if (el) el.textContent = text;
}

/**
 * Build the slider HTML and inject into the placeholder.
 */
function createLayerSliderHTML() {
    if (!layerSliderLayers.length) return '';

    const maxIndex = layerSliderLayers.length - 1;

    let notchesHTML = '';
    layerSliderLayers.forEach((item, index) => {
        const pct = (index / maxIndex) * 100;
        notchesHTML += `
            <div class="wavelength-notch" style="bottom: ${pct}%;" data-index="${index}">
                <div class="wavelength-notch-marker"></div>
                <div class="wavelength-notch-label">${item.label}</div>
            </div>`;
    });

    return `
        <div id="layer-slider-container" class="wavelength-slider-container layer-slider-container" style="display:none;">
            <div class="wavelength-slider-header layer-slider-header">
                <span class="wavelength-slider-title">Layer Explorer</span>
                <button id="layer-slider-minimize-btn" class="layer-slider-minimize-btn" title="Minimize">−</button>
            </div>
            <div id="layer-slider-body" class="wavelength-slider-vertical-track">
                <div class="wavelength-notches">${notchesHTML}</div>
                <input type="range"
                       id="layer-slider-input"
                       class="wavelength-slider-vertical"
                       min="0"
                       max="${maxIndex}"
                       value="0"
                       step="0.01"
                       orient="vertical">
            </div>
            <div id="layer-slider-status" class="wavelength-status" style="display:none;">
                <span class="status-indicator"></span>
                <span class="status-text" id="layer-slider-status-text">Drag to switch layers</span>
            </div>
        </div>`;
}

function showLayerSlider() {
    const el = document.getElementById('layer-slider-container');
    if (el) el.style.display = 'block';
}

function hideLayerSlider() {
    const el = document.getElementById('layer-slider-container');
    if (el) el.style.display = 'none';
}

function initLayerSliderEventListeners() {
    const input = document.getElementById('layer-slider-input');
    if (input) {
        input.addEventListener('input', e => onLayerSliderChange(e.target.value));
    }

    const minBtn = document.getElementById('layer-slider-minimize-btn');
    if (minBtn) {
        minBtn.addEventListener('click', () => {
            isLayerSliderMinimized = !isLayerSliderMinimized;
            const body = document.getElementById('layer-slider-body');
            const status = document.getElementById('layer-slider-status');
            if (isLayerSliderMinimized) {
                if (body) body.style.display = 'none';
                if (status) status.style.display = 'none';
                minBtn.textContent = '+';
                minBtn.title = 'Expand';
            } else {
                if (body) body.style.display = '';
                if (status) status.style.display = '';
                minBtn.textContent = '−';
                minBtn.title = 'Minimize';
            }
        });
    }
}
