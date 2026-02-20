/**
 * Wavelength Slider Component for Aladin Tours
 * Allows smooth fading between multiple wavelength images
 */

// Global variables for wavelength slider
let wavelengthSlider = null;
let wavelengthLayers = []; // Array of {wavelength: number, url: string, layer: object}
let currentWavelengthIndex = 0;
let isWavelengthSliderVisible = false;

/**
 * Initialize the wavelength slider with a set of wavelength-based images
 * @param {Array} wavelengthConfigs - Array of {wavelength: number, url: string, label: string}
 */
function initWavelengthSlider(wavelengthConfigs) {
    if (!wavelengthConfigs || wavelengthConfigs.length === 0) {
        console.warn('No wavelength configurations provided');
        return;
    }

    // Sort by wavelength
    wavelengthConfigs.sort((a, b) => a.wavelength - b.wavelength);
    
    // Store configurations
    wavelengthLayers = wavelengthConfigs.map(config => ({
        wavelength: config.wavelength,
        url: config.url,
        label: config.label || `${config.wavelength} nm`,
        description: config.description || '',
        layer: null // Will be populated when layers are loaded
    }));

    console.log('Initialized wavelength slider with', wavelengthLayers.length, 'wavelength layers');
    
    // Load all layers but set them to invisible initially
    loadWavelengthLayers();
}

/**
 * Load all wavelength layers into Aladin
 */
function loadWavelengthLayers() {
    if (!aladin) {
        console.error('Aladin not initialized - cannot load wavelength layers');
        return;
    }
    
    console.log('Loading', wavelengthLayers.length, 'wavelength layers into Aladin...');

    wavelengthLayers.forEach((wavelengthData, index) => {
        const fullUrl = getImageUrl(wavelengthData.url);
        
        // Check if this layer is already in the cache
        if (layerCache.has(fullUrl)) {
            wavelengthData.layer = layerCache.get(fullUrl);
            console.log(`Using cached layer for ${wavelengthData.label}`);
        } else {
            // Create new layer
            try {
                // Use Aladin Lite v3 API: newImageSurvey + setOverlayImageLayer
                const layer = aladin.newImageSurvey(fullUrl);
                const layerName = `wavelength_${index}_${wavelengthData.wavelength}`;
                
                // Add to Aladin as overlay layer
                aladin.setOverlayImageLayer(layer, layerName);
                
                // Set invisible initially
                layer.setOpacity(0.0);
                
                // Store in cache and wavelength data
                layerCache.set(fullUrl, layer);
                wavelengthData.layer = layer;
                
                console.log(`Loaded wavelength layer: ${wavelengthData.label} (${fullUrl})`);
            } catch (error) {
                console.error(`Failed to load wavelength layer ${wavelengthData.label}:`, error);
            }
        }
    });

    // Make the first wavelength visible
    if (wavelengthLayers.length > 0 && wavelengthLayers[0].layer) {
        wavelengthLayers[0].layer.setOpacity(1.0);
        currentWavelengthIndex = 0;
        updateWavelengthSliderUI();
    }
}

/**
 * Show the wavelength slider UI
 */
function showWavelengthSlider() {
    const sliderContainer = document.getElementById('wavelength-slider-container');
    if (sliderContainer) {
        sliderContainer.style.display = 'block';
        isWavelengthSliderVisible = true;
    }
}

/**
 * Hide the wavelength slider UI
 */
function hideWavelengthSlider() {
    const sliderContainer = document.getElementById('wavelength-slider-container');
    if (sliderContainer) {
        sliderContainer.style.display = 'none';
        isWavelengthSliderVisible = false;
    }
    
    // Optionally fade out all wavelength layers
    wavelengthLayers.forEach(wavelengthData => {
        if (wavelengthData.layer) {
            wavelengthData.layer.setOpacity(0.0);
        }
    });
}

/**
 * Handle wavelength slider change
 */
function onWavelengthSliderChange(value) {
    if (!wavelengthLayers || wavelengthLayers.length === 0) {
        console.error('Wavelength layers not initialized');
        return;
    }
    
    const sliderValue = parseFloat(value);
    
    // Find which wavelength indices we're between
    let lowerIndex = 0;
    let upperIndex = wavelengthLayers.length - 1;
    let isExactMatch = false;
    
    // Check for exact match first
    for (let i = 0; i < wavelengthLayers.length; i++) {
        if (Math.abs(sliderValue - wavelengthLayers[i].wavelength) < 0.5) {
            // Exact match - show only this wavelength
            setAllWavelengthOpacities(0);
            if (wavelengthLayers[i].layer) {
                wavelengthLayers[i].layer.setOpacity(1.0);
            }
            currentWavelengthIndex = i;
            isExactMatch = true;
            updateWavelengthDescription(i);
            break;
        }
    }
    
    if (!isExactMatch) {
        // Find which two wavelengths we're between for blending
        for (let i = 0; i < wavelengthLayers.length - 1; i++) {
            if (sliderValue >= wavelengthLayers[i].wavelength && 
                sliderValue <= wavelengthLayers[i + 1].wavelength) {
                lowerIndex = i;
                upperIndex = i + 1;
                break;
            }
        }
        
        // Check that layers exist
        if (!wavelengthLayers[lowerIndex] || !wavelengthLayers[lowerIndex].layer) {
            console.error(`Layer at index ${lowerIndex} is not initialized`);
            return;
        }
        if (!wavelengthLayers[upperIndex] || !wavelengthLayers[upperIndex].layer) {
            console.error(`Layer at index ${upperIndex} is not initialized`);
            return;
        }
        
        // Interpolate between two wavelengths
        const lowerWavelength = wavelengthLayers[lowerIndex].wavelength;
        const upperWavelength = wavelengthLayers[upperIndex].wavelength;
        const range = upperWavelength - lowerWavelength;
        const position = (sliderValue - lowerWavelength) / range;
        
        // Set opacities: fade from lower to upper
        setAllWavelengthOpacities(0);
        wavelengthLayers[lowerIndex].layer.setOpacity(1.0 - position);
        wavelengthLayers[upperIndex].layer.setOpacity(position);
        
        // Show blended description
        updateWavelengthDescription(lowerIndex, upperIndex, position);
    }
    
    // Update visual indicator
    updateWavelengthSliderUI(isExactMatch);
}

