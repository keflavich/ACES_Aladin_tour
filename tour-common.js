// Common JavaScript functionality for Aladin tours
// This file contains all shared functions and variables

// Global variables
let aladin;
let currentWaypoint = 0;
let isPlaying = false;
let waypointTimeout;
let loopTour = true; // Flag to enable continuous looping (default on)
let interruptAnimation = false; // Flag to interrupt ongoing animations
let currentImageLayer = null; // Track the most recently added image layer
let isInfoExpanded = false; // Track info panel state
let countdownInterval = null; // Track countdown timer
let countdownEndTime = null; // When the countdown should end

// Layer management system to avoid reloading layers
let layerCache = new Map(); // URL -> layer object mapping
let layerOrder = []; // Track layer order for bringing to front
let layerCounter = 0; // Counter for generating unique layer names
let stickyUrls = new Set(); // Track sticky layers that should persist across waypoints

// Speed control system
let speedMultiplier = 1; // 1 = normal, 2 = 2x speed, 4 = 4x speed

// Region editing system
let regionEditingEnabled = false;
let regionOverlay = null;
let currentRegionPoints = [];
let isDrawingRegion = false;
let regionEditingClickHandler = null;

// Root URL configuration based on environment
let rootUrl;
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    rootUrl = './';
    console.log('Running on localhost, using relative paths', rootUrl);
} else if (window.location.hostname === 'data.rc.ufl.edu') {
    rootUrl = 'https://data.rc.ufl.edu/pub/adamginsburg/avm_images/';
    console.log('Running on UF data server, using UF URL', rootUrl);
} else if (window.location.hostname.includes('github.io') || window.location.hostname.includes('githubusercontent.com')) {
    rootUrl = 'https://keflavich.github.io/avm_images/';
    console.log('Running on GitHub Pages, using GitHub URL', rootUrl);
} else {
    // Default fallback
    rootUrl = 'https://data.rc.ufl.edu/pub/adamginsburg/avm_images/';
    console.log('Unknown hostname, defaulting to UF data server URL', rootUrl);
}

// Function to construct full URL for image layers
function getImageUrl(relativePath) {
    if (!relativePath) return relativePath;
    // If it's already a full URL, return as-is
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        return relativePath;
    }
    // If it's a CDS HiPS path (starts with "CDS/P/"), use it directly as a HiPS identifier
    if (relativePath.startsWith('CDS/P/')) {
        console.log('Detected CDS HiPS path, using as identifier:', relativePath);
        return relativePath;
    }
    return rootUrl + relativePath;
}

