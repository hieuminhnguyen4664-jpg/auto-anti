import * as vscode from 'vscode';

/**
 * StatusBar v8.0 — Unified compact status bar with animated states
 *
 * Single item: "⚡ AG: ON (42)" with color coding:
 * - Green: All features active
 * - Yellow: Partial (some features off)
 * - Red: All disabled
 */
export class StatusBar {
    private mainItem: vscode.StatusBarItem;
    private settingsItem: vscode.StatusBarItem;

    private acceptEnabled: boolean = true;
    private scrollEnabled: boolean = true;
    private clickCount: number = 0;
    private isActive: boolean = false;

    // Callbacks
    private _onToggleAccept: ((enabled: boolean) => void) | null = null;
    private _onToggleScroll: ((enabled: boolean) => void) | null = null;
    private _onOpenSettings: (() => void) | null = null;

    // Pulse animation
    private pulseInterval: NodeJS.Timeout | null = null;
    private pulseState: boolean = false;

    constructor() {
        // Main Status Item — Right side, high priority
        this.mainItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            200
        );
        this.mainItem.command = 'autoAccept.toggleAccept';
        this.render();
        this.mainItem.show();

        // Settings gear item
        this.settingsItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            198
        );
        this.settingsItem.command = 'autoAccept.openSettings';
        this.settingsItem.text = '$(gear)';
        this.settingsItem.tooltip = 'AG Auto Click — Open Settings Dashboard';
        this.settingsItem.color = '#71717a';
        this.settingsItem.show();
    }

    // ===========================
    // Render
    // ===========================

    private render(): void {
        const allOn = this.acceptEnabled && this.scrollEnabled;
        const allOff = !this.acceptEnabled && !this.scrollEnabled;

        // Icon + state text
        let icon: string;
        let stateText: string;
        let color: string;

        if (allOn) {
            icon = '$(zap)';
            stateText = 'ON';
            color = '#22c55e'; // green
        } else if (allOff) {
            icon = '$(circle-slash)';
            stateText = 'OFF';
            color = '#ef4444'; // red
        } else {
            icon = '$(warning)';
            stateText = this.acceptEnabled ? 'A·ON' : 'S·ON';
            color = '#f59e0b'; // yellow
        }

        // Build text
        let text = `${icon} AG: ${stateText}`;
        if (this.clickCount > 0) {
            text += ` (${this.formatCount(this.clickCount)})`;
        }

        this.mainItem.text = text;
        this.mainItem.color = color;

        // Tooltip
        const acceptState = this.acceptEnabled ? '✅ ON' : '❌ OFF';
        const scrollState = this.scrollEnabled ? '✅ ON' : '❌ OFF';
        this.mainItem.tooltip = new vscode.MarkdownString(
            `**⚡ AG Auto Click & Scroll v8.0**\n\n` +
            `| Feature | Status |\n|---|---|\n` +
            `| Auto Accept | ${acceptState} |\n` +
            `| Auto Scroll | ${scrollState} |\n` +
            `| Total Clicks | ${this.clickCount} |\n\n` +
            `_Click to toggle Accept · $(gear) for Settings_`
        );
        this.mainItem.tooltip.isTrusted = true;

        // Background color for OFF states
        if (allOff) {
            this.mainItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else {
            this.mainItem.backgroundColor = undefined;
        }
    }

    private formatCount(n: number): string {
        if (n >= 1000) {
            return (n / 1000).toFixed(1) + 'k';
        }
        return n.toString();
    }

    // ===========================
    // Pulse Animation (when actively clicking)
    // ===========================

    startPulse(): void {
        if (this.pulseInterval) return;
        this.pulseInterval = setInterval(() => {
            this.pulseState = !this.pulseState;
            // Subtle color pulse
            if (this.acceptEnabled) {
                this.mainItem.color = this.pulseState ? '#4ade80' : '#22c55e';
            }
        }, 800);
    }

    stopPulse(): void {
        if (this.pulseInterval) {
            clearInterval(this.pulseInterval);
            this.pulseInterval = null;
        }
        this.render(); // Reset color
    }

    // ===========================
    // Register Commands
    // ===========================

    registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('autoAccept.toggleAccept', () => {
                this.acceptEnabled = !this.acceptEnabled;
                this.render();
                if (this._onToggleAccept) {
                    this._onToggleAccept(this.acceptEnabled);
                }
            }),

            vscode.commands.registerCommand('autoAccept.toggleScroll', () => {
                this.scrollEnabled = !this.scrollEnabled;
                this.render();
                if (this._onToggleScroll) {
                    this._onToggleScroll(this.scrollEnabled);
                }
            }),

            vscode.commands.registerCommand('autoAccept.toggleAll', () => {
                const newState = !this.acceptEnabled || !this.scrollEnabled;
                this.acceptEnabled = newState;
                this.scrollEnabled = newState;
                this.render();
                if (this._onToggleAccept) this._onToggleAccept(this.acceptEnabled);
                if (this._onToggleScroll) this._onToggleScroll(this.scrollEnabled);

                const state = newState ? 'ON' : 'OFF';
                vscode.window.showInformationMessage(`AG Auto: All features ${state}`);
            })
        );
    }

    // ===========================
    // Callbacks
    // ===========================

    onAcceptToggle(cb: (enabled: boolean) => void): void {
        this._onToggleAccept = cb;
    }

    onScrollToggle(cb: (enabled: boolean) => void): void {
        this._onToggleScroll = cb;
    }

    onSettingsOpen(cb: () => void): void {
        this._onOpenSettings = cb;
    }

    // ===========================
    // Public setters
    // ===========================

    setAcceptEnabled(enabled: boolean): void {
        this.acceptEnabled = enabled;
        this.render();
    }

    setScrollEnabled(enabled: boolean): void {
        this.scrollEnabled = enabled;
        this.render();
    }

    setClickCount(count: number): void {
        const oldCount = this.clickCount;
        this.clickCount = count;
        this.render();

        // Start pulse when click count changes
        if (count > oldCount) {
            this.startPulse();
            setTimeout(() => this.stopPulse(), 3000);
        }
    }

    // ===========================
    // Getters
    // ===========================

    isAcceptEnabled(): boolean {
        return this.acceptEnabled;
    }

    isScrollEnabled(): boolean {
        return this.scrollEnabled;
    }

    // ===========================
    // Cleanup
    // ===========================

    dispose(): void {
        this.mainItem.dispose();
        this.settingsItem.dispose();
        if (this.pulseInterval) {
            clearInterval(this.pulseInterval);
        }
    }
}
