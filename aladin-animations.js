/**
 * Aladin Lite Animation Module
 * This module contains functions for smooth animations in Aladin Lite
 */

// Convert galactic coordinates to equatorial (RA/Dec)
function galacticToEquatorial(lon, lat, aladin) {
    // Define known reference points with accurate conversions
    const referencePoints = [
        {
            // Sgr A*
            gal: { lon: 359.944, lat: -0.046 },
            eq: { ra: 266.4168, dec: -29.0078 } // 17h45m40s, -29°00'28"
        },
        {
            // Sgr B2
            gal: { lon: 0.6667, lat: -0.0362 },
            eq: { ra: 266.8350, dec: -28.3853 } // 17h47m20.4s, -28°23'07"
        },
        {
            // MUBLO
            gal: { lon: 0.02467, lat: -0.0727 },
            eq: { ra: 266.4906, dec: -28.9530 }
        }
    ];

    // Check if we have an exact reference point match
    for (const ref of referencePoints) {
        if (Math.abs(lon - ref.gal.lon) < 0.001 && Math.abs(lat - ref.gal.lat) < 0.001) {
            console.log(`Using exact reference point for (${lon}, ${lat}) → (${ref.eq.ra}, ${ref.eq.dec})`);
            return { ra: ref.eq.ra, dec: ref.eq.dec };
        }
    }

    // First check if Aladin has built-in conversion
    if (aladin && typeof aladin.gal2J2000 === 'function') {
        try {
            const result = aladin.gal2J2000(lon, lat);
            console.log(`Using Aladin's built-in conversion for (${lon}, ${lat}) → (${result.ra}, ${result.dec})`);
            return result;
        } catch (e) {
            console.warn('Failed to use Aladin conversion:', e);
            // Fall through to other methods
        }
    }

    // Check if astronomy.js is available
    if (typeof Astronomy !== 'undefined') {
        try {
            console.log('Using astronomy.js for coordinate conversion');
            // Create a Galactic position
            const galactic = new Astronomy.Galactic(lon, lat);

            // Convert to equatorial
            const equatorial = galactic.toEquatorial();

            return {
                ra: equatorial.ra,
                dec: equatorial.dec
            };
        } catch (e) {
            console.warn('Failed to use astronomy.js conversion:', e);
        }
    }

    // Use interpolation between known reference points
    console.log('Using interpolation between reference points');

    // Find the closest reference point
    let closestRef = referencePoints[0];
    let minDist = Number.MAX_VALUE;

    for (const ref of referencePoints) {
        const dist = Math.sqrt(
            Math.pow(lon - ref.gal.lon, 2) +
            Math.pow(lat - ref.gal.lat, 2)
        );
        if (dist < minDist) {
            minDist = dist;
            closestRef = ref;
        }
    }

    // Handle the case where longitude wraps around 0/360
    let dLon = lon - closestRef.gal.lon;
    if (Math.abs(dLon) > 180) {
        if (dLon > 0) {
            dLon = dLon - 360;
        } else {
            dLon = dLon + 360;
        }
    }

    const dLat = lat - closestRef.gal.lat;

    // Conversion factors for the Galactic Center region, based on the two reference points
    const raPerLon = 0.63;   // About 0.63° in RA per 1° in galactic longitude
    const decPerLat = 1.62;  // About 1.62° in Dec per 1° in galactic latitude
    const raPerLat = 0;      // Cross-terms are small and can be neglected
    const decPerLon = -1.05; // About -1.05° in Dec per 1° in galactic longitude

    // Calculate new RA and Dec using the offset and conversion factors
    const ra = closestRef.eq.ra + dLon * raPerLon + dLat * raPerLat;
    const dec = closestRef.eq.dec + dLon * decPerLon + dLat * decPerLat;

    console.log(`Interpolated coordinates for (${lon}, ${lat}) → (${ra.toFixed(4)}, ${dec.toFixed(4)})`);
    return { ra, dec };
}

