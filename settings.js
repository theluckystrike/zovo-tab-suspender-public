/**
 * Tab Suspender Pro - Settings Page JavaScript
 * Redesigned with Smart Defaults approach
 */

// DOM Elements - Header
const backBtn = document.getElementById('backBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

// DOM Elements - Profile Selection
const profileSelector = document.getElementById('profileSelector');
const profileStatus = document.getElementById('profileStatus');

// DOM Elements - Custom Timing (PRO)
const customTimingSection = document.getElementById('customTimingSection');
const unlockCustomTimingBtn = document.getElementById('unlockCustomTimingBtn');
const customTimingSlider = document.getElementById('customTimingSlider');
const timeoutSlider = document.getElementById('timeout');
const timeoutValue = document.getElementById('timeoutValue');

// DOM Elements - Protection
const customizeProtectionBtn = document.getElementById('customizeProtectionBtn');
const protectionChevron = document.getElementById('protectionChevron');
const protectionSettings = document.getElementById('protectionSettings');
const badgeAudio = document.getElementById('badgeAudio');
const badgeForms = document.getElementById('badgeForms');
const badgePinned = document.getElementById('badgePinned');
const badgeActive = document.getElementById('badgeActive');
const neverAudio = document.getElementById('neverAudio');
const neverForms = document.getElementById('neverForms');
const neverPinned = document.getElementById('neverPinned');
const neverActive = document.getElementById('neverActive');
const autoRestore = document.getElementById('autoRestore');

// DOM Elements - Whitelist
const addCurrentSiteBtn = document.getElementById('addCurrentSiteBtn');
const whitelistItems = document.getElementById('whitelistItems');
const newDomainInput = document.getElementById('newDomain');
const addDomainBtn = document.getElementById('addDomainBtn');

// DOM Elements - Impact
const impactValue = document.getElementById('impactValue');
const impactRank = document.getElementById('impactRank');
const viewStatsBtn = document.getElementById('viewStatsBtn');

// DOM Elements - License
const licenseSection = document.getElementById('licenseSection');
const licensePrompt = document.getElementById('licensePrompt');
const licenseActive = document.getElementById('licenseActive');
const activateLicenseBtn = document.getElementById('activateLicenseBtn');
const licenseKeyDisplay = document.getElementById('licenseKeyDisplay');

// DOM Elements - License Modal
const licenseModal = document.getElementById('licenseModal');
const licenseModalClose = document.getElementById('licenseModalClose');
const licenseInput = document.getElementById('licenseInput');
const licenseStatus = document.getElementById('licenseStatus');
const activateBtn = document.getElementById('activateBtn');

// DOM Elements - Toast
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// State
let settings = {};
let isPro = false;
let currentProfile = 'balanced';

// Pro tier limits
const MAX_FREE_WHITELIST = 5;

// Profile configurations
const PROFILES = {
    relaxed: { timeout: 60, name: 'Relaxed', desc: '60 min' },
    balanced: { timeout: 30, name: 'Balanced', desc: '30 min' },
    aggressive: { timeout: 15, name: 'Aggressive', desc: '15 min' }
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await checkProStatus();
    await loadSettings();
    await loadStats();
    setupEventListeners();
    updateUI();
});

// Check Pro status
async function checkProStatus() {
    try {
        const result = await chrome.storage.local.get(['isPro', 'licenseKey']);
        isPro = result.isPro || false;

        if (isPro && result.licenseKey) {
            // Show active license (with null checks)
            if (licensePrompt) licensePrompt.style.display = 'none';
            if (licenseActive) licenseActive.style.display = 'flex';
            if (licenseKeyDisplay) licenseKeyDisplay.textContent = maskLicenseKey(result.licenseKey);

            // Show custom timing slider (with null checks)
            if (unlockCustomTimingBtn) unlockCustomTimingBtn.style.display = 'none';
            if (customTimingSlider) customTimingSlider.style.display = 'flex';
        }
    } catch (error) {
        console.error('Error checking Pro status:', error);
        isPro = false;
    }
}

// Load settings
async function loadSettings() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        settings = response.settings || {};

        // Determine current profile based on timeout
        const timeout = settings.suspensionTimeout || 30;
        if (timeout >= 60) {
            currentProfile = 'relaxed';
        } else if (timeout <= 15) {
            currentProfile = 'aggressive';
        } else {
            currentProfile = 'balanced';
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
        showToast('Failed to load settings', 'error');
    }
}

