/**
 * Tab Suspender Pro - Onboarding JavaScript
 */

let currentStep = 1;
const totalSteps = 5;

// DOM Elements - initialized after DOMContentLoaded
let stepsContainer, progressFill, stepDots, backBtn, nextBtn, skipLink;
let setupTimeout, setupTimeoutValue;
let demoBtn, demoTab1, demoTab2, demoResult;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Query DOM elements after DOM is ready
    stepsContainer = document.getElementById('stepsContainer');
    progressFill = document.getElementById('progressFill');
    stepDots = document.getElementById('stepDots');
    backBtn = document.getElementById('backBtn');
    nextBtn = document.getElementById('nextBtn');
    skipLink = document.getElementById('skipLink');
    setupTimeout = document.getElementById('setupTimeout');
    setupTimeoutValue = document.getElementById('setupTimeoutValue');
    demoBtn = document.getElementById('demoBtn');
    demoTab1 = document.getElementById('demoTab1');
    demoTab2 = document.getElementById('demoTab2');
    demoResult = document.getElementById('demoResult');

    // Now initialize
    updateUI();
    setupEventListeners();
    createParticles();
});

// Setup Event Listeners
function setupEventListeners() {
    if (nextBtn) nextBtn.addEventListener('click', nextStep);
    if (backBtn) backBtn.addEventListener('click', prevStep);
    if (skipLink) skipLink.addEventListener('click', skipOnboarding);

    // Timeout slider
    if (setupTimeout) {
        setupTimeout.addEventListener('input', updateTimeoutDisplay);
    }

    // Demo button
    if (demoBtn) {
        demoBtn.addEventListener('click', runDemo);
    }

    // Clickable dots navigation
    document.querySelectorAll('.dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const targetStep = parseInt(dot.dataset.step);
            if (targetStep && targetStep !== currentStep) {
                currentStep = targetStep;
                updateUI();
            }
        });
    });
}

// Navigate to next step
function nextStep() {
    if (currentStep < totalSteps) {
        currentStep++;
        updateUI();

        if (currentStep === totalSteps && nextBtn) {
            // Last step - save settings and mark onboarding complete
            saveSettings();
            nextBtn.textContent = 'Get Started';
            nextBtn.onclick = finishOnboarding;
        }
    }
}

// Navigate to previous step
function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateUI();
    }
}

// Update UI based on current step
function updateUI() {
    // Update steps visibility
    document.querySelectorAll('.step').forEach((step, index) => {
        step.classList.toggle('active', index + 1 === currentStep);
    });

    // Update progress bar
    if (progressFill) {
        progressFill.style.width = `${(currentStep / totalSteps) * 100}%`;
    }

    // Update dots
    document.querySelectorAll('.dot').forEach((dot, index) => {
        const stepNum = index + 1;
        dot.classList.remove('active', 'completed');
        if (stepNum === currentStep) {
            dot.classList.add('active');
        } else if (stepNum < currentStep) {
            dot.classList.add('completed');
        }
    });

    // Update step counter
    const stepCounter = document.getElementById('stepCounter');
    if (stepCounter) {
        stepCounter.textContent = `Step ${currentStep} of ${totalSteps}`;
    }

    // Update back button visibility
    if (backBtn) {
        backBtn.classList.toggle('hidden', currentStep === 1);
    }

    // Update next button text
    if (nextBtn) {
        if (currentStep === totalSteps) {
            nextBtn.innerHTML = `Get Started <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            nextBtn.onclick = finishOnboarding;
        } else {
            nextBtn.innerHTML = `Next <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
            nextBtn.onclick = nextStep;
        }
    }
}

// Update timeout display
function updateTimeoutDisplay() {
    const value = parseInt(setupTimeout.value);
    if (value < 60) {
        setupTimeoutValue.textContent = `${value} min`;
    } else {
        setupTimeoutValue.textContent = `${Math.floor(value / 60)} hr`;
    }
}

// Run demo animation
async function runDemo() {
    if (!demoBtn) return;
    demoBtn.disabled = true;

    // Animate tabs being suspended
    setTimeout(() => {
        if (demoTab1) {
            demoTab1.classList.add('suspended');
            const status = demoTab1.querySelector('.demo-status');
            if (status) {
                status.textContent = 'Suspended';
                status.className = 'demo-status suspended';
            }
        }
    }, 300);

    setTimeout(() => {
        if (demoTab2) {
            demoTab2.classList.add('suspended');
            const status = demoTab2.querySelector('.demo-status');
            if (status) {
                status.textContent = 'Suspended';
                status.className = 'demo-status suspended';
            }
        }
    }, 600);

    setTimeout(() => {
        if (demoBtn) demoBtn.style.display = 'none';
        if (demoResult) demoResult.classList.remove('hidden');
    }, 1000);
}

// Save settings from onboarding
async function saveSettings() {
    try {
        const settings = {
            suspensionTimeout: parseInt(setupTimeout?.value) || 30,
            neverSuspendAudio: document.getElementById('setupAudio')?.checked ?? true,
            neverSuspendUnsavedForms: document.getElementById('setupForms')?.checked ?? true,
            suspendPinnedTabs: !(document.getElementById('setupPinned')?.checked ?? true),
            whitelistedDomains: []
        };

        // Collect whitelisted domains
        document.querySelectorAll('.whitelist-chips input:checked').forEach(input => {
            const domain = input.dataset.domain;
            if (domain) {
                settings.whitelistedDomains.push(domain);
            }
        });

        await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

// Skip onboarding
async function skipOnboarding(e) {
    e.preventDefault();
    await markOnboardingComplete();
    window.close();
}

// Finish onboarding
async function finishOnboarding() {
    await saveSettings();
    await markOnboardingComplete();
    window.close();
}

// Mark onboarding as complete
async function markOnboardingComplete() {
    try {
        await chrome.storage.local.set({ onboardingComplete: true });
    } catch (error) {
        console.error('Failed to mark onboarding complete:', error);
    }
}

// Create floating particles
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;

    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
      position: absolute;
      width: ${Math.random() * 4 + 2}px;
      height: ${Math.random() * 4 + 2}px;
      background: rgba(124, 58, 237, ${Math.random() * 0.3 + 0.1});
      border-radius: 50%;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      animation: float ${Math.random() * 10 + 10}s linear infinite;
    `;
        container.appendChild(particle);
    }

    // Add float animation
    const style = document.createElement('style');
    style.textContent = `
    @keyframes float {
      0%, 100% { transform: translateY(0) translateX(0); opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { transform: translateY(-100vh) translateX(${Math.random() * 100 - 50}px); opacity: 0; }
    }
  `;
    document.head.appendChild(style);
}