// URL anchor management for shareable waypoints
function titleToAnchor(title) {
    if (!title) return '';
    return title.toLowerCase()
                   .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
                   .replace(/\s+/g, '-') // Replace spaces with hyphens
                   .replace(/-+/g, '-') // Replace multiple hyphens with single
                   .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

function updateUrlHash() {
    if (currentWaypoint >= 0 && currentWaypoint < waypoints.length) {
        const anchor = titleToAnchor(waypoints[currentWaypoint].title);
        if (anchor) {
            const newHash = '#' + anchor;
            if (window.location.hash !== newHash) {
                window.history.pushState(null, null, newHash);
                console.log('Updated URL hash to:', newHash);
            }
        }
    }
}

function getWaypointFromHash() {
    const hash = window.location.hash.slice(1); // Remove the '#'
    if (!hash) return -1;

    for (let i = 0; i < waypoints.length; i++) {
        if (titleToAnchor(waypoints[i].title) === hash) {
            console.log('Found waypoint for hash:', hash, 'at index:', i);
            return i;
        }
    }
    console.log('No waypoint found for hash:', hash);
    return -1;
}

function handleHashChange() {
    const targetWaypoint = getWaypointFromHash();
    if (targetWaypoint >= 0 && targetWaypoint !== currentWaypoint) {
        console.log('Hash changed, jumping to waypoint:', targetWaypoint);
        isPlaying = false;
        clearTimeout(waypointTimeout);
        stopCountdown();
        updatePlayPauseButton();
        jumpToWaypointWithLayers(targetWaypoint);
    }
}

// Function to get or create a layer, reusing existing ones
function getOrCreateLayer(url) {
    if (!url) return null;

    // Check if we already have this layer cached
    if (layerCache.has(url)) {
        console.log("Reusing existing layer for URL:", url);
        return layerCache.get(url);
    }

    // Create a new layer with a unique name
    layerCounter++;
    const layerName = `layer_${layerCounter}`;

    console.log("Creating new layer for URL:", url, "with name:", layerName);

    let layer;
    if (url.endsWith('.jpg')) {
        // For JPG files, we can't use overlay layers, so handle differently
        aladin.displayJPG(url);
        // Store a reference but note it's not a true layer object
        layerCache.set(url, { isJPG: true, url: url });
        return layerCache.get(url);
    } else {
        // Create an overlay image layer with a unique name
        const survey = aladin.newImageSurvey(url);
        layer = survey;
        aladin.setOverlayImageLayer(survey, layerName);

        // Cache the layer
        layerCache.set(url, { layer: layer, name: layerName, url: url });
        layerOrder.push(url);

        return layerCache.get(url);
    }
}

// Function to bring a layer to the foreground
function bringLayerToFront(url) {
    if (!url || !layerCache.has(url)) return;

    const cachedLayer = layerCache.get(url);

    if (cachedLayer.isJPG) {
        // For JPG layers, we need to redisplay them
        console.log("Bringing JPG layer to front:", url);
        aladin.displayJPG(url);
        return cachedLayer;
    }

    // For regular layers, make sure it's visible and has full opacity
    if (cachedLayer.layer) {
        console.log("Bringing layer to front:", url, "name:", cachedLayer.name);
        cachedLayer.layer.setOpacity(1.0);

        // Update the layer order
        const index = layerOrder.indexOf(url);
        if (index > -1) {
            layerOrder.splice(index, 1);
        }
        layerOrder.push(url);

        // Set as current image layer
        currentImageLayer = cachedLayer.layer;

        // Debug: show cache status
        if (console.log) {
            showLayerCacheStatus();
        }

        return cachedLayer;
    }
}

// Function to hide other layers, keeping the two most recent visible
function hideOtherLayers(currentUrl, waypoint = null) {
    // Determine which layer should be the background layer
    let backgroundUrl = null;

    if (waypoint && waypoint.fade_layer) {
        // Use the specified fade_layer
        backgroundUrl = waypoint.fade_layer;
        console.log("Showing layers - Current:", currentUrl, "Fade layer:", backgroundUrl);
    } else {
        // Use the previous layer in order
        const currentIndex = layerOrder.indexOf(currentUrl);
        backgroundUrl = currentIndex > 0 ? layerOrder[currentIndex - 1] : null;
        console.log("Showing layers - Current:", currentUrl, "Previous:", backgroundUrl);
    }

    // Get fade out duration from waypoint or use default
    const fadeOutDuration = waypoint ? getAdjustedWaypointTime(waypoint, 'fade_out_time', 0.5) : 0.5;

    layerCache.forEach((cachedLayer, url) => {
        if (cachedLayer.isJPG || !cachedLayer.layer) return;

        if (url === currentUrl) {
            // Current layer: full opacity
            cachedLayer.layer.setOpacity(1.0);
        } else if (stickyUrls.has(url)) {
            // Sticky layer: full opacity
            cachedLayer.layer.setOpacity(1.0);
        } else if (url === backgroundUrl) {
            // Background layer (either previous or specified fade_layer): keep visible
            cachedLayer.layer.setOpacity(1.0);
        } else {
            // All other layers: fade out smoothly instead of hiding immediately
            const currentOpacity = cachedLayer.layer.getAlpha();
            if (currentOpacity > 0) {
                console.log("Fading out layer:", url, "from opacity", currentOpacity, "over", fadeOutDuration, "seconds");
                animateLayerOpacity(cachedLayer.layer, currentOpacity, 0, fadeOutDuration, null);
            }
        }
    });
}

// Function to clear layer cache (useful for reset)
function clearLayerCache() {
    console.log("Clearing layer cache");
    layerCache.clear();
    layerOrder = [];
    layerCounter = 0;
    currentImageLayer = null;
    stickyUrls.clear();
}

// Function to get current active layer for animations
function getCurrentActiveLayer() {
    // Try to find the most recently activated layer
    if (layerOrder.length > 0) {
        const lastUrl = layerOrder[layerOrder.length - 1];
        const cachedLayer = layerCache.get(lastUrl);
        if (cachedLayer && !cachedLayer.isJPG && cachedLayer.layer) {
            return cachedLayer.layer;
        }
    }
    return currentImageLayer; // Fallback to old system
}

// Debug function to show layer cache status
function showLayerCacheStatus() {
    console.log("=== Layer Cache Status ===");
    console.log("Total cached layers:", layerCache.size);
    console.log("Layer order:", layerOrder);
    console.log("Sticky URLs:", Array.from(stickyUrls));
    layerCache.forEach((cachedLayer, url) => {
        const type = cachedLayer.isJPG ? "JPG" : "HiPS";
        const opacity = cachedLayer.layer ? cachedLayer.layer.getAlpha() : "N/A";
        const isSticky = stickyUrls.has(url) ? " (STICKY)" : "";
        console.log(`- ${url}: ${type}, opacity: ${opacity}${isSticky}`);
    });
    console.log("========================");
}

// Helper functions for speed-adjusted timing
function getAdjustedTime(timeInSeconds) {
    return timeInSeconds / speedMultiplier;
}

function getAdjustedTimeMs(timeInMs) {
    return timeInMs / speedMultiplier;
}

function getAdjustedWaypointTime(waypoint, timeProperty, defaultValue = 2) {
    const baseTime = waypoint[timeProperty] || defaultValue;
    const adjustedTime = getAdjustedTime(baseTime);
    if (speedMultiplier !== 1) {
        console.log(`Speed adjustment: ${timeProperty} ${baseTime}s -> ${adjustedTime.toFixed(2)}s (${speedMultiplier}x speed)`);
    }
    return adjustedTime;
}

function getAdjustedWaypointTimeMs(waypoint, timeProperty, defaultValue = 2000) {
    const baseTime = waypoint[timeProperty] || defaultValue;
    const adjustedTime = getAdjustedTimeMs(baseTime);
    if (speedMultiplier !== 1) {
        console.log(`Speed adjustment: ${timeProperty} ${baseTime}ms -> ${adjustedTime.toFixed(0)}ms (${speedMultiplier}x speed)`);
    }
    return adjustedTime;
}

// Initialize mobile info panel
function initializeMobileInfoPanel() {
    const infoPanel = document.getElementById('waypoint-info');
    const expandBtn = document.getElementById('expand-btn');

    // Set initial state based on screen size
    if (window.innerWidth <= 768) {
        infoPanel.classList.add('collapsed');
        isInfoExpanded = false;
        expandBtn.innerHTML = '▶';
        expandBtn.title = 'Expand Info';
    } else {
        infoPanel.classList.remove('collapsed', 'expanded');
        expandBtn.style.display = 'none';
    }

    // Add expand button event listener
    expandBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleInfoPanel();
    });

    // Handle window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            // Desktop view - hide expand button and reset state
            infoPanel.classList.remove('collapsed', 'expanded');
            expandBtn.style.display = 'none';
            isInfoExpanded = false;
        } else {
            // Mobile view - show expand button and set collapsed state
            expandBtn.style.display = 'block';
            if (!isInfoExpanded) {
                infoPanel.classList.add('collapsed');
                infoPanel.classList.remove('expanded');
            }
        }
    });
}

// Toggle info panel expand/collapse
function toggleInfoPanel() {
    const infoPanel = document.getElementById('waypoint-info');
    const expandBtn = document.getElementById('expand-btn');

    if (isInfoExpanded) {
        // Collapse
        infoPanel.classList.remove('expanded');
        infoPanel.classList.add('collapsed');
        expandBtn.innerHTML = '▶';
        expandBtn.title = 'Expand Info';
        isInfoExpanded = false;
    } else {
        // Expand
        infoPanel.classList.remove('collapsed');
        infoPanel.classList.add('expanded');
        expandBtn.innerHTML = '▼';
        expandBtn.title = 'Collapse Info';
        isInfoExpanded = true;
    }
}

// Countdown timer functions
function startCountdown(durationMs) {
    if (!isPlaying) return;

    stopCountdown(); // Clear any existing countdown

    countdownEndTime = Date.now() + durationMs;
    const countdownTimer = document.getElementById('countdown-timer');
    const countdownValue = document.getElementById('countdown-value');

    countdownTimer.style.display = 'block';

    function updateCountdown() {
        if (!isPlaying || !countdownEndTime) {
            stopCountdown();
            return;
        }

        const timeLeft = countdownEndTime - Date.now();
        if (timeLeft <= 0) {
            stopCountdown();
            return;
        }

        const secondsLeft = Math.ceil(timeLeft / 1000);
        countdownValue.textContent = secondsLeft;
    }

    // Update immediately and then every 100ms for smooth countdown
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 100);
}

function stopCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    countdownEndTime = null;
    document.getElementById('countdown-timer').style.display = 'none';
}

// Function to advance to the next waypoint
function autoAdvance() {
    if (!isPlaying) return;
    if (currentWaypoint < waypoints.length - 1) {
        goToWaypoint(currentWaypoint + 1);
    } else if (loopTour) {
        goToWaypoint(0);
    } else {
        isPlaying = false;
        return;
    }
    // Note: timeout is now set in goToWaypoint() after animation completes
}

// Function to update the waypoint information
function updateWaypointInfo() {
    document.getElementById('waypoint-title').innerText = waypoints[currentWaypoint].title;
    document.getElementById('waypoint-description').innerText = waypoints[currentWaypoint].description;
    document.getElementById('current-waypoint').innerText = (currentWaypoint + 1) + '/' + waypoints.length;

    // Update URL hash for shareable links
    updateUrlHash();

    // Update button states
    updateButtonStates();
}