/**
 * Update the waypoint description with wavelength-specific text
 */
function updateWavelengthDescription(lowerIndex, upperIndex, blendPosition) {
    const descriptionElement = document.getElementById('waypoint-description');
    if (!descriptionElement) return;
    
    if (upperIndex === undefined) {
        // Single wavelength
        if (wavelengthLayers[lowerIndex].description) {
            descriptionElement.textContent = wavelengthLayers[lowerIndex].description;
        }
    } else {
        // Blended view
        descriptionElement.textContent = `Blending between wavelength ranges: transitioning from ${wavelengthLayers[lowerIndex].label.replace('RGB: ', '')} to ${wavelengthLayers[upperIndex].label.replace('RGB: ', '')}.`;
    }
}

/**
 * Set all wavelength layer opacities
 */
function setAllWavelengthOpacities(opacity) {
    wavelengthLayers.forEach(wavelengthData => {
        if (wavelengthData.layer) {
            wavelengthData.layer.setOpacity(opacity);
        }
    });
}

/**
 * Update the wavelength slider UI display
 */
function updateWavelengthSliderUI(isExactMatch) {
    const slider = document.getElementById('wavelength-slider');
    const container = document.getElementById('wavelength-slider-container');
    
    if (!slider || !container) return;
    
    // Add visual feedback for exact match
    if (isExactMatch) {
        container.classList.add('exact-wavelength');
        container.classList.remove('blended-wavelength');
    } else {
        container.classList.remove('exact-wavelength');
        container.classList.add('blended-wavelength');
    }
}

/**
 * Format RGB label with color-coded wavelengths
 * Converts "RGB: 1.82μm / 1.62μm / 1.40μm" to color-coded HTML
 */
function formatRGBLabel(label) {
    if (!label || !label.includes('RGB:')) {
        return label;
    }
    
    // Extract the three wavelengths
    const parts = label.split(':')[1].trim().split('/');
    if (parts.length === 3) {
        return `<span style="color: #ff8888;">${parts[0].trim()}</span> / <span style="color: #88ff88;">${parts[1].trim()}</span> / <span style="color: #aaaaff;">${parts[2].trim()}</span>`;
    }
    
    return label;
}

/**
 * Create the wavelength slider HTML
 * Returns the HTML string for the slider container
 */
function createWavelengthSliderHTML() {
    if (wavelengthLayers.length === 0) {
        return '';
    }
    
    const minWavelength = wavelengthLayers[0].wavelength;
    const maxWavelength = wavelengthLayers[wavelengthLayers.length - 1].wavelength;
    
    // Create wavelength labels for each notch
    let wavelengthLabelsHTML = '';
    wavelengthLayers.forEach((layer, index) => {
        const position = ((layer.wavelength - minWavelength) / (maxWavelength - minWavelength)) * 100;
        const formattedLabel = formatRGBLabel(layer.label);
        wavelengthLabelsHTML += `
            <div class="wavelength-notch" style="bottom: ${position}%;" data-wavelength="${layer.wavelength}">
                <div class="wavelength-notch-marker"></div>
                <div class="wavelength-notch-label">${formattedLabel}</div>
            </div>
        `;
    });
    
    return `
        <div id="wavelength-slider-container" class="wavelength-slider-container" style="display: none;">
            <div class="wavelength-slider-header">
                <span class="wavelength-slider-title">Wavelength Explorer</span>
            </div>
            <div class="wavelength-slider-vertical-track">
                <div class="wavelength-notches">
                    ${wavelengthLabelsHTML}
                </div>
                <input type="range" 
                       id="wavelength-slider" 
                       class="wavelength-slider-vertical" 
                       min="${minWavelength}" 
                       max="${maxWavelength}" 
                       value="${minWavelength}" 
                       step="0.1"
                       orient="vertical">
            </div>
            <div class="wavelength-status">
                <span class="status-indicator"></span>
                <span class="status-text">Drag to explore wavelengths</span>
            </div>
        </div>
    `;
}

/**
 * Initialize wavelength slider event listeners
 * Should be called after the slider HTML is added to the DOM
 */
function initWavelengthSliderEventListeners() {
    const slider = document.getElementById('wavelength-slider');
    if (slider) {
        slider.addEventListener('input', function(e) {
            onWavelengthSliderChange(e.target.value);
        });
    }
}
