import * as vscode from 'vscode';

/**
 * StatusBar — Quản lý 2 status bar items:
 * - "Accept ON/OFF" (xanh/đỏ) — toggle auto-click
 * - "Scroll ON/OFF" (xanh/đỏ) — toggle auto-scroll
 *
 * Click vào status bar → toggle trạng thái + mở Settings panel.
 */
export class StatusBar {
    private acceptItem: vscode.StatusBarItem;
    private scrollItem: vscode.StatusBarItem;

    private acceptEnabled: boolean = true;
    private scrollEnabled: boolean = true;
    private clickCount: number = 0;

    // Callbacks khi user toggle
    private _onToggleAccept: ((enabled: boolean) => void) | null = null;
    private _onToggleScroll: ((enabled: boolean) => void) | null = null;
    private _onOpenSettings: (() => void) | null = null;

    constructor() {
        // ---- Accept Status Bar Item ----
        this.acceptItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            200 // priority cao → hiện bên phải cùng
        );
        this.acceptItem.command = 'autoAccept.toggleAccept';
        this.renderAcceptItem();
        this.acceptItem.show();

        // ---- Scroll Status Bar Item ----
        this.scrollItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            199 // ngay cạnh Accept item
        );
        this.scrollItem.command = 'autoAccept.toggleScroll';
        this.renderScrollItem();
        this.scrollItem.show();
    }

    // ===========================
    // Render UI
    // ===========================

    private renderAcceptItem(): void {
        if (this.acceptEnabled) {
            this.acceptItem.text = `$(check) Accept ON`;
            this.acceptItem.backgroundColor = undefined;
            this.acceptItem.color = '#4EC9B0'; // xanh lá
            this.acceptItem.tooltip = 'Auto Accept đang BẬT — Click để tắt / mở Settings';
        } else {
            this.acceptItem.text = `$(x) Accept OFF`;
            this.acceptItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this.acceptItem.color = undefined; // mặc định (đỏ từ errorBackground)
            this.acceptItem.tooltip = 'Auto Accept đang TẮT — Click để bật / mở Settings';
        }

        // Badge hiển thị tổng số click
        if (this.clickCount > 0) {
            this.acceptItem.text += ` (${this.clickCount})`;
        }
    }

    private renderScrollItem(): void {
        if (this.scrollEnabled) {
            this.scrollItem.text = `$(arrow-down) Scroll ON`;
            this.scrollItem.backgroundColor = undefined;
            this.scrollItem.color = '#4EC9B0';
            this.scrollItem.tooltip = 'Auto Scroll đang BẬT — Click để tắt';
        } else {
            this.scrollItem.text = `$(arrow-down) Scroll OFF`;
            this.scrollItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this.scrollItem.color = undefined;
            this.scrollItem.tooltip = 'Auto Scroll đang TẮT — Click để bật';
        }
    }

    // ===========================
    // Register Commands
    // ===========================

    /**
     * Đăng ký commands toggle vào extension context.
     * Phải gọi hàm này trong activate() của extension.
     */
    registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            // --- Toggle Accept ---
            vscode.commands.registerCommand('autoAccept.toggleAccept', () => {
                this.acceptEnabled = !this.acceptEnabled;
                this.renderAcceptItem();

                // Notify extension logic
                if (this._onToggleAccept) {
                    this._onToggleAccept(this.acceptEnabled);
                }

                // Mở settings panel khi click lần đầu
                if (this._onOpenSettings) {
                    this._onOpenSettings();
                }
            }),

            // --- Toggle Scroll ---
            vscode.commands.registerCommand('autoAccept.toggleScroll', () => {
                this.scrollEnabled = !this.scrollEnabled;
                this.renderScrollItem();

                if (this._onToggleScroll) {
                    this._onToggleScroll(this.scrollEnabled);
                }
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

    /** Đồng bộ state từ config */
    setAcceptEnabled(enabled: boolean): void {
        this.acceptEnabled = enabled;
        this.renderAcceptItem();
    }

    setScrollEnabled(enabled: boolean): void {
        this.scrollEnabled = enabled;
        this.renderScrollItem();
    }

    /** Cập nhật badge click count trên Accept item */
    setClickCount(count: number): void {
        this.clickCount = count;
        this.renderAcceptItem();
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
        this.acceptItem.dispose();
        this.scrollItem.dispose();
    }
}