// Function to update button states
function updateButtonStates() {
    const prevBtn = document.getElementById('prev-btn');

    // Disable previous button at first waypoint
    if (currentWaypoint === 0) {
        prevBtn.disabled = true;
        prevBtn.title = 'Previous (unavailable)';
    } else {
        prevBtn.disabled = false;
        prevBtn.title = 'Previous';
    }

    // Update next button text to show the next region name
    updateNextButtonText();

    // Update play/pause button
    updatePlayPauseButton();
}

// Function to update play/pause button appearance
function updatePlayPauseButton() {
    const playBtn = document.getElementById('start-btn');
    if (isPlaying) {
        playBtn.innerHTML = '⏸';
        playBtn.title = 'Pause Tour';
    } else {
        playBtn.innerHTML = '▶';
        playBtn.title = 'Play/Resume Tour';
    }
}

// Function to start/resume the tour
function startTour() {
    isPlaying = true;
    interruptAnimation = false;  // Reset interrupt flag for new animations
    updatePlayPauseButton();

    // If starting from waypoint 0, immediately go to waypoint 1 to start the tour
    if (currentWaypoint === 0) {
        goToWaypoint(1);
    } else {
        goToWaypoint(currentWaypoint);
    }
}

// Function to pause the tour
function pauseTour() {
    isPlaying = false;
    interruptAnimation = true;  // Halt any ongoing animations immediately
    clearTimeout(waypointTimeout);
    stopCountdown();
    updatePlayPauseButton();
}

// Function to populate the waypoint dropdown
function populateWaypointDropdown() {
    const dropdown = document.getElementById('waypoint-dropdown');
    // Clear existing options except the first one
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }

    // Add all waypoints
    waypoints.forEach((waypoint, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.text = `${index + 1}. ${waypoint.title}`;
        dropdown.appendChild(option);
    });
}

// Function to update the next button text
function updateNextButtonText() {
    if (currentWaypoint === waypoints.length - 1) {
        // At last waypoint, show restart symbol
        document.getElementById('next-btn').innerHTML = '↻';
        document.getElementById('next-btn').title = 'Restart Tour';
    } else {
        // Show next symbol with tooltip showing next waypoint
        const nextWaypoint = waypoints[currentWaypoint + 1];
        document.getElementById('next-btn').innerHTML = '›';
        document.getElementById('next-btn').title = 'Next: ' + nextWaypoint.title;
    }

    // Highlight the current waypoint in the dropdown
    const dropdown = document.getElementById('waypoint-dropdown');
    Array.from(dropdown.options).forEach((option, index) => {
        if (index > 0 && parseInt(option.value) === currentWaypoint) {
            option.style.backgroundColor = '#0D47A1';
        } else if (index > 0) {
            option.style.backgroundColor = '';
        }
    });
}

// Function to update the progress bar
function updateProgressBar() {
    const progress = ((currentWaypoint) / (waypoints.length - 1)) * 100;
    document.getElementById('progress').style.width = progress + '%';
}

function goToWaypointFast(index) {
    if (!aladin) {
        console.error('Aladin not initialized yet');
        return;
    }

    // Signal to interrupt any ongoing animation
    interruptAnimation = true;
    clearTimeout(waypointTimeout);

    // Update current waypoint state
    currentWaypoint = index;
    if (currentWaypoint < 0) currentWaypoint = 0;
    if (currentWaypoint >= waypoints.length) currentWaypoint = waypoints.length - 1;

    // Get the waypoint data
    const waypoint = waypoints[currentWaypoint];

    // Update display info
    updateWaypointInfo();
    updateProgressBar();

    // Display image if available
    if (waypoint.url) {
        console.log("Displaying layer (fast): ", waypoint.url);
        const cachedLayer = getOrCreateLayer(waypoint.url);

        // Pre-load fade_layer if specified
        if (waypoint.fade_layer) {
            console.log("Pre-loading fade layer (fast): ", waypoint.fade_layer);
            getOrCreateLayer(waypoint.fade_layer);
        }

        bringLayerToFront(waypoint.url);
        // Optionally hide other layers for cleaner display
        hideOtherLayers(waypoint.url, waypoint);
    }

    // Jump directly to the location
    aladin.setFov(waypoint.fov);
    aladin.gotoRaDec(waypoint.ra, waypoint.dec);

    // Reset interrupt flag
    interruptAnimation = false;
}