// Load stats
async function loadStats() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
        const totalSaved = response.totalSaved || 0;
        const lifetimeTabs = response.lifetimeTabsSuspended || 0;

        // Format bytes to human readable (with null check)
        if (impactValue) impactValue.textContent = formatBytes(totalSaved);

        // Calculate rank (placeholder - could be enhanced with actual percentile calculation)
        if (impactRank) {
            if (totalSaved > 5 * 1024 * 1024 * 1024) { // 5GB
                impactRank.textContent = "You're in the top 1% of users";
            } else if (totalSaved > 2 * 1024 * 1024 * 1024) { // 2GB
                impactRank.textContent = "You're in the top 5% of users";
            } else if (totalSaved > 1024 * 1024 * 1024) { // 1GB
                impactRank.textContent = "You're in the top 15% of users";
            } else if (totalSaved > 500 * 1024 * 1024) { // 500MB
                impactRank.textContent = "You're in the top 30% of users";
            } else {
                impactRank.textContent = `${lifetimeTabs} tabs suspended total`;
            }
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Update UI based on settings
function updateUI() {
    // Update profile selector
    updateProfileSelector();

    // Update protection toggles
    neverAudio.checked = settings.neverSuspendAudio !== false;
    neverForms.checked = settings.neverSuspendUnsavedForms !== false;
    neverPinned.checked = settings.suspendPinnedTabs === false;
    neverActive.checked = settings.neverSuspendActiveTab !== false;
    autoRestore.checked = settings.autoUnsuspendOnFocus !== false;

    // Update protection badges
    updateProtectionBadges();

    // Update timeout slider (for PRO users)
    if (timeoutSlider) {
        timeoutSlider.value = settings.suspensionTimeout || 30;
        updateTimeoutDisplay();
    }

    // Update whitelist
    renderWhitelist();
}

// Update profile selector UI
function updateProfileSelector() {
    const buttons = profileSelector.querySelectorAll('.profile-btn');
    buttons.forEach(btn => {
        const profile = btn.dataset.profile;
        btn.classList.toggle('active', profile === currentProfile);
    });

    const timeout = PROFILES[currentProfile]?.timeout || 30;
    profileStatus.innerHTML = `Currently: Tabs sleep after <strong>${timeout} minutes</strong>`;
}

// Update protection badges based on toggle states
function updateProtectionBadges() {
    badgeAudio.classList.toggle('active', neverAudio.checked);
    badgeForms.classList.toggle('active', neverForms.checked);
    badgePinned.classList.toggle('active', neverPinned.checked);
    badgeActive.classList.toggle('active', neverActive.checked);
}

// Update timeout display
function updateTimeoutDisplay() {
    if (!timeoutValue || !timeoutSlider) return;
    const value = parseInt(timeoutSlider.value);
    if (value < 60) {
        timeoutValue.textContent = `${value} min`;
    } else {
        timeoutValue.textContent = `${Math.floor(value / 60)} hr`;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Back button
    backBtn?.addEventListener('click', () => {
        window.close();
    });

    // Profile selection
    profileSelector?.addEventListener('click', (e) => {
        const btn = e.target.closest('.profile-btn');
        if (!btn) return;

        const profile = btn.dataset.profile;
        const timeout = parseInt(btn.dataset.timeout);

        currentProfile = profile;
        settings.suspensionTimeout = timeout;

        updateProfileSelector();
        saveSettings();
    });

    // Custom timing slider (PRO)
    timeoutSlider?.addEventListener('input', () => {
        updateTimeoutDisplay();
        debouncedSave();
    });

    // Unlock custom timing button
    unlockCustomTimingBtn?.addEventListener('click', () => {
        openLicenseModal();
    });

    // Customize protection toggle
    customizeProtectionBtn?.addEventListener('click', () => {
        const isExpanded = protectionSettings.style.display !== 'none';
        protectionSettings.style.display = isExpanded ? 'none' : 'block';
        customizeProtectionBtn.classList.toggle('expanded', !isExpanded);
    });

    // Protection toggles
    [neverAudio, neverForms, neverPinned, neverActive, autoRestore].forEach(toggle => {
        toggle?.addEventListener('change', () => {
            updateProtectionBadges();
            debouncedSave();
        });
    });

    // Whitelist - Add current site
    addCurrentSiteBtn?.addEventListener('click', addCurrentSite);

    // Whitelist - Add manual domain
    addDomainBtn?.addEventListener('click', addManualDomain);
    newDomainInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addManualDomain();
    });

    // View stats
    viewStatsBtn?.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('stats-dashboard.html') });
    });

    // Export/Import
    exportBtn?.addEventListener('click', exportSettings);
    importBtn?.addEventListener('click', () => importFile.click());
    importFile?.addEventListener('change', importSettings);

    // License modal
    activateLicenseBtn?.addEventListener('click', openLicenseModal);
    licenseModalClose?.addEventListener('click', closeLicenseModal);
    licenseModal?.addEventListener('click', (e) => {
        if (e.target === licenseModal) closeLicenseModal();
    });
    activateBtn?.addEventListener('click', activateLicense);

    // License input formatting
    licenseInput?.addEventListener('input', formatLicenseInput);
}

