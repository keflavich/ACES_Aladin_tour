/**
 * Makes an HTML element draggable.
 * @param {HTMLElement} element - The element to make draggable
 */
function makeDraggable(element) {
    if (!element) return;

    element.addEventListener('mousedown', function(e) {
        isDragging = true;
        currentDragElement = element;

        const rect = element.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;

        element.classList.add('dragging');
        e.preventDefault();
    });

    element.addEventListener('touchstart', function(e) {
        isDragging = true;
        currentDragElement = element;

        const rect = element.getBoundingClientRect();
        const touch = e.touches[0];
        dragOffset.x = touch.clientX - rect.left;
        dragOffset.y = touch.clientY - rect.top;

        element.classList.add('dragging');
        e.preventDefault();
    });
}

// Global mouse/touch move handlers
document.addEventListener('mousemove', function(e) {
    if (!isDragging || !currentDragElement) return;

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    currentDragElement.style.left = newX + 'px';
    currentDragElement.style.top = newY + 'px';
});

document.addEventListener('touchmove', function(e) {
    if (!isDragging || !currentDragElement) return;

    const touch = e.touches[0];
    const newX = touch.clientX - dragOffset.x;
    const newY = touch.clientY - dragOffset.y;

    currentDragElement.style.left = newX + 'px';
    currentDragElement.style.top = newY + 'px';
    e.preventDefault();
});

// Global mouse/touch up handlers
document.addEventListener('mouseup', function() {
    if (isDragging && currentDragElement) {
        currentDragElement.classList.remove('dragging');
        isDragging = false;
        currentDragElement = null;
    }
});

document.addEventListener('touchend', function() {
    if (isDragging && currentDragElement) {
        currentDragElement.classList.remove('dragging');
        isDragging = false;
        currentDragElement = null;
    }
});

// Basic draggable functionality for tour elements
let isDragging = false;
let currentDragElement = null;
let dragOffset = { x: 0, y: 0 };

// Initialize draggable functionality when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Make elements with draggable class draggable
    const draggableElements = document.querySelectorAll('.draggable');
    draggableElements.forEach(element => {
        makeDraggable(element);
    });
});