// Function to go to a specific waypoint with animation
function goToWaypoint(index) {
    if (!aladin) {
        console.error('Aladin not initialized yet');
        return;
    }

    // Reset interrupt flag at the start of a new animation
    interruptAnimation = false;
    clearTimeout(waypointTimeout);

    currentWaypoint = index;
    if (currentWaypoint < 0) currentWaypoint = 0;
    if (currentWaypoint >= waypoints.length) currentWaypoint = waypoints.length - 1;

    const waypoint = waypoints[currentWaypoint];

    // Only update progress bar immediately, delay waypoint info until animation starts
    updateProgressBar();

    // Only stop the tour if we're at the last waypoint and not looping
    if (currentWaypoint === waypoints.length - 1 && !loopTour) {
        isPlaying = false;
        clearTimeout(waypointTimeout);
        updatePlayPauseButton();
    }

    // Calculate total transition time and start countdown immediately if playing
    if (isPlaying && currentWaypoint < waypoints.length - 1) {
        const prevIndex = currentWaypoint > 0 ? currentWaypoint - 1 : 0;
        const prevWaypoint = waypoints[prevIndex];

        // Calculate distance to determine if this is close or distant waypoints
        const distance = Math.sqrt(
            Math.pow(waypoint.ra - prevWaypoint.ra, 2) +
            Math.pow(waypoint.dec - prevWaypoint.dec, 2)
        );

        let totalTime = 0;

        if (distance < 0.2) {
            // Close waypoints: 2s movement + optional fade + pause
            totalTime = getAdjustedTimeMs(2000); // animateToRaDec time
        } else {
            // Distant waypoints: zoom out + movement + zoom in + optional fade + pause
            totalTime = getAdjustedWaypointTimeMs(waypoint, 'zoom_out_time', 2) +
                       getAdjustedWaypointTimeMs(waypoint, 'transition_time', 1) +
                       getAdjustedWaypointTimeMs(waypoint, 'zoom_in_time', 2);
        }

        // Add fade time if enabled
        if (waypoint.fade_enabled) {
            totalTime += getAdjustedWaypointTimeMs(waypoint, 'fade_out_time', 1.5) +
                        getAdjustedWaypointTimeMs(waypoint, 'fade_delay', 0.5) +
                        getAdjustedWaypointTimeMs(waypoint, 'fade_in_time', 1.5);
        }

        // Add pause time
        totalTime += getAdjustedWaypointTimeMs(waypoint, 'pause_time', 2000);

        // Start countdown for total time
        startCountdown(totalTime);
    } else if (isPlaying && currentWaypoint === waypoints.length - 1 && loopTour) {
        // Handle end of tour countdown
        const endPause = getAdjustedWaypointTimeMs(waypoint, 'end_of_tour_pause',
                         getAdjustedWaypointTimeMs(waypoint, 'pause_time', 5000));
        startCountdown(endPause);
    }

    const prevIndex = currentWaypoint > 0 ? currentWaypoint - 1 : 0;
    const prevWaypoint = waypoints[prevIndex];

    // Calculate distance between current and previous waypoints
    const distance = Math.sqrt(
        Math.pow(waypoint.ra - prevWaypoint.ra, 2) +
        Math.pow(waypoint.dec - prevWaypoint.dec, 2)
    );

    // If waypoints are close (within 0.1 degrees), skip zoom out step
    if (distance < 0.2) {
        console.log("Close waypoints detected, skipping zoom out step");
        // Update waypoint info right before starting the movement animation
        updateWaypointInfo();

        // Pre-load new layer but don't display yet
        if (waypoints[index].url) {
            console.log("Pre-loading layer: ", waypoints[index].url);
            const cachedLayer = getOrCreateLayer(waypoints[index].url);
            // Immediately hide the newly created layer so it doesn't show during pan/zoom
            if (cachedLayer && cachedLayer.layer && !cachedLayer.isJPG) {
                cachedLayer.layer.setOpacity(0.0);
            }

            // Pre-load and SHOW fade_layer if specified - this should be visible during pan/zoom
            if (waypoints[index].fade_layer) {
                console.log("Pre-loading and showing fade layer: ", waypoints[index].fade_layer);
                const fadeCachedLayer = getOrCreateLayer(waypoints[index].fade_layer);
                // Make fade layer visible for the pan/zoom sequence
                if (fadeCachedLayer && fadeCachedLayer.layer && !fadeCachedLayer.isJPG) {
                    bringLayerToFront(waypoints[index].fade_layer);
                    hideOtherLayers(waypoints[index].fade_layer, waypoints[index]);
                }
            }
        }

        // Go directly to the new coordinates
        aladin.animateToRaDec(waypoint.ra, waypoint.dec, getAdjustedTime(2), function () {
            // Check if animation was interrupted
            if (interruptAnimation) return;

            // Then zoom in to target FOV
            aladin.zoomToFoV(waypoint.fov, getAdjustedWaypointTime(waypoint, 'transition_time', 2), function () {
                // Check if animation was interrupted
                if (interruptAnimation) return;

                // NOW display the new layer after pan and zoom are complete with smooth fade-in
                if (waypoints[index].url) {
                    console.log("Displaying layer after pan/zoom with fade-in: ", waypoints[index].url);

                    // Update sticky layer if this waypoint is marked as sticky
                    if (waypoints[index].is_sticky) {
                        console.log("Adding sticky layer:", waypoints[index].url);
                        stickyUrls.add(waypoints[index].url);
                    }

                    const cachedLayer = getOrCreateLayer(waypoints[index].url);
                    if (cachedLayer && cachedLayer.layer && !cachedLayer.isJPG) {
                        // Set up layer visibility and ordering, starting with opacity 0
                        cachedLayer.layer.setOpacity(0.0);

                        // Update layer order
                        const layerIndex = layerOrder.indexOf(waypoints[index].url);
                        if (layerIndex > -1) {
                            layerOrder.splice(layerIndex, 1);
                        }
                        layerOrder.push(waypoints[index].url);
                        currentImageLayer = cachedLayer.layer;

                        // Hide other layers
                        hideOtherLayers(waypoints[index].url, waypoints[index]);

                        // Animate fade-in using waypoint's fade_in_time (default 0.5s), then continue with waypoint logic
                        const fadeInDuration = getAdjustedWaypointTime(waypoint, 'fade_in_time', 0.5);
                        animateLayerOpacity(cachedLayer.layer, 0, 1, fadeInDuration, function() {
                            // Check if fade animation is enabled for this waypoint
                            if (waypoint.fade_enabled) {
                                animateFade(getAdjustedWaypointTime(waypoint, 'fade_out_time', 1.5),
                                           getAdjustedWaypointTime(waypoint, 'fade_delay', 0.5),
                                           getAdjustedWaypointTime(waypoint, 'fade_in_time', 1.5), function() {
                                    // Set up auto-advance timeout using configurable pause time
                                    if (isPlaying) {
                                        if (currentWaypoint === waypoints.length - 1 && loopTour) {
                                            console.log("End of tour reached, looping back to start");
                                            clearTimeout(waypointTimeout);
                                            const endPause = getAdjustedWaypointTimeMs(waypoint, 'end_of_tour_pause',
                                                             getAdjustedWaypointTimeMs(waypoint, 'pause_time', 3000));
                                            waypointTimeout = setTimeout(autoAdvance, endPause);
                                        } else if (currentWaypoint < waypoints.length - 1) {
                                            // Schedule next waypoint using configurable pause time
                                            clearTimeout(waypointTimeout);
                                            const pauseTime = getAdjustedWaypointTimeMs(waypoint, 'pause_time', 2000);
                                            waypointTimeout = setTimeout(autoAdvance, pauseTime);
                                        }
                                    }
                                });
                            } else {
                                // No fade animation, set up auto-advance timeout using configurable pause time
                                if (isPlaying) {
                                    if (currentWaypoint === waypoints.length - 1 && loopTour) {
                                        console.log("End of tour reached, looping back to start");
                                        clearTimeout(waypointTimeout);
                                        const endPause = getAdjustedWaypointTimeMs(waypoint, 'end_of_tour_pause',
                                                         getAdjustedWaypointTimeMs(waypoint, 'pause_time', 5000));
                                        waypointTimeout = setTimeout(autoAdvance, endPause);
                                    } else if (currentWaypoint < waypoints.length - 1) {
                                        // Schedule next waypoint using configurable pause time
                                        clearTimeout(waypointTimeout);
                                        const pauseTime = getAdjustedWaypointTimeMs(waypoint, 'pause_time',
                                                     (currentWaypoint === 0 ? 2000 : 8000));
                                        waypointTimeout = setTimeout(autoAdvance, pauseTime);
                                    }
                                }
                            }
                        });
                        return; // Exit here, rest handled in callback
                    } else {
                        // Fallback for JPG or other layer types
                        bringLayerToFront(waypoints[index].url);
                        hideOtherLayers(waypoints[index].url, waypoints[index]);
                    }
                } else {
                    // No URL - just pan and zoom, then set up auto-advance
                    console.log("No URL for waypoint, setting up auto-advance only");

                    // Set up auto-advance timeout using configurable pause time
                    if (isPlaying) {
                        if (currentWaypoint === waypoints.length - 1 && loopTour) {
                            console.log("End of tour reached, looping back to start");
                            clearTimeout(waypointTimeout);
                            const endPause = getAdjustedWaypointTimeMs(waypoint, 'end_of_tour_pause',
                                             getAdjustedWaypointTimeMs(waypoint, 'pause_time', 5000));
                            waypointTimeout = setTimeout(autoAdvance, endPause);
                        } else if (currentWaypoint < waypoints.length - 1) {
                            // Schedule next waypoint using configurable pause time
                            clearTimeout(waypointTimeout);
                            const pauseTime = getAdjustedWaypointTimeMs(waypoint, 'pause_time', 2000);
                            waypointTimeout = setTimeout(autoAdvance, pauseTime);
                        }
                    }
                }

            });
        });
    } else {
        // Multi-step animation with custom FOV animation
        // Pre-load new layer but don't display yet
        if (waypoints[index].url) {
            console.log("Pre-loading layer: ", waypoints[index].url);
            const cachedLayer = getOrCreateLayer(waypoints[index].url);
            // Immediately hide the newly created layer so it doesn't show during pan/zoom
            if (cachedLayer && cachedLayer.layer && !cachedLayer.isJPG && waypoints[index].hide_during_pan) {
                cachedLayer.layer.setOpacity(0.0);
            }

            // Pre-load and SHOW fade_layer if specified - this should be visible during pan/zoom
            if (waypoints[index].fade_layer) {
                console.log("Pre-loading and showing fade layer: ", waypoints[index].fade_layer);
                const fadeCachedLayer = getOrCreateLayer(waypoints[index].fade_layer);
                // Make fade layer visible for the pan/zoom sequence
                if (fadeCachedLayer && fadeCachedLayer.layer && !fadeCachedLayer.isJPG) {
                    bringLayerToFront(waypoints[index].fade_layer);
                    hideOtherLayers(waypoints[index].fade_layer, waypoints[index]);
                }
            }
        }

        // Step 1: Zoom out to 5 degrees
        aladin.zoomToFoV(waypoint.transition_fov, getAdjustedWaypointTime(waypoint, 'zoom_out_time', 2), function () {
            // Check if animation was interrupted
            if (interruptAnimation) return;

            // Update waypoint info right before starting the movement animation
            updateWaypointInfo();
            // Step 2: Go to the new coordinates
            aladin.animateToRaDec(waypoint.ra, waypoint.dec, getAdjustedWaypointTime(waypoint, 'transition_time', 2), function () {
                // Check if animation was interrupted
                if (interruptAnimation) return;

                // Step 3: Zoom in to target FOV
                aladin.zoomToFoV(waypoint.fov, getAdjustedWaypointTime(waypoint, 'zoom_in_time', 2), function () {
                    // Check if animation was interrupted
                    if (interruptAnimation) return;

                    // NOW display the new layer after all pan and zoom are complete with smooth fade-in
                    if (waypoints[index].url) {
                        console.log("Displaying layer after pan/zoom with fade-in: ", waypoints[index].url);

                        // Update sticky layer if this waypoint is marked as sticky
                        if (waypoints[index].is_sticky) {
                            console.log("Adding sticky layer:", waypoints[index].url);
                            stickyUrls.add(waypoints[index].url);
                        }

                        const cachedLayer = getOrCreateLayer(waypoints[index].url);
                        if (cachedLayer && cachedLayer.layer && !cachedLayer.isJPG) {
                            // Set up layer visibility and ordering, starting with opacity 0
                            cachedLayer.layer.setOpacity(0.0);

                            // Update layer order
                            const layerIndex = layerOrder.indexOf(waypoints[index].url);
                            if (layerIndex > -1) {
                                layerOrder.splice(layerIndex, 1);
                            }
                            layerOrder.push(waypoints[index].url);
                            currentImageLayer = cachedLayer.layer;

                            // Hide other layers
                            hideOtherLayers(waypoints[index].url, waypoints[index]);

                            // Animate fade-in using waypoint's fade_in_time (default 0.5s), then continue with waypoint logic
                            const fadeInDuration = getAdjustedWaypointTime(waypoint, 'fade_in_time', 0.5);
                            animateLayerOpacity(cachedLayer.layer, 0, 1, fadeInDuration, function() {
                                // Check if fade animation is enabled for this waypoint
                                if (waypoint.fade_enabled) {
                                    animateFade(getAdjustedWaypointTime(waypoint, 'fade_out_time', 1.5),
                                               getAdjustedWaypointTime(waypoint, 'fade_delay', 0.5),
                                               getAdjustedWaypointTime(waypoint, 'fade_in_time', 1.5), function() {
                                        // Set up auto-advance timeout using configurable pause time
                                        if (isPlaying) {
                                            if (currentWaypoint === waypoints.length - 1 && loopTour) {
                                                console.log("End of tour reached, looping back to start");
                                                clearTimeout(waypointTimeout);
                                                const endPause = getAdjustedWaypointTimeMs(waypoint, 'end_of_tour_pause',
                                                                 getAdjustedWaypointTimeMs(waypoint, 'pause_time', 3000));
                                                waypointTimeout = setTimeout(autoAdvance, endPause);
                                            } else if (currentWaypoint < waypoints.length - 1) {
                                                // Schedule next waypoint using configurable pause time
                                                clearTimeout(waypointTimeout);
                                                const pauseTime = getAdjustedWaypointTimeMs(waypoint, 'pause_time', 2000);
                                                waypointTimeout = setTimeout(autoAdvance, pauseTime);
                                            }
                                        }
                                    });
                                } else {
                                    // No fade animation, set up auto-advance timeout using configurable pause time
                                    if (isPlaying) {
                                        if (currentWaypoint === waypoints.length - 1 && loopTour) {
                                            console.log("End of tour reached, looping back to start");
                                            clearTimeout(waypointTimeout);
                                            const endPause = getAdjustedWaypointTimeMs(waypoint, 'end_of_tour_pause',
                                                             getAdjustedWaypointTimeMs(waypoint, 'pause_time', 5000));
                                            waypointTimeout = setTimeout(autoAdvance, endPause);
                                        } else if (currentWaypoint < waypoints.length - 1) {
                                            // Schedule next waypoint using configurable pause time
                                            clearTimeout(waypointTimeout);
                                            const pauseTime = getAdjustedWaypointTimeMs(waypoint, 'pause_time', 8000);
                                            waypointTimeout = setTimeout(autoAdvance, pauseTime);
                                        }
                                    }
                                }
                            });
                            return; // Exit here, rest handled in callback
                        } else {
                            // Fallback for JPG or other layer types
                            bringLayerToFront(waypoints[index].url);
                            hideOtherLayers(waypoints[index].url, waypoints[index]);
                        }
                    } else {
                        // No URL - just pan and zoom, then set up auto-advance
                        console.log("No URL for waypoint (multi-step), setting up auto-advance only");

                        // Set up auto-advance timeout using configurable pause time
                        if (isPlaying) {
                            if (currentWaypoint === waypoints.length - 1 && loopTour) {
                                console.log("End of tour reached, looping back to start");
                                clearTimeout(waypointTimeout);
                                const endPause = getAdjustedWaypointTimeMs(waypoint, 'end_of_tour_pause',
                                                 getAdjustedWaypointTimeMs(waypoint, 'pause_time', 5000));
                                waypointTimeout = setTimeout(autoAdvance, endPause);
                            } else if (currentWaypoint < waypoints.length - 1) {
                                // Schedule next waypoint using configurable pause time
                                clearTimeout(waypointTimeout);
                                const pauseTime = getAdjustedWaypointTimeMs(waypoint, 'pause_time', 2000);
                                waypointTimeout = setTimeout(autoAdvance, pauseTime);
                            }
                        }
                    }

                });
            });
        });
    }
}

