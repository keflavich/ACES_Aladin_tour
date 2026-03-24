/**
 * Wavelength Slider Component for Aladin Tours
 * Allows smooth fading between multiple wavelength images
 */

// Global variables for wavelength slider
let wavelengthSlider = null;
let wavelengthLayers = []; // Array of {wavelength: number, url: string, layer: object}
let currentWavelengthIndex = 0;
let isWavelengthSliderVisible = false;
let wavelengthPlaybackState = {
    isPlaying: false,
    direction: 1, // 1 for up, -1 for down, 0 for stopped
    speed: 0.25, // Multiplier for animation speed
    animationInterval: null,
    stepSize: 0.05 // How much to increment/decrement per frame
};

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
            const cached = layerCache.get(fullUrl);
            wavelengthData.layer = cached && cached.layer ? cached.layer : cached;
            console.log(`Using cached layer for ${wavelengthData.label}`);
        } else {
            // Create new layer
            try {
                // Use Aladin Lite v3 API: createImageSurvey + setOverlayImageLayer
                const layerName = getLayerDisplayName(fullUrl) || `wavelength_${index}_${wavelengthData.wavelength}`;
                const layer = aladin.createImageSurvey(fullUrl, layerName, fullUrl);
                
                // Add to Aladin as overlay layer
                aladin.setOverlayImageLayer(layer, layerName);
                
                // Set invisible initially
                layer.setOpacity(0.0);
                
                // Store in cache and wavelength data
                layerCache.set(fullUrl, { layer: layer, name: layerName, url: fullUrl });
                wavelengthData.layer = layer;
                
                console.log(`Loaded wavelength layer: ${wavelengthData.label} (${fullUrl})`);
            } catch (error) {
                console.error(`Failed to load wavelength layer ${wavelengthData.label}:`, error);
            }
        }
    });

    // Force first wavelength selection once layers are created
    if (wavelengthLayers.length > 0) {
        const slider = document.getElementById('wavelength-slider');
        if (slider) {
            slider.value = 0;
        }
        onWavelengthSliderChange(0);
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

        // Re-assert current slider selection on show (important on cold/private loads)
        const slider = document.getElementById('wavelength-slider');
        if (slider && wavelengthLayers.length > 0) {
            const sliderValue = parseFloat(slider.value);
            const targetValue = Number.isFinite(sliderValue) ? sliderValue : 0;
            requestAnimationFrame(() => {
                onWavelengthSliderChange(targetValue);
            });
        }
    }
}

/**
 * Hide the wavelength slider UI
 */