// Format RA/Dec in sexagesimal notation
function formatRADec(decimal, isRA) {
    // For RA: hours (0-24), minutes, seconds
    // For Dec: degrees (-90 to +90), minutes, seconds
    let value = decimal;

    if (isRA) {
        // Convert degrees to hours (24 hours = 360 degrees)
        value = value / 15;

        // Ensure 0-24 range
        while (value < 0) value += 24;
        while (value >= 24) value -= 24;
    }

    // Get the degree/hour component
    const primary = Math.floor(Math.abs(value));

    // Get the minutes
    const minDecimal = (Math.abs(value) - primary) * 60;
    const minutes = Math.floor(minDecimal);

    // Get the seconds
    const seconds = ((minDecimal - minutes) * 60).toFixed(1);

    // Format the result with the correct sign
    const sign = (value < 0 && !isRA) ? '-' : '';

    if (isRA) {
        return `${sign}${primary.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(4, '0')}s`;
    } else {
        return `${sign}${primary.toString().padStart(2, '0')}° ${minutes.toString().padStart(2, '0')}' ${seconds.toString().padStart(4, '0')}"`;
    }
}

// Go to a specific waypoint
function goToWaypoint(waypoint, aladin, tourInfoDiv, tourTitle, tourDescription) {
    if (!aladin) {
        console.error('Aladin not initialized yet');
        return;
    }

    try {
        // Go to the position in galactic coordinates
        aladin.gotoPosition(
            waypoint.galacticCoords.lon,
            waypoint.galacticCoords.lat,
            'galactic'
        );
        aladin.setFoV(waypoint.fov);
        showTourInfo(waypoint, tourInfoDiv, tourTitle, tourDescription);
    } catch (e) {
        console.error('Error going to waypoint:', e);
    }
}

// Display tour information
function showTourInfo(waypoint, tourInfoDiv, tourTitle, tourDescription) {
    tourTitle.textContent = waypoint.title;
    tourDescription.innerHTML = waypoint.description;
    tourInfoDiv.classList.remove('hidden');
}

// Animate between waypoints using Aladin's built-in animateToRaDec
function animateToWaypoint(fromWaypoint, toWaypoint, durationMs, aladin, tourInfoDiv, tourTitle, tourDescription, callback) {
    if (!aladin) {
        console.log("Aladin not initialized");
        if (typeof callback === 'function') callback();
        return;
    }
    
    // Create a safe callback function
    const safeCallback = typeof callback === 'function' ? callback : function() {};

    // Convert galactic coordinates to RA/Dec
    const fromCoords = galacticToEquatorial(
        fromWaypoint.galacticCoords.lon,
        fromWaypoint.galacticCoords.lat,
        aladin
    );

    const toCoords = galacticToEquatorial(
        toWaypoint.galacticCoords.lon,
        toWaypoint.galacticCoords.lat,
        aladin
    );

    console.log(`Starting animation from Gal(${fromWaypoint.galacticCoords.lon}, ${fromWaypoint.galacticCoords.lat}) = Eq(${fromCoords.ra.toFixed(4)}, ${fromCoords.dec.toFixed(4)})`);
    console.log(`                  to Gal(${toWaypoint.galacticCoords.lon}, ${toWaypoint.galacticCoords.lat}) = Eq(${toCoords.ra.toFixed(4)}, ${toCoords.dec.toFixed(4)})`);

    // Show starting waypoint info
    showTourInfo(fromWaypoint, tourInfoDiv, tourTitle, tourDescription);

    // Original FOV for initial zoom out (we'll use the first waypoint's FOV as our "full view")
    const originalFov = 1.5; // This should ideally be passed in or determined from the tour

    // Animation sequence divided into three phases:
    // 1. Zoom out to original FOV (0.5 seconds)
    // 2. Animate to new position (half of remaining time)
    // 3. Zoom to target FOV (half of remaining time)
    const zoomOutTime = 0.5; // seconds
    const remainingTime = durationMs / 1000 - zoomOutTime; // seconds
    const positionAnimationTime = remainingTime / 2; // seconds
    const zoomInTime = remainingTime / 2; // seconds

    console.log(`Animation sequence: ${zoomOutTime}s zoom out, ${positionAnimationTime}s position change, ${zoomInTime}s zoom in`);

    // Check if the current FOV is already close to original FOV to avoid unnecessary animation
    if (Math.abs(fromWaypoint.fov - originalFov) < 0.1) {
        console.log("Current FOV already close to target zoom-out FOV, skipping first animation phase");
        // Skip straight to position animation
        aladin.setFoV(originalFov);
        
        console.log(`Moving to new position in ${positionAnimationTime}s`);
        try {
            // Try to use Aladin's built-in animation if available
            aladin.animateToRaDec(toCoords.ra, toCoords.dec, positionAnimationTime);
        } catch (e) {
            console.error("Error using animateToRaDec:", e);
            // Fallback to manual position animation
            animatePosition(fromCoords, toCoords, positionAnimationTime, aladin);
        }
        
        // Wait for position animation to complete
        setTimeout(() => {
            // Update tour info after position change
            showTourInfo(toWaypoint, tourInfoDiv, tourTitle, tourDescription);
            
            // Phase 3: Finally zoom to the target FOV
            console.log(`Zooming to target FOV ${toWaypoint.fov} in ${zoomInTime}s`);
            animateFov(originalFov, toWaypoint.fov, zoomInTime * 1000, aladin, safeCallback);
        }, positionAnimationTime * 1000);
        
        return;
    }

    // If we need the full animation sequence
    console.log(`Zooming out to FOV ${originalFov} in ${zoomOutTime}s`);
    
    // Explicitly set FOV first to ensure the start value is correct
    aladin.setFoV(fromWaypoint.fov);
    
    // Phase 1: First zoom out to the original FOV quickly
    console.log(`Zooming out to FOV ${originalFov} in ${zoomOutTime}s`);
    animateFov(fromWaypoint.fov, originalFov, zoomOutTime * 1000, aladin, () => {
        // Phase 2: Then animate to the new position
        console.log(`Moving to new position in ${positionAnimationTime}s`);
        
        try {
            // Try to use Aladin's built-in animation if available
            aladin.animateToRaDec(toCoords.ra, toCoords.dec, positionAnimationTime);
            
            // Wait for position animation to complete
            setTimeout(() => {
                // Update tour info after position change
                showTourInfo(toWaypoint, tourInfoDiv, tourTitle, tourDescription);
    
                // Phase 3: Finally zoom to the target FOV
                console.log(`Zooming to target FOV ${toWaypoint.fov} in ${zoomInTime}s`);
                animateFov(originalFov, toWaypoint.fov, zoomInTime * 1000, aladin, safeCallback);
            }, positionAnimationTime * 1000);
        } catch (e) {
            console.error("Error using animateToRaDec:", e);
            // Fallback to manual position animation
            animatePosition(fromCoords, toCoords, positionAnimationTime, aladin, () => {
                // Update tour info after position change
                showTourInfo(toWaypoint, tourInfoDiv, tourTitle, tourDescription);
    
                // Phase 3: Finally zoom to the target FOV
                console.log(`Zooming to target FOV ${toWaypoint.fov} in ${zoomInTime}s`);
                animateFov(originalFov, toWaypoint.fov, zoomInTime * 1000, aladin, safeCallback);
            });
        }
    });
    
    console.log("Animation sequence initiated for " + toWaypoint.title);
}