// Function to jump to a waypoint with all previous layers loaded
function jumpToWaypointWithLayers(index) {
    if (!aladin) {
        console.error('Aladin not initialized yet');
        return;
    }

    // Signal to interrupt any ongoing animation
    interruptAnimation = true;
    clearTimeout(waypointTimeout);

    // Update current waypoint state
    currentWaypoint = index;
    if (currentWaypoint < 0) currentWaypoint = 0;
    if (currentWaypoint >= waypoints.length) currentWaypoint = waypoints.length - 1;

    // Get the target waypoint data
    const waypoint = waypoints[currentWaypoint];

    // Update display info
    updateWaypointInfo();
    updateProgressBar();

    // Load all image layers from waypoint 0 up to the selected waypoint
    for (let i = 0; i <= currentWaypoint; i++) {
        const wp = waypoints[i];
        if (wp.url) {
            console.log("Ensuring layer exists for waypoint", i, ":", wp.url);
            const cachedLayer = getOrCreateLayer(wp.url);

            // Update sticky layer if this waypoint is marked as sticky
            if (wp.is_sticky) {
                console.log("Adding sticky layer from waypoint", i, ":", wp.url);
                stickyUrls.add(wp.url);
            }

            // Pre-load fade_layer if specified
            if (wp.fade_layer) {
                console.log("Pre-loading fade layer for waypoint", i, ":", wp.fade_layer);
                getOrCreateLayer(wp.fade_layer);
            }

            // For the current waypoint, bring to front
            if (i === currentWaypoint) {
                bringLayerToFront(wp.url);
                hideOtherLayers(wp.url, wp);
            }
        }
    }

    // Jump directly to the target location and FOV
    aladin.setFov(waypoint.fov);
    aladin.gotoRaDec(waypoint.ra, waypoint.dec);

    // Reset interrupt flag
    interruptAnimation = false;

    console.log(`Jumped to waypoint ${currentWaypoint + 1} with all ${currentWaypoint + 1} layers loaded`);
}