function hideWavelengthSlider() {
    // Stop playback when hiding
    if (wavelengthPlaybackState.isPlaying) {
        stopWavelengthPlayback();
    }
    
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
    const maxIndex = wavelengthLayers.length - 1;
    
    // Find which wavelength indices we're between
    let lowerIndex = Math.floor(sliderValue);
    let upperIndex = Math.ceil(sliderValue);
    let isExactMatch = false;
    
    // Clamp indices
    lowerIndex = Math.max(0, Math.min(maxIndex, lowerIndex));
    upperIndex = Math.max(0, Math.min(maxIndex, upperIndex));
    
    // Check for exact match (within 0.05 of an integer index)
    if (Math.abs(sliderValue - Math.round(sliderValue)) < 0.05) {
        const exactIndex = Math.round(sliderValue);
        // Exact match - show only this wavelength
        setAllWavelengthOpacities(0);
        if (wavelengthLayers[exactIndex].layer) {
            wavelengthLayers[exactIndex].layer.setOpacity(1.0);
        }
        currentWavelengthIndex = exactIndex;
        isExactMatch = true;
        updateWavelengthDescription(exactIndex);
    } else if (lowerIndex === upperIndex) {
        // At min or max
        setAllWavelengthOpacities(0);
        if (wavelengthLayers[lowerIndex].layer) {
            wavelengthLayers[lowerIndex].layer.setOpacity(1.0);
        }
        currentWavelengthIndex = lowerIndex;
        isExactMatch = true;
        updateWavelengthDescription(lowerIndex);
    } else {
        // Blending between two wavelengths
        // Check that layers exist
        if (!wavelengthLayers[lowerIndex] || !wavelengthLayers[lowerIndex].layer) {
            console.error(`Layer at index ${lowerIndex} is not initialized`);
            return;
        }
        if (!wavelengthLayers[upperIndex] || !wavelengthLayers[upperIndex].layer) {
            console.error(`Layer at index ${upperIndex} is not initialized`);
            return;
        }
        
        // Calculate blend position (0 to 1 between lowerIndex and upperIndex)
        const position = sliderValue - lowerIndex;
        
        // Keep lower layer fully opaque and fade in upper layer,
        // so the base layer never shows through during transitions.
        setAllWavelengthOpacities(0);
        wavelengthLayers[lowerIndex].layer.setOpacity(1.0);
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
    
    // Use index-based positioning for even spacing
    const maxIndex = wavelengthLayers.length - 1;
    
    // Create wavelength labels for each notch (evenly spaced)
    let wavelengthLabelsHTML = '';
    wavelengthLayers.forEach((layer, index) => {
        const position = (index / maxIndex) * 100;
        const formattedLabel = formatRGBLabel(layer.label);
        wavelengthLabelsHTML += `
            <div class="wavelength-notch" style="bottom: ${position}%;" data-index="${index}">
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
                       min="0" 
                       max="${maxIndex}" 
                       value="0" 
                       step="0.01"
                       orient="vertical">
            </div>
            <div class="wavelength-status">
                <span class="status-indicator"></span>
                <span class="status-text">Drag to explore wavelengths</span>
            </div>
            <div class="wavelength-toolbox">
                <button class="toolbox-toggle" id="wavelength-toolbox-toggle" title="Toggle playback controls">
                    <span class="toggle-icon">⚙</span>
                </button>
                <div class="toolbox-controls" id="wavelength-toolbox-controls">
                    <button class="play-button" id="wavelength-play-button" title="Play/Pause automated sliding">
                        <span class="play-icon">▶</span>
                    </button>
                    <div class="speed-buttons-group">
                        <button class="speed-button" id="wavelength-speed-slower" title="Decrease speed (÷2)">
                            &lt;&lt;
                        </button>
                        <span class="speed-display" id="wavelength-speed-display">0.25x</span>
                        <button class="speed-button" id="wavelength-speed-faster" title="Increase speed (×2)">
                            &gt;&gt;
                        </button>
                        <button class="speed-button reset" id="wavelength-speed-reset" title="Reset to 1x">
                            &gt;
                        </button>
                    </div>
                </div>
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
        slider.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
        slider.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        });
        slider.addEventListener('input', function(e) {
            // Stop playback when user manually adjusts slider
            if (wavelengthPlaybackState.isPlaying) {
                stopWavelengthPlayback();
            }
            onWavelengthSliderChange(e.target.value);
        });
    }

    // Add event listeners to wavelength notches for direct selection
    const notches = document.querySelectorAll('.wavelength-notch');
    notches.forEach((notch) => {
        notch.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
        notch.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        });
        notch.addEventListener('click', function(e) {
            // Stop playback when user clicks a wavelength
            if (wavelengthPlaybackState.isPlaying) {
                stopWavelengthPlayback();
            }
            const index = parseInt(this.getAttribute('data-index'));
            slider.value = index;
            onWavelengthSliderChange(index);
        });
        // Pointer events and cursor styles are now handled in CSS
    });

    // Toolbox controls
    const playButton = document.getElementById('wavelength-play-button');
    if (playButton) {
        playButton.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
        playButton.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        });
        playButton.addEventListener('click', function() {
            toggleWavelengthPlayback();
        });
    }

    const speedSlowerBtn = document.getElementById('wavelength-speed-slower');
    const speedFasterBtn = document.getElementById('wavelength-speed-faster');
    const speedResetBtn = document.getElementById('wavelength-speed-reset');
    
    if (speedSlowerBtn) {
        speedSlowerBtn.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
        speedSlowerBtn.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        });
        speedSlowerBtn.addEventListener('click', function() {
            decreaseWavelengthPlaybackSpeed();
        });
    }
    
    if (speedFasterBtn) {
        speedFasterBtn.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
        speedFasterBtn.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        });
        speedFasterBtn.addEventListener('click', function() {
            increaseWavelengthPlaybackSpeed();
        });
    }
    
    if (speedResetBtn) {
        speedResetBtn.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
        speedResetBtn.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        });
        speedResetBtn.addEventListener('click', function() {
            resetWavelengthPlaybackSpeed();
        });
    }

    const toolboxToggle = document.getElementById('wavelength-toolbox-toggle');
    if (toolboxToggle) {
        toolboxToggle.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
        toolboxToggle.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        });
        toolboxToggle.addEventListener('click', function() {
            const controls = document.getElementById('wavelength-toolbox-controls');
            if (controls) {
                controls.classList.toggle('hidden');
            }
        });
    }
}

/**
 * Toggle wavelength playback (play/pause)
 */
function toggleWavelengthPlayback() {
    if (wavelengthPlaybackState.isPlaying) {
        stopWavelengthPlayback();
    } else {
        startWavelengthPlayback();
    }
}

/**
 * Start automatic wavelength sliding
 */
function startWavelengthPlayback() {
    const slider = document.getElementById('wavelength-slider');
    const playButton = document.getElementById('wavelength-play-button');
    
    if (!slider) return;
    
    wavelengthPlaybackState.isPlaying = true;
    wavelengthPlaybackState.direction = 1; // Start going up
    
    if (playButton) {
        playButton.classList.add('playing');
        playButton.querySelector('.play-icon').textContent = '⏸';
    }
    
    const maxIndex = parseFloat(slider.max);
    const animationLoop = () => {
        let currentValue = parseFloat(slider.value);
        const step = wavelengthPlaybackState.stepSize * wavelengthPlaybackState.speed * wavelengthPlaybackState.direction;
        
        currentValue += step;
        
        // Reverse direction at boundaries
        if (currentValue >= maxIndex) {
            currentValue = maxIndex;
            wavelengthPlaybackState.direction = -1;
        } else if (currentValue <= 0) {
            currentValue = 0;
            wavelengthPlaybackState.direction = 1;
        }
        
        slider.value = currentValue;
        onWavelengthSliderChange(currentValue);
        
        if (wavelengthPlaybackState.isPlaying) {
            wavelengthPlaybackState.animationInterval = requestAnimationFrame(animationLoop);
        }
    };
    
    wavelengthPlaybackState.animationInterval = requestAnimationFrame(animationLoop);
}

/**
 * Stop automatic wavelength sliding
 */
function stopWavelengthPlayback() {
    wavelengthPlaybackState.isPlaying = false;
    wavelengthPlaybackState.direction = 0;
    
    if (wavelengthPlaybackState.animationInterval) {
        cancelAnimationFrame(wavelengthPlaybackState.animationInterval);
        wavelengthPlaybackState.animationInterval = null;
    }
    
    const playButton = document.getElementById('wavelength-play-button');
    if (playButton) {
        playButton.classList.remove('playing');
        playButton.querySelector('.play-icon').textContent = '▶';
    }
}

/**
 * Update the speed display
 */
function updateWavelengthSpeedDisplay() {
    const display = document.getElementById('wavelength-speed-display');
    if (display) {
        display.textContent = wavelengthPlaybackState.speed + 'x';
    }
}

/**
 * Increase wavelength playback speed by factor of 2
 */
function increaseWavelengthPlaybackSpeed() {
    wavelengthPlaybackState.speed = Math.min(wavelengthPlaybackState.speed * 2, 16);
    updateWavelengthSpeedDisplay();
}

/**
 * Decrease wavelength playback speed by factor of 2
 */
function decreaseWavelengthPlaybackSpeed() {
    wavelengthPlaybackState.speed = Math.max(wavelengthPlaybackState.speed / 2, 0.25);
    updateWavelengthSpeedDisplay();
}

/**
 * Reset wavelength playback speed to 0.25x
 */
function resetWavelengthPlaybackSpeed() {
    wavelengthPlaybackState.speed = 0.25;
    updateWavelengthSpeedDisplay();
}
