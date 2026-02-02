/**
 * Tab Suspender Pro - Suspended Page JavaScript
 * Handles tab info display and restoration
 */

// Get URL parameters
const params = new URLSearchParams(window.location.search);
const originalUrl = params.get('url');
const title = params.get('title') || 'Suspended Tab';
// Note: URLSearchParams.get() already decodes, so no need for decodeURIComponent
const faviconParam = params.get('favicon');
const favicon = faviconParam || '';
const suspendedAt = parseInt(params.get('time')) || Date.now();

// DOM Elements
const pageTitle = document.getElementById('pageTitle');
const pageFavicon = document.getElementById('pageFavicon');
const faviconImg = document.getElementById('favicon');
const tabTitle = document.getElementById('tabTitle');
const tabUrl = document.getElementById('tabUrl');
const memorySaved = document.getElementById('memorySaved');
const timeSuspended = document.getElementById('timeSuspended');

// Initialize page
function init() {
    // Set page title
    pageTitle.textContent = `${title} (Suspended)`;

    // Set favicon with placeholder fallback
    if (favicon) {
        pageFavicon.href = favicon;
        faviconImg.src = favicon;
        faviconImg.style.display = 'block';
        // Handle favicon load error - show placeholder
        faviconImg.onerror = function() {
            // Use a generic globe icon as placeholder (data URI)
            this.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCI+PC9jaXJjbGU+PGxpbmUgeDE9IjIiIHkxPSIxMiIgeDI9IjIyIiB5Mj0iMTIiPjwvbGluZT48cGF0aCBkPSJNMTIgMmExNS4zIDE1LjMgMCAwIDEgNCAxMCAxNS4zIDE1LjMgMCAwIDEtNCAxMCAxNS4zIDE1LjMgMCAwIDEtNC0xMCAxNS4zIDE1LjMgMCAwIDEgNC0xMHoiPjwvcGF0aD48L3N2Zz4=';
            this.onerror = null; // Prevent infinite loop
        };
    } else {
        // No favicon provided - show placeholder
        faviconImg.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCI+PC9jaXJjbGU+PGxpbmUgeDE9IjIiIHkxPSIxMiIgeDI9IjIyIiB5Mj0iMTIiPjwvbGluZT48cGF0aCBkPSJNMTIgMmExNS4zIDE1LjMgMCAwIDEgNCAxMCAxNS4zIDE1LjMgMCAwIDEtNCAxMCAxNS4zIDE1LjMgMCAwIDEtNC0xMCAxNS4zIDE1LjMgMCAwIDEgNC0xMHoiPjwvcGF0aD48L3N2Zz4=';
        faviconImg.style.display = 'block';
    }

    // Set tab info
    tabTitle.textContent = title;
    tabUrl.textContent = getDomain(originalUrl);

    // Set memory saved - dynamic estimate based on tab complexity
    memorySaved.textContent = estimateMemorySaved(originalUrl);

    // Update time suspended
    updateTimeSuspended();
    setInterval(updateTimeSuspended, 1000);

    // Set up restoration handlers
    setupRestoreHandlers();
}

// Get domain from URL
function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return url || 'Unknown';
    }
}

// Estimate memory saved based on the type of site
function estimateMemorySaved(url) {
    if (!url) return '~50 MB';

    try {
        const hostname = new URL(url).hostname.toLowerCase();

        // Heavy sites (video streaming, social media feeds)
        const heavySites = ['youtube.com', 'netflix.com', 'twitch.tv', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com', 'reddit.com'];
        if (heavySites.some(site => hostname.includes(site))) {
            return '~150-300 MB';
        }

        // Medium sites (web apps, news with media)
        const mediumSites = ['gmail.com', 'google.com', 'docs.google.com', 'notion.so', 'figma.com', 'slack.com', 'discord.com', 'linkedin.com'];
        if (mediumSites.some(site => hostname.includes(site))) {
            return '~80-150 MB';
        }

        // Light sites (simple pages, documentation)
        const lightSites = ['github.com', 'stackoverflow.com', 'wikipedia.org', 'medium.com'];
        if (lightSites.some(site => hostname.includes(site))) {
            return '~30-60 MB';
        }

        // Default estimate for unknown sites
        return '~50-100 MB';
    } catch {
        return '~50 MB';
    }
}

// Update time suspended display
function updateTimeSuspended() {
    const elapsed = Date.now() - suspendedAt;
    timeSuspended.textContent = formatDuration(elapsed);
}

// Format duration to human readable
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    if (seconds > 0) {
        return `${seconds}s`;
    }
    return 'Just now';
}

// Set up restore handlers
function setupRestoreHandlers() {
    // Click anywhere to restore
    document.addEventListener('click', (e) => {
        // Don't restore when clicking external links
        if (e.target.closest('a[target="_blank"]')) return;
        restore();
    });

    // Press any key to restore
    document.addEventListener('keydown', (e) => {
        // Ignore modifier keys and common shortcuts
        if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta') return;
        if (e.ctrlKey || e.metaKey) return;
        restore();
    });
}

// Flag to prevent double-click race condition
let isRestoring = false;

// Restore the original tab
async function restore() {
    // Prevent multiple restoration attempts
    if (isRestoring) return;
    isRestoring = true;

    if (!originalUrl) {
        isRestoring = false;
        console.error('No original URL to restore');
        showError('Cannot restore tab - URL not found. Please close this tab.');
        return;
    }

    // Validate URL before redirect (security fix)
    try {
        const urlObj = new URL(originalUrl);

        // Only allow http/https protocols (prevent javascript:, data:, etc.)
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            console.error('Invalid protocol for restore:', urlObj.protocol);
            showError('Cannot restore this tab - invalid URL protocol');
            return;
        }
    } catch (e) {
        isRestoring = false;
        console.error('Invalid URL:', originalUrl);
        showError('Cannot restore this tab - invalid URL. Please close this tab.');
        return;
    }

    // Add visual feedback
    document.body.style.opacity = '0.5';
    document.body.style.pointerEvents = 'none';

    try {
        // Navigate to original URL using replace() to prevent back-button loop
        window.location.replace(originalUrl);
    } catch (error) {
        isRestoring = false;
        console.error('Failed to restore tab:', error);
        showError('Failed to restore tab. Please close this tab.');
    }
}

// Show error message to user
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #ef4444; color: white; padding: 12px 24px; border-radius: 8px; font-size: 14px; z-index: 9999;';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

// Also initialize immediately if DOM already loaded
if (document.readyState !== 'loading') {
    init();
}