// Custom FOV animation function using setFoV
function animateFov(startFov, endFov, duration, callback) {
    const steps = 30;
    const stepDuration = duration / steps;
    let currentStep = 0;

    function doFovStep() {
        // Check if animation was interrupted
        if (interruptAnimation) {
            aladin.setFov(endFov); // Jump to final FOV
            if (callback) callback();
            return;
        }

        currentStep++;
        const progress = currentStep / steps;

        // Easing function for smoother animation
        const easedProgress = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        // Calculate current FOV
        const currentFov = startFov + (endFov - startFov) * easedProgress;

        // Set the FOV
        aladin.setFov(currentFov);

        // Continue or complete
        if (currentStep < steps) {
            setTimeout(doFovStep, stepDuration);
        } else {
            aladin.setFov(endFov); // Make sure we end at the exact target FOV
            if (callback) callback();
        }
    }

    // Start animation
    doFovStep();
}

// Fade animation function for image layers
function animateFade(fadeOutTime, fadeDelay, fadeInTime, callback) {
    const activeLayer = getCurrentActiveLayer();
    if (!activeLayer) {
        console.warn('No current image layer to fade');
        if (callback) callback();
        return;
    }

    // Fade out the layer
    animateLayerOpacity(activeLayer, 1, 0, fadeOutTime, function() {
        // Check if animation was interrupted
        if (interruptAnimation) {
            activeLayer.setOpacity(1);
            if (callback) callback();
            return;
        }

        // Wait for delay, then fade back in
        setTimeout(() => {
            if (interruptAnimation) {
                activeLayer.setOpacity(1);
                if (callback) callback();
                return;
            }

            animateLayerOpacity(activeLayer, 0, 1, fadeInTime, callback);
        }, fadeDelay * 1000);
    });
}

// Helper function to animate layer opacity
function animateLayerOpacity(layer, startOpacity, endOpacity, duration, callback) {
    const steps = 30;
    const stepDuration = duration * 1000 / steps;
    let currentStep = 0;

    function doOpacityStep() {
        if (interruptAnimation) {
            layer.setOpacity(endOpacity);
            if (callback) callback();
            return;
        }

        currentStep++;
        const progress = currentStep / steps;

        // Easing function for smoother animation
        const easedProgress = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        // Calculate current opacity
        const currentOpacity = startOpacity + (endOpacity - startOpacity) * easedProgress;

        // Set the layer opacity
        layer.setOpacity(currentOpacity);

        // Continue or complete
        if (currentStep < steps) {
            setTimeout(doOpacityStep, stepDuration);
        } else {
            layer.setOpacity(endOpacity); // Make sure we end at the exact target opacity
            // Add a small buffer to ensure the final opacity change is fully processed
            setTimeout(() => {
                if (callback) callback();
            }, 50); // 50ms buffer to ensure animation completion
        }
    }

    // Start animation
    doOpacityStep();
}

// Region editing functions
function toggleRegionEditing() {
    regionEditingEnabled = !regionEditingEnabled;

    const button = document.getElementById('region-toggle-btn');
    const instructions = document.getElementById('region-instructions');
    const controls = document.getElementById('region-controls');

    if (regionEditingEnabled) {
        button.textContent = 'Disable Regions';
        button.classList.add('active');
        instructions.classList.add('visible');
        controls.classList.add('editing');
        enableRegionEditing();
        console.log('Region editing enabled');
    } else {
        button.textContent = 'Enable Regions';
        button.classList.remove('active');
        instructions.classList.remove('visible');
        controls.classList.remove('editing');
        disableRegionEditing();
        console.log('Region editing disabled');
    }
}