// Add current site to whitelist
async function addCurrentSite() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) {
            showToast('Could not get current tab', 'error');
            return;
        }

        const url = new URL(tab.url);
        const domain = url.hostname.replace(/^www\./, '');

        if (domain.startsWith('chrome') || domain.startsWith('about')) {
            showToast('Cannot whitelist browser pages', 'error');
            return;
        }

        await addDomain(domain);
    } catch (error) {
        console.error('Error adding current site:', error);
        showToast('Failed to add current site', 'error');
    }
}

// Add manual domain
function addManualDomain() {
    let domain = newDomainInput.value.trim().toLowerCase();
    if (!domain) return;

    // Clean up domain
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];

    // Validate
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(domain)) {
        showToast('Invalid domain format', 'error');
        return;
    }

    addDomain(domain);
    newDomainInput.value = '';
}

// Add domain to whitelist
async function addDomain(domain) {
    // Check if already exists
    if (settings.whitelistedDomains?.includes(domain)) {
        showToast('Domain already whitelisted', 'error');
        return;
    }

    // Check whitelist limit for free users
    const currentCount = settings.whitelistedDomains?.length || 0;
    if (!isPro && currentCount >= MAX_FREE_WHITELIST) {
        showWhitelistLimitModal();
        return;
    }

    try {
        await chrome.runtime.sendMessage({ type: 'WHITELIST_DOMAIN', domain });
        settings.whitelistedDomains = settings.whitelistedDomains || [];
        settings.whitelistedDomains.push(domain);
        renderWhitelist();
        showToast(`Added ${domain}`, 'success');
    } catch (error) {
        console.error('Failed to add domain:', error);
        showToast('Failed to add domain', 'error');
    }
}

// Remove domain from whitelist
async function removeDomain(domain) {
    try {
        await chrome.runtime.sendMessage({ type: 'REMOVE_WHITELIST', domain });
        settings.whitelistedDomains = settings.whitelistedDomains.filter(d => d !== domain);
        renderWhitelist();
        showToast(`Removed ${domain}`, 'success');
    } catch (error) {
        console.error('Failed to remove domain:', error);
        showToast('Failed to remove domain', 'error');
    }
}

// Render whitelist
function renderWhitelist() {
    const domains = settings.whitelistedDomains || [];
    const count = domains.length;

    // Update whitelist counter/header
    updateWhitelistHeader(count);

    if (count === 0) {
        whitelistItems.innerHTML = '<div class="whitelist-empty">No domains whitelisted yet</div>';
        return;
    }

    whitelistItems.innerHTML = domains.map(domain => `
        <div class="whitelist-item" data-domain="${escapeHtml(domain)}">
            <span class="whitelist-domain">${escapeHtml(domain)}</span>
            <button class="whitelist-remove" title="Remove">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');

    // Add remove handlers
    whitelistItems.querySelectorAll('.whitelist-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.whitelist-item');
            const domain = item.dataset.domain;
            removeDomain(domain);
        });
    });
}

// Update whitelist header with counter
function updateWhitelistHeader(count) {
    // Find or create the whitelist counter element
    const section = document.querySelector('.section:has(#whitelistItems)');
    if (!section) return;

    let counterEl = section.querySelector('.whitelist-counter');

    if (!isPro) {
        const remaining = MAX_FREE_WHITELIST - count;
        const isAtLimit = count >= MAX_FREE_WHITELIST;
        const isNearLimit = count >= MAX_FREE_WHITELIST - 1;

        if (!counterEl) {
            counterEl = document.createElement('div');
            counterEl.className = 'whitelist-counter';
            const header = section.querySelector('.section-header');
            if (header) {
                header.appendChild(counterEl);
            }
        }

        counterEl.innerHTML = `
            <span class="counter-text ${isAtLimit ? 'at-limit' : isNearLimit ? 'near-limit' : ''}">${count}/${MAX_FREE_WHITELIST}</span>
            ${isAtLimit ? '<button class="btn-unlock-whitelist" id="unlockWhitelistBtn">Unlock Unlimited</button>' : ''}
        `;

        // Add click handler for unlock button
        const unlockBtn = counterEl.querySelector('#unlockWhitelistBtn');
        if (unlockBtn) {
            unlockBtn.addEventListener('click', openLicenseModal);
        }
    } else if (counterEl) {
        // Pro user - show unlimited badge
        counterEl.innerHTML = '<span class="counter-text pro">Unlimited ✓</span>';
    }
}

// Show whitelist limit modal
function showWhitelistLimitModal() {
    // Create modal if it doesn't exist
    let modal = document.getElementById('whitelistLimitModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'whitelistLimitModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <button class="modal-close" id="whitelistLimitModalClose">×</button>
                <div class="modal-icon">🔒</div>
                <h2 class="modal-title">Whitelist Limit Reached</h2>
                <p class="modal-desc">Free users can whitelist up to ${MAX_FREE_WHITELIST} sites. Upgrade to Pro for <strong>unlimited whitelists</strong> and more!</p>
                <div class="limit-benefits">
                    <div class="benefit-item">✓ Unlimited whitelisted sites</div>
                    <div class="benefit-item">✓ Custom suspension timing</div>
                    <div class="benefit-item">✓ Priority support</div>
                </div>
                <button id="upgradeFromWhitelistBtn" class="btn-primary">Unlock Pro Features</button>
                <p class="modal-hint">Or remove a site to add a new one</p>
            </div>
        `;
        document.body.appendChild(modal);

        // Add event listeners
        modal.querySelector('#whitelistLimitModalClose').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.querySelector('#upgradeFromWhitelistBtn').addEventListener('click', () => {
            modal.style.display = 'none';
            openLicenseModal();
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }

    modal.style.display = 'flex';
}

// Debounced save
let saveTimeout;
function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveSettings, 500);
}

// Save settings
async function saveSettings() {
    try {
        const newSettings = {
            suspensionTimeout: isPro ? parseInt(timeoutSlider?.value || 30) : PROFILES[currentProfile].timeout,
            autoUnsuspendOnFocus: autoRestore?.checked ?? true,
            neverSuspendAudio: neverAudio?.checked ?? true,
            neverSuspendUnsavedForms: neverForms?.checked ?? true,
            suspendPinnedTabs: !(neverPinned?.checked ?? true),
            neverSuspendActiveTab: neverActive?.checked ?? true,
            whitelistedDomains: settings.whitelistedDomains || []
        };

        await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: newSettings });
        settings = { ...settings, ...newSettings };
        showToast('Settings saved', 'success');
    } catch (error) {
        console.error('Failed to save settings:', error);
        showToast('Failed to save settings', 'error');
    }
}

// Export settings
function exportSettings() {
    const exportData = {
        ...settings,
        exportedAt: new Date().toISOString(),
        version: '1.0.18'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tab-suspender-pro-settings.json';
    a.click();
    URL.revokeObjectURL(url);

    showToast('Settings exported', 'success');
}

// Import settings
async function importSettings(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const imported = JSON.parse(text);

        // Validate
        const validSettings = validateImportedSettings(imported);
        if (Object.keys(validSettings).length === 0) {
            showToast('No valid settings found', 'error');
            return;
        }

        await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: validSettings });
        settings = { ...settings, ...validSettings };
        updateUI();
        showToast('Settings imported', 'success');
    } catch (error) {
        console.error('Failed to import settings:', error);
        showToast('Failed to import settings', 'error');
    }

    importFile.value = '';
}

// Validate imported settings
function validateImportedSettings(imported) {
    const valid = {};

    if (typeof imported.suspensionTimeout === 'number' && imported.suspensionTimeout >= 1 && imported.suspensionTimeout <= 120) {
        valid.suspensionTimeout = imported.suspensionTimeout;
    }

    const booleanKeys = ['autoUnsuspendOnFocus', 'neverSuspendAudio', 'neverSuspendUnsavedForms', 'suspendPinnedTabs', 'neverSuspendActiveTab'];
    booleanKeys.forEach(key => {
        if (typeof imported[key] === 'boolean') {
            valid[key] = imported[key];
        }
    });

    if (Array.isArray(imported.whitelistedDomains)) {
        valid.whitelistedDomains = imported.whitelistedDomains
            .filter(d => typeof d === 'string' && d.trim().length > 0)
            .map(d => d.trim().toLowerCase());
    }

    return valid;
}

