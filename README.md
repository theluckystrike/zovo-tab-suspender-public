# Tab Suspender Pro - Save Memory & Speed Up Chrome

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-blue?logo=google-chrome)](https://chrome.google.com/webstore)
[![Version](https://img.shields.io/badge/version-1.0.19-green.svg)](https://github.com/theluckystrike/zovo-tab-suspender-public)
[![Users](https://img.shields.io/badge/users-66-orange.svg)](https://github.com/theluckystrike/zovo-tab-suspender-public)
[![Rating](https://img.shields.io/badge/rating-★★★★★-yellow.svg)](https://github.com/theluckystrike/zovo-tab-suspender-public)
[![License](https://img.shields.io/badge/license-BSL%201.1-blue.svg)](https://mariadb.com/bsl11/)

> Automatically suspend inactive tabs to free memory and speed up Chrome.

**Tab Suspender Pro** is a Chrome extension that intelligently suspends inactive tabs to reduce memory usage and improve browser performance. Keep hundreds of tabs open without slowing down your system.

## Features

- **Automatic Tab Suspension** - Suspend inactive tabs after a configurable idle period to free up memory
- **Domain Whitelist** - Define domains that should never be suspended (e.g., streaming sites, work apps)
- **Configurable Idle Timer** - Set custom timeout periods (5 min, 15 min, 30 min, 1 hour, etc.)
- **Visual Indicator** - Easily identify suspended tabs with a clear visual marker
- **One-Click Restore** - Click any suspended tab to instantly restore it
- **Smart Exclusions** - Automatically excludes pinned tabs, tabs playing audio, and the active tab

## How It Works

1. Set your preferred idle timeout in the settings
2. Add any domains you want to whitelist (optional)
3. The extension automatically suspends tabs that have been inactive for the specified time
4. Click a suspended tab to restore it instantly
5. Monitor memory savings in the extension popup

## Permissions Explained

| Permission | Why |
|------------|-----|
| `tabs` | Monitor tab activity and suspend/restore tabs |
| `storage` | Save your settings and whitelist locally |
| `alarms` | Check for idle tabs periodically |
| `webNavigation` | Detect when tabs navigate to new pages |

## Privacy

**Tab Suspender Pro collects zero data.**

- Does NOT send any data to external servers
- Does NOT track your browsing activity
- Does NOT collect analytics or telemetry
- All tab management happens locally in your browser
- Your settings are stored only on your device

## License

This repository contains the community edition of Tab Suspender Pro, licensed under the **Business Source License 1.1 (BSL 1.1)**.

**What this means:**
- Free to use for personal and non-production purposes
- Source code is fully available for inspection
- Commercial use requires a separate license

See the full license text at: https://mariadb.com/bsl11/

## Installation

Install from the [Chrome Web Store](https://chrome.google.com/webstore) or load unpacked from source:

1. Clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

## Built by Zovo

Part of the [Zovo](https://zovo.one) developer tools family.

## Support

- Report issues on [GitHub Issues](https://github.com/theluckystrike/zovo-tab-suspender-public/issues)
- Contact: support@zovo.one

---

Made with care by the Zovo team.