function enableRegionEditing() {
    if (!aladin) return;

    // Create region overlay if it doesn't exist
    if (!regionOverlay) {
        regionOverlay = A.graphicOverlay({
            color: '#ff0000',
            lineWidth: 2,
            fillColor: 'rgba(255, 0, 0, 0.1)'
        });
        aladin.addOverlay(regionOverlay);
    }

    // Set up click handler for region drawing
    regionEditingClickHandler = function(params) {
        if (regionEditingEnabled && params && params.ra !== undefined && params.dec !== undefined) {
            addRegionPoint(params.ra, params.dec);
        }
    };

    // Add event listener for clicks on the Aladin view
    // Try different event listener approaches for Aladin Lite v3
    try {
        if (aladin.on) {
            aladin.on('click', regionEditingClickHandler);
        } else if (aladin.addEventListener) {
            aladin.addEventListener('click', regionEditingClickHandler);
        } else {
            // Fallback: attach to the DOM element
            const aladinDiv = document.getElementById('aladin-lite-div');
            if (aladinDiv) {
                aladinDiv.addEventListener('click', function(event) {
                    // Convert pixel coordinates to celestial coordinates
                    const rect = aladinDiv.getBoundingClientRect();
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;

                    // Use Aladin's coordinate conversion if available
                    if (aladin.pix2world) {
                        const coords = aladin.pix2world(x, y);
                        if (coords && coords.length >= 2) {
                            regionEditingClickHandler({ra: coords[0], dec: coords[1]});
                        }
                    }
                });
            }
        }
    } catch (e) {
        console.error('Error setting up region editing click handler:', e);
    }

    // Change cursor to indicate drawing mode
    const aladinDiv = document.getElementById('aladin-lite-div');
    if (aladinDiv) {
        aladinDiv.style.cursor = 'crosshair';
    }
}

function disableRegionEditing() {
    if (!aladin) return;

    // Remove event listener
    if (regionEditingClickHandler) {
        try {
            if (aladin.off) {
                aladin.off('click', regionEditingClickHandler);
            } else if (aladin.removeEventListener) {
                aladin.removeEventListener('click', regionEditingClickHandler);
            }
        } catch (e) {
            console.error('Error removing region editing click handler:', e);
        }
        regionEditingClickHandler = null;
    }

    // Reset cursor
    const aladinDiv = document.getElementById('aladin-lite-div');
    if (aladinDiv) {
        aladinDiv.style.cursor = 'default';
    }

    // Reset drawing state
    isDrawingRegion = false;
    currentRegionPoints = [];
}

function addRegionPoint(ra, dec) {
    currentRegionPoints.push([ra, dec]);

    if (currentRegionPoints.length === 1) {
        // First point - start drawing
        isDrawingRegion = true;
        console.log('Started drawing region at:', ra, dec);
    } else if (currentRegionPoints.length >= 3) {
        // Minimum 3 points for a polygon
        console.log('Added point to region:', ra, dec, 'Total points:', currentRegionPoints.length);

        // Check if we should close the polygon (clicked near the first point)
        const firstPoint = currentRegionPoints[0];
        const distance = Math.sqrt(Math.pow(ra - firstPoint[0], 2) + Math.pow(dec - firstPoint[1], 2));

        if (distance < 0.1) { // Close threshold of 0.1 degrees
            completeRegion();
        } else {
            updateRegionDisplay();
        }
    } else {
        console.log('Added point to region:', ra, dec, 'Total points:', currentRegionPoints.length);
        updateRegionDisplay();
    }
}

function updateRegionDisplay() {
    if (!regionOverlay || currentRegionPoints.length < 2) return;

    // Clear previous shapes
    regionOverlay.removeAll();

    // Draw lines between points
    for (let i = 0; i < currentRegionPoints.length - 1; i++) {
        try {
            const line = A.polyline([currentRegionPoints[i], currentRegionPoints[i + 1]], {
                color: '#ff0000',
                lineWidth: 2
            });
            regionOverlay.add(line);
        } catch (e) {
            console.error('Error creating polyline:', e);
        }
    }

    // Draw points
    currentRegionPoints.forEach((point, index) => {
        try {
            const marker = A.marker(point[0], point[1], {
                color: '#ff0000',
                markerSize: 8
            });
            regionOverlay.add(marker);
        } catch (e) {
            console.error('Error creating marker:', e);
        }
    });
}

function completeRegion() {
    if (currentRegionPoints.length < 3) return;

    console.log('Completing region with', currentRegionPoints.length, 'points');

    // Clear previous display
    regionOverlay.removeAll();

    // Create final polygon
    try {
        const polygon = A.polygon(currentRegionPoints, {
            color: '#ff0000',
            lineWidth: 2,
            fillColor: 'rgba(255, 0, 0, 0.1)'
        });

        regionOverlay.add(polygon);
    } catch (e) {
        console.error('Error creating polygon:', e);
        // Fallback: create polyline instead
        try {
            const polyline = A.polyline([...currentRegionPoints, currentRegionPoints[0]], {
                color: '#ff0000',
                lineWidth: 2
            });
            regionOverlay.add(polyline);
        } catch (e2) {
            console.error('Error creating fallback polyline:', e2);
        }
    }

    // Show region info
    const regionInfo = {
        points: currentRegionPoints,
        area: calculatePolygonArea(currentRegionPoints),
        center: calculatePolygonCenter(currentRegionPoints)
    };

    console.log('Region completed:', regionInfo);

    // Optional: Show region details in UI
    showRegionDetails(regionInfo);

    // Reset for next region
    currentRegionPoints = [];
    isDrawingRegion = false;
}

function calculatePolygonArea(points) {
    // Simple approximation for small regions
    if (points.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i][0] * points[j][1];
        area -= points[j][0] * points[i][1];
    }
    return Math.abs(area) / 2;
}

function calculatePolygonCenter(points) {
    if (points.length === 0) return [0, 0];

    const sumRa = points.reduce((sum, p) => sum + p[0], 0);
    const sumDec = points.reduce((sum, p) => sum + p[1], 0);

    return [sumRa / points.length, sumDec / points.length];
}

function showRegionDetails(regionInfo) {
    const message = `Region created with ${regionInfo.points.length} points\n` +
                   `Center: RA ${regionInfo.center[0].toFixed(4)}, Dec ${regionInfo.center[1].toFixed(4)}\n` +
                   `Approximate area: ${regionInfo.area.toFixed(6)} sq degrees`;

    console.log(message);

    // Optional: Show in UI (could be enhanced with a modal or info panel)
    if (confirm(message + '\n\nWould you like to create another region?')) {
        // Continue editing
    } else {
        // Stop editing
        toggleRegionEditing();
    }
}

function clearAllRegions() {
    if (regionOverlay) {
        regionOverlay.removeAll();
    }
    currentRegionPoints = [];
    isDrawingRegion = false;
    console.log('All regions cleared');
}

// Initialize tour function - called by individual HTML files
// Generic function to load waypoints from JSON file
async function loadWaypoints(waypointFile, tourConfig = {}, errorMessage = null) {
    try {
        const response = await fetch(waypointFile);
        const data = await response.json();
        waypoints = data.waypoints;

        // Process waypoints to add getImageUrl() calls where needed
        waypoints.forEach(waypoint => {
            if (waypoint.url && !waypoint.url.startsWith('http')) {
                waypoint.url = getImageUrl(waypoint.url);
            }
            if (waypoint.fade_layer && !waypoint.fade_layer.startsWith('http')) {
                waypoint.fade_layer = getImageUrl(waypoint.fade_layer);
            }
        });

        console.log('Loaded waypoints:', waypoints);

        // Initialize the tour after waypoints are loaded
        initializeTour(waypoints, tourConfig);
    } catch (error) {
        console.error('Error loading waypoints:', error);
        // Fallback: show error message
        const defaultMessage = `Error loading tour waypoints. Please check that ${waypointFile} is available.`;
        document.getElementById('loading-div').innerHTML = errorMessage || defaultMessage;
    }
}

function initializeTour(tourWaypoints, tourConfig = {}) {
    // Set the global waypoints array
    window.waypoints = tourWaypoints;

    console.log('Document loaded, waiting for A.init to complete');

    // Make controls draggable (waypoint-info is static)
    makeDraggable(document.getElementById('progress-container'));
    makeDraggable(document.getElementById('tour-controls'));

    // Make region controls draggable
    //makeDraggable(document.getElementById('region-controls'));

    // Initialize mobile info panel state
    initializeMobileInfoPanel();

    // Prevent dropdowns from being affected by draggable behavior
    const waypointDropdown = document.getElementById('waypoint-dropdown');
    const speedDropdown = document.getElementById('speed-dropdown');

    [waypointDropdown, speedDropdown].forEach(dropdown => {
        dropdown.addEventListener('mousedown', function (e) {
            e.stopPropagation(); // Stop the event from bubbling up
        });
        dropdown.addEventListener('click', function (e) {
            e.stopPropagation(); // Stop the event from bubbling up
        });
        dropdown.addEventListener('focus', function (e) {
            e.stopPropagation(); // Stop the event from bubbling up
        });
    });

    // Wait for A.init promise to complete (required for v3 API)
    A.init.then(() => {
        console.log('A.init completed, creating Aladin instance');

        const initialSurvey = getImageUrl(tourConfig.initialSurvey || '2MASS');

        aladin = A.aladin('#aladin-lite-div', {
            survey: initialSurvey,
            fov: waypoints[0].fov,
            target: waypoints[0].ra + ' ' + waypoints[0].dec,
            cooFrame: (tourConfig.cooFrame || 'GAL'),
            showReticle: false,
            showZoomControl: true,
            showFullscreenControl: true,
            showLayersControl: true,
            showGotoControl: true,
            showFrame: true,
            showCooGrid: false,
            showSimbadPointerControl: true,
            showSettingsControl: true,
            showShareControl: true,
        });

        // Initialize the first layer using our caching system
        const initialCachedLayer = getOrCreateLayer(initialSurvey);
        bringLayerToFront(initialSurvey);

        // Also cache the first waypoint's layer if it's different
        if (waypoints[0].url && waypoints[0].url !== initialSurvey) {
            getOrCreateLayer(waypoints[0].url);
        }

        // Hide loading message
        document.getElementById('loading-div').style.display = 'none';

        // Populate waypoint dropdown
        populateWaypointDropdown();

        // Check for URL hash and jump to that waypoint if present
        const hashWaypoint = getWaypointFromHash();
        if (hashWaypoint >= 0) {
            console.log('Found URL hash, jumping to waypoint:', hashWaypoint);
            updateWaypointInfo();
            updateProgressBar();
            jumpToWaypointWithLayers(hashWaypoint);
        } else {
            updateWaypointInfo();
            updateProgressBar();
            goToWaypointFast(0);
        }

        // Set up browser back/forward navigation handling
        window.addEventListener('popstate', handleHashChange);
        window.addEventListener('hashchange', handleHashChange);

        // Set up event listeners for the buttons
        document.getElementById('prev-btn').addEventListener('click', function () {
            isPlaying = false;
            clearTimeout(waypointTimeout);
            stopCountdown();
            updatePlayPauseButton();
            goToWaypoint(currentWaypoint - 1);
        });

        document.getElementById('next-btn').addEventListener('click', function () {
            if (currentWaypoint === waypoints.length - 1) {
                // If at the last waypoint, reset to the beginning
                isPlaying = false;
                clearTimeout(waypointTimeout);
                stopCountdown();
                updatePlayPauseButton();
                goToWaypoint(0);
                return;
            }

            // Just advance to next waypoint without auto-playing
            isPlaying = false;
            clearTimeout(waypointTimeout);
            stopCountdown();
            updatePlayPauseButton();
            goToWaypoint(currentWaypoint + 1);
        });

        document.getElementById('start-btn').addEventListener('click', function () {
            if (isPlaying) {
                // Pause the tour
                pauseTour();
            } else {
                // Start/resume the tour
                startTour();
            }
        });

        document.getElementById('reset-btn').addEventListener('click', function () {
            isPlaying = false;
            clearTimeout(waypointTimeout);
            stopCountdown();
            updatePlayPauseButton();

            // Reset speed multiplier to normal speed
            speedMultiplier = 1;
            document.getElementById('speed-dropdown').value = "1";
            console.log("Speed reset to normal (1×)");

            goToWaypoint(0);
        });

        document.getElementById('share-btn').addEventListener('click', function () {
            // Copy current URL to clipboard
            const shareableUrl = window.location.href;
            navigator.clipboard.writeText(shareableUrl).then(function() {
                // Show brief feedback
                const btn = document.getElementById('share-btn');
                const originalTitle = btn.title;
                const originalContent = btn.innerHTML;

                btn.title = 'Link copied!';
                btn.innerHTML = '✓';
                btn.style.color = '#4CAF50';

                setTimeout(function() {
                    btn.title = originalTitle;
                    btn.innerHTML = originalContent;
                    btn.style.color = '';
                }, 2000);

                console.log('Copied shareable URL to clipboard:', shareableUrl);
            }).catch(function(err) {
                console.error('Failed to copy URL to clipboard:', err);
                // Fallback: select the URL text
                prompt('Copy this shareable link:', shareableUrl);
            });
        });

        // Set up waypoint dropdown event listener
        document.getElementById('waypoint-dropdown').addEventListener('change', function () {
            const selectedIndex = parseInt(this.value);
            if (!isNaN(selectedIndex)) {
                isPlaying = false;
                clearTimeout(waypointTimeout);
                stopCountdown();
                updatePlayPauseButton();
                jumpToWaypointWithLayers(selectedIndex);
                // Reset dropdown to default after selection
                this.selectedIndex = 0;
            }
        });

        // Set up speed dropdown event listener
        document.getElementById('speed-dropdown').addEventListener('change', function () {
            const selectedSpeed = parseFloat(this.value);
            if (!isNaN(selectedSpeed) && selectedSpeed > 0) {
                speedMultiplier = selectedSpeed;
                console.log("Speed multiplier set to:", speedMultiplier);

                // If currently playing, restart countdown with new timing
                if (isPlaying && countdownEndTime) {
                    const remainingTime = countdownEndTime - Date.now();
                    if (remainingTime > 0) {
                        // Adjust remaining time based on new speed
                        const adjustedTime = remainingTime / speedMultiplier;
                        startCountdown(adjustedTime);
                    }
                }
            }
        });

        // Set up region editing toggle button event listener
        document.getElementById('region-toggle-btn').addEventListener('click', function () {
            toggleRegionEditing();
        });
    }).catch(err => {
        console.error('Failed to initialize Aladin:', err);
        document.getElementById('loading-div').textContent = 'Error loading Aladin. Please refresh the page.';
    });
}