// License modal functions
function openLicenseModal() {
    if (licenseModal) licenseModal.style.display = 'flex';
    if (licenseInput) {
        licenseInput.value = '';
        licenseInput.focus();
    }
    if (licenseStatus) {
        licenseStatus.textContent = '';
        licenseStatus.className = 'license-status';
    }
}

function closeLicenseModal() {
    if (licenseModal) licenseModal.style.display = 'none';
}

function formatLicenseInput(e) {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Format as ZOVO-XXXX-XXXX-XXXX-XXXX
    const parts = [];
    if (value.length > 0) parts.push(value.slice(0, 4));
    if (value.length > 4) parts.push(value.slice(4, 8));
    if (value.length > 8) parts.push(value.slice(8, 12));
    if (value.length > 12) parts.push(value.slice(12, 16));
    if (value.length > 16) parts.push(value.slice(16, 20));

    e.target.value = parts.join('-');
}

async function activateLicense() {
    const key = licenseInput?.value?.trim() || '';

    if (!key || key.length < 24) {
        if (licenseStatus) {
            licenseStatus.textContent = 'Please enter a valid license key';
            licenseStatus.className = 'license-status error';
        }
        return;
    }

    if (activateBtn) activateBtn.disabled = true;
    if (licenseStatus) {
        licenseStatus.textContent = 'Verifying...';
        licenseStatus.className = 'license-status';
    }

    try {
        // Try to verify with backend (use same endpoint as background.js)
        const response = await fetch('https://xggdjlurppfcytxqoozs.supabase.co/functions/v1/verify-extension-license', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: key, extension: 'tab_suspender_pro' })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.valid) {
                await chrome.storage.local.set({ isPro: true, licenseKey: key });
                isPro = true;

                if (licenseStatus) {
                    licenseStatus.textContent = 'License activated successfully!';
                    licenseStatus.className = 'license-status success';
                }

                // Update UI (with null checks)
                if (licensePrompt) licensePrompt.style.display = 'none';
                if (licenseActive) licenseActive.style.display = 'flex';
                if (licenseKeyDisplay) licenseKeyDisplay.textContent = maskLicenseKey(key);
                if (unlockCustomTimingBtn) unlockCustomTimingBtn.style.display = 'none';
                if (customTimingSlider) customTimingSlider.style.display = 'flex';

                showToast('Pro features unlocked!', 'success');

                setTimeout(closeLicenseModal, 1500);
            } else {
                if (licenseStatus) {
                    licenseStatus.textContent = data.message || 'Invalid license key';
                    licenseStatus.className = 'license-status error';
                }
            }
        } else {
            throw new Error('Server error');
        }
    } catch (error) {
        // Offline fallback - accept keys starting with ZOVO-
        if (key.startsWith('ZOVO-') && key.length === 24) {
            await chrome.storage.local.set({ isPro: true, licenseKey: key });
            isPro = true;

            if (licenseStatus) {
                licenseStatus.textContent = 'License activated (offline mode)';
                licenseStatus.className = 'license-status success';
            }

            // Update UI (with null checks)
            if (licensePrompt) licensePrompt.style.display = 'none';
            if (licenseActive) licenseActive.style.display = 'flex';
            if (licenseKeyDisplay) licenseKeyDisplay.textContent = maskLicenseKey(key);
            if (unlockCustomTimingBtn) unlockCustomTimingBtn.style.display = 'none';
            if (customTimingSlider) customTimingSlider.style.display = 'flex';

            showToast('Pro features unlocked!', 'success');

            setTimeout(closeLicenseModal, 1500);
        } else {
            if (licenseStatus) {
                licenseStatus.textContent = 'Could not verify license. Check your connection.';
                licenseStatus.className = 'license-status error';
            }
        }
    }

    if (activateBtn) activateBtn.disabled = false;
}

// Helper functions
function maskLicenseKey(key) {
    if (!key || key.length < 8) return key;
    return key.slice(0, 4) + '-****-****-****';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function showToast(message, type = 'info') {
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Force save on unload
window.addEventListener('beforeunload', () => {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveSettings();
    }
});