// Animate FOV change over time
function animateFov(startFov, endFov, duration, aladin, callback) {
    // Ensure callback is a function or use an empty function
    const safeCallback = typeof callback === 'function' ? callback : function() {};
    
    // Validate parameters
    if (!aladin || typeof aladin.setFoV !== 'function') {
        console.error("Invalid Aladin instance in animateFov");
        safeCallback(); // Call the callback anyway to continue the chain
        return;
    }
    
    // Handle array inputs for FOV parameters by taking first element
    let startFovValue = startFov;
    let endFovValue = endFov;
    
    // Handle startFov
    if (Array.isArray(startFovValue)) {
        startFovValue = startFovValue[0] || 1.0;
        console.log("startFov is an array, using first value:", startFovValue);
    }
    
    // Handle endFov
    if (Array.isArray(endFovValue)) {
        endFovValue = endFovValue[0] || 1.0;
        console.log("endFov is an array, using first value:", endFovValue);
    }
    
    // Ensure we have valid numbers
    if (typeof startFovValue !== 'number' || isNaN(startFovValue)) {
        console.warn("Invalid startFov, using default:", startFovValue);
        startFovValue = 1.0;
    }
    
    if (typeof endFovValue !== 'number' || isNaN(endFovValue)) {
        console.warn("Invalid endFov, using default:", endFovValue);
        endFovValue = 1.0;
    }
    
    // Handle identical FOVs to avoid unnecessary animation
    if (Math.abs(startFovValue - endFovValue) < 0.0001) {
        console.log("Skipping FOV animation as start and end are the same");
        try {
            aladin.setFoV(endFovValue);
        } catch (e) {
            console.error("Error setting FOV:", e);
        }
        safeCallback();
        return;
    }
    
    const steps = 20;
    const stepDuration = duration / steps;
    let currentStep = 0;
    console.log("animateFov", startFovValue, endFovValue, duration);

    function doFovStep() {
        try {
            currentStep++;
            const progress = currentStep / steps;

            // Easing function
            const easedProgress = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            // Calculate current FOV
            const currentFov = startFovValue + (endFovValue - startFovValue) * easedProgress;

            // Set the FOV
            aladin.setFoV(currentFov);

            // Continue or complete
            if (currentStep < steps) {
                setTimeout(doFovStep, stepDuration);
            } else {
                aladin.setFoV(endFovValue); // Make sure we end at the exact target FOV
                console.log("FOV animation complete:", endFovValue);
                safeCallback(); // Use the safe callback that's guaranteed to be a function
            }
        } catch (error) {
            console.error("Error in FOV animation step:", error);
            // Ensure the callback is called even if there's an error
            safeCallback();
        }
    }

    // Start FOV animation
    try {
        setTimeout(doFovStep, 10);
    } catch (error) {
        console.error("Error starting FOV animation:", error);
        safeCallback();
    }
}

