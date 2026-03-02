// ===========================================================
// AG Auto Click & Scroll v8.0 - Injected Script
// Runs inside Antigravity/VS Code renderer process
// Smart Accept — accepts in chat only, never in diff editor
// ===========================================================
(function () {
    'use strict';

    // ---- Configuration (overridden by HTTP polling) ----
    let CONFIG = {
        acceptEnabled: true,
        scrollEnabled: true,
        clickInterval: 1000,
        scrollInterval: 500,
        patterns: {
            'Run': true,
            'Allow': true,
            'Always Allow': true,
            'Accept': true,
            'Keep Waiting': true,
            'Retry': true,
            'Continue': true,
            'Allow Once': true,
            'Allow This Conversion': true,
            'Accept all': false
        },
        httpPort: 0
    };

    // Display name mapping
    const DISPLAY_NAMES = {
        'Run': 'Run',
        'Allow': 'Allow',
        'Always Allow': 'Always Allow',
        'Accept': 'Accept',
        'Keep Waiting': 'Keep Waiting',
        'Retry': 'Retry',
        'Continue': 'Continue',
        'Allow Once': 'Allow Once',
        'Allow This Conversion': 'Allow This Conversion',
        'Accept all': 'Accept All Changes'
    };

    // Diff editor patterns — NEVER click these
    const DIFF_EDITOR_PATTERNS = [
        'accept changes',
        'accept all changes',
        'accept incoming',
        'accept current',
        'accept both',
        'accept incoming change',
        'accept current change',
    ];

    // ---- Click Stats ----
    let clickStats = {};
    let clickHistory = [];
    let sessionStartTime = Date.now();
    let userTypingUntil = 0;

    // ---- Helpers ----

    /**
     * Check if button text matches a diff editor action (NEVER click)
     */
    function isDiffEditorAction(text) {
        const lower = text.toLowerCase().trim();
        return DIFF_EDITOR_PATTERNS.some(p => lower.includes(p));
    }

    /**
     * Check if a button is inside a diff/merge editor or editor area
     */
    function isInDiffEditor(el) {
        let node = el;
        while (node) {
            if (node.classList) {
                if (
                    node.classList.contains('diff-editor') ||
                    node.classList.contains('merge-editor') ||
                    node.classList.contains('dirty-diff') ||
                    node.classList.contains('editor-container') ||
                    node.classList.contains('editor-group-container') ||
                    node.classList.contains('monaco-diff-editor') ||
                    node.classList.contains('inline-editor-widget')
                ) {
                    return true;
                }
            }
            // Check data attributes
            if (node.getAttribute && node.getAttribute('data-mode-id') === 'diff') {
                return true;
            }
            node = node.parentElement;
        }
        return false;
    }

    /**
     * Check if a button is in a chat/interactive panel (safe to click)
     */
    function isInChatPanel(el) {
        let node = el;
        while (node) {
            if (node.classList) {
                if (
                    node.classList.contains('interactive-session') ||
                    node.classList.contains('chat-widget') ||
                    node.classList.contains('notification-toast-container') ||
                    node.classList.contains('notifications-toasts') ||
                    node.classList.contains('monaco-dialog-box')
                ) {
                    return true;
                }
            }
            if (node.getAttribute) {
                const role = node.getAttribute('role');
                if (role === 'dialog' || role === 'alertdialog') {
                    return true;
                }
            }
            node = node.parentElement;
        }
        return false;
    }

    /**
     * Check if a button is a "safe" approval button
     * Safe = has a Reject/Deny/Cancel sibling nearby
     */
    function isSafeApprovalButton(btn) {
        const parent = btn.parentElement;
        if (!parent) return false;

        const rejectPatterns = ['reject', 'deny', 'cancel', 'dismiss', 'don\'t allow', 'decline'];
        const container = btn.closest('.dialog-buttons, .notification-toast-container, .monaco-dialog-box, [role="dialog"], [role="alertdialog"], .notifications-toasts, .action-bar');

        if (!container) {
            const siblings = parent.querySelectorAll('a, button, .monaco-button');
            for (const sib of siblings) {
                const sibText = (sib.textContent || '').trim().toLowerCase();
                if (rejectPatterns.some(p => sibText.includes(p))) {
                    return true;
                }
            }
            return false;
        }

        const allButtons = container.querySelectorAll('a, button, .monaco-button');
        for (const b of allButtons) {
            const text = (b.textContent || '').trim().toLowerCase();
            if (rejectPatterns.some(p => text.includes(p))) {
                return true;
            }
        }

        // Notifications are generally safe
        if (container.classList.contains('notification-toast-container') ||
            container.classList.contains('notifications-toasts')) {
            return true;
        }

        return false;
    }

    /**
     * Find and click matching approval buttons (Smart Accept v8.0)
     */
    function autoClickButtons() {
        if (!CONFIG.acceptEnabled) return;

        // Auto-pause: skip if user is actively typing
        if (Date.now() < userTypingUntil) return;

        // Get all clickable elements
        const buttons = document.querySelectorAll(
            'a.monaco-button, button.monaco-button, a.monaco-text-button, ' +
            'button.monaco-text-button, .monaco-button, [role="button"], ' +
            '.notification-list-item-buttons-container .monaco-button'
        );

        for (const btn of buttons) {
            const text = (btn.textContent || '').trim();

            // NEVER click diff editor actions
            if (isDiffEditorAction(text)) continue;

            // Check each enabled pattern
            for (const [pattern, enabled] of Object.entries(CONFIG.patterns)) {
                if (!enabled) continue;

                // Match button text
                const matches = text === pattern ||
                    text.toLowerCase() === pattern.toLowerCase() ||
                    text.startsWith(pattern);

                if (!matches) continue;

                // === SMART ACCEPT LOGIC v7.4 ===

                // 1. Never click in diff editor area
                if (isInDiffEditor(btn)) continue;

                // 2. For "Accept" pattern specifically — only in chat panel
                if (pattern === 'Accept') {
                    if (!isInChatPanel(btn)) continue;
                }

                // 3. For "Accept all" — must be in notification/dialog only
                if (pattern === 'Accept all') {
                    const inNotification = btn.closest('.notification-toast-container, .notifications-toasts, [role="dialog"], .monaco-dialog-box');
                    if (!inNotification) continue;
                }

                // 4. Check button is visible
                const rect = btn.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;

                // 5. For general patterns, verify safe approval context
                if (!isSafeApprovalButton(btn)) {
                    const inNotif = btn.closest('.notification-toast-container, .notifications-toasts');
                    const inChat = isInChatPanel(btn);
                    if (!inNotif && !inChat) continue;
                }

                // Smart delay + Click!
                const delay = 30 + Math.random() * 90;
                setTimeout(() => {
                    btn.click();

                    // Brief visual flash on clicked button
                    try {
                        const origBg = btn.style.backgroundColor;
                        const origTransition = btn.style.transition;
                        btn.style.transition = 'background-color 0.15s ease';
                        btn.style.backgroundColor = 'rgba(99, 102, 241, 0.4)';
                        setTimeout(() => {
                            btn.style.backgroundColor = origBg;
                            btn.style.transition = origTransition;
                        }, 200);
                    } catch (e) { }
                }, delay);

                // Track stats
                if (!clickStats[pattern]) clickStats[pattern] = 0;
                clickStats[pattern]++;

                // Track click history for activity log
                clickHistory.unshift({
                    time: Date.now(),
                    pattern: pattern,
                    count: 1
                });
                if (clickHistory.length > 50) clickHistory = clickHistory.slice(0, 50);

                sendStats();
                break;
            }
        }
    }

    /**
     * Auto-scroll the chat panel to bottom (smooth)
     */
    function autoScroll() {
        if (!CONFIG.scrollEnabled) return;

        const selectors = [
            '.interactive-session .interactive-list',
            '.chat-widget .monaco-list-rows',
            '.interactive-session',
            '[class*="chat"] .monaco-scrollable-element',
        ];

        for (const sel of selectors) {
            const containers = document.querySelectorAll(sel);
            for (const container of containers) {
                const scrollEl = container.closest('.monaco-scrollable-element') || container;
                const inner = scrollEl.querySelector('.monaco-list-rows') || scrollEl;

                if (inner.scrollHeight > inner.clientHeight) {
                    const distanceFromBottom = inner.scrollHeight - inner.scrollTop - inner.clientHeight;
                    if (distanceFromBottom > 50) {
                        // Smooth scroll instead of instant jump
                        const target = inner.scrollHeight;
                        const current = inner.scrollTop;
                        const diff = target - current;
                        inner.scrollTop = current + diff * 0.85;
                    }
                }
            }
        }
    }

    /**
     * Send click stats to extension host via HTTP
     */
    function sendStats() {
        if (!CONFIG.httpPort) return;
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `http://127.0.0.1:${CONFIG.httpPort}/stats`, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify(clickStats));
        } catch (e) {
            // Silently fail
        }
    }

    /**
     * Poll settings from extension host (async, non-blocking)
     */
    let pollErrors = 0;
    function pollSettings() {
        if (!CONFIG.httpPort) return;
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `http://127.0.0.1:${CONFIG.httpPort}/settings`, true);
            xhr.timeout = 3000;
            xhr.onload = function () {
                if (xhr.status === 200) {
                    try {
                        const newConfig = JSON.parse(xhr.responseText);
                        CONFIG.acceptEnabled = newConfig.acceptEnabled ?? CONFIG.acceptEnabled;
                        CONFIG.scrollEnabled = newConfig.scrollEnabled ?? CONFIG.scrollEnabled;
                        CONFIG.clickInterval = newConfig.clickInterval ?? CONFIG.clickInterval;
                        CONFIG.scrollInterval = newConfig.scrollInterval ?? CONFIG.scrollInterval;
                        if (newConfig.patterns) {
                            CONFIG.patterns = newConfig.patterns;
                        }
                        pollErrors = 0;
                        restartIntervals();
                    } catch (e) { }
                }
            };
            xhr.onerror = function () {
                pollErrors++;
                if (pollErrors >= 5) {
                    clearInterval(pollInterval);
                }
            };
            xhr.send();
        } catch (e) { }
    }

    // ---- Main Loop ----
    let clickIntervalId = null;
    let scrollIntervalId = null;
    let pollInterval = null;
    let lastClickInterval = CONFIG.clickInterval;
    let lastScrollInterval = CONFIG.scrollInterval;

    function restartIntervals() {
        if (lastClickInterval !== CONFIG.clickInterval) {
            if (clickIntervalId) clearInterval(clickIntervalId);
            clickIntervalId = setInterval(autoClickButtons, CONFIG.clickInterval);
            lastClickInterval = CONFIG.clickInterval;
        }
        if (lastScrollInterval !== CONFIG.scrollInterval) {
            if (scrollIntervalId) clearInterval(scrollIntervalId);
            scrollIntervalId = setInterval(autoScroll, CONFIG.scrollInterval);
            lastScrollInterval = CONFIG.scrollInterval;
        }
    }

    function start() {
        clickIntervalId = setInterval(autoClickButtons, CONFIG.clickInterval);
        scrollIntervalId = setInterval(autoScroll, CONFIG.scrollInterval);
        pollInterval = setInterval(pollSettings, 2000);

        // Read port from meta tag injected by extension
        const portMeta = document.querySelector('meta[name="auto-accept-port"]');
        if (portMeta) {
            CONFIG.httpPort = parseInt(portMeta.getAttribute('content') || '0', 10);
            pollSettings();
        }

        console.log('[AG Auto Click & Scroll v8.0] Script loaded ✅');
    }

    // Detect user typing to auto-pause clicks
    document.addEventListener('keydown', function (e) {
        const active = document.activeElement;
        if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.getAttribute('contenteditable'))) {
            userTypingUntil = Date.now() + 2000; // Pause 2s after last keypress
        }
    }, true);

    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