// Calculate appropriate animation duration based on distance and FOV change
function calculateAnimationDuration(fromWaypoint, toWaypoint, aladin) {
    // Convert to equatorial for consistent distance calculation
    const fromCoords = galacticToEquatorial(
        fromWaypoint.galacticCoords.lon,
        fromWaypoint.galacticCoords.lat,
        aladin
    );

    const toCoords = galacticToEquatorial(
        toWaypoint.galacticCoords.lon,
        toWaypoint.galacticCoords.lat,
        aladin
    );

    // Calculate angular distance (simplified)
    const dRa = Math.abs(toCoords.ra - fromCoords.ra);
    const dDec = Math.abs(toCoords.dec - fromCoords.dec);
    const distance = Math.sqrt(dRa * dRa + dDec * dDec);

    // Calculate FOV change
    const fovChange = Math.abs(toWaypoint.fov - fromWaypoint.fov);

    // Base duration on distance and FOV change
    // More distance or FOV change = more time needed
    const baseDuration = 2000; // Base 2 seconds
    const distanceFactor = distance * 50; // Increase time with distance
    const fovFactor = fovChange * 1000; // Increase time with FOV change

    // Calculate total duration, min 1.5s, max 8s
    const duration = Math.min(8000, Math.max(1500, baseDuration + distanceFactor + fovFactor));

    console.log(`Animation duration from "${fromWaypoint.title}" to "${toWaypoint.title}": ${duration}ms`);
    return duration;
}

// Animate position change manually over time
function animatePosition(fromCoords, toCoords, durationSecs, aladin, callback) {
    console.log("Using manual position animation");
    
    // Ensure callback is a function or use an empty function
    const safeCallback = typeof callback === 'function' ? callback : function() {};
    
    const steps = 30; // More steps for smoother animation
    const stepDuration = (durationSecs * 1000) / steps;
    let currentStep = 0;
    
    // Precalculate the distance to be covered
    const dRa = toCoords.ra - fromCoords.ra;
    const dDec = toCoords.dec - fromCoords.dec;
    
    console.log(`Animating position from (${fromCoords.ra}, ${fromCoords.dec}) to (${toCoords.ra}, ${toCoords.dec})`);
    
    function doPositionStep() {
        try {
            currentStep++;
            const progress = currentStep / steps;
            
            // Easing function (ease in-out)
            const easedProgress = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            
            // Calculate current position
            const ra = fromCoords.ra + dRa * easedProgress;
            const dec = fromCoords.dec + dDec * easedProgress;
            
            // Set the position
            aladin.gotoRaDec(ra, dec);
            
            // Continue or complete
            if (currentStep < steps) {
                setTimeout(doPositionStep, stepDuration);
            } else {
                // Make sure we end at the exact target position
                aladin.gotoRaDec(toCoords.ra, toCoords.dec);
                console.log("Position animation complete");
                safeCallback();
            }
        } catch (error) {
            console.error("Error in position animation step:", error);
            // Ensure the callback is called even if there's an error
            aladin.gotoRaDec(toCoords.ra, toCoords.dec);
            safeCallback();
        }
    }
    
    // Start position animation
    setTimeout(doPositionStep, 10);
}

// Export functions for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        galacticToEquatorial,
        formatRADec,
        goToWaypoint,
        showTourInfo,
        animateToWaypoint,
        animateFov,
        animatePosition,
        calculateAnimationDuration
    };
} else {
    // In browser environment, attach to window
    window.AladinAnimations = {
        galacticToEquatorial,
        formatRADec,
        goToWaypoint,
        showTourInfo,
        animateToWaypoint,
        animateFov,
        animatePosition,
        calculateAnimationDuration
    };
} 