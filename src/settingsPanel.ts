import * as vscode from 'vscode';

const DISPLAY_NAMES: Record<string, string> = {
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

const PATTERN_ICONS: Record<string, string> = {
  'Run': '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><polygon points="4,2 14,8 4,14" fill="#22c55e"/></svg>',
  'Allow': '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Always Allow': '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1L9.5 4.5 13 5.5 10.5 8 11 12 8 10.5 5 12 5.5 8 3 5.5 6.5 4.5Z" fill="#f59e0b"/></svg>',
  'Accept': '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1a7 7 0 100 14A7 7 0 008 1z" fill="#6366f1"/><path d="M5 8l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Keep Waiting': '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#f59e0b" stroke-width="1.5" fill="none"/><path d="M8 4v4l3 2" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/></svg>',
  'Retry': '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 0111.3-2.8M14 8a6 6 0 01-11.3 2.8" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round"/><path d="M13 2v3h-3M3 14v-3h3" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Continue': '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Allow Once': '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="2" stroke="#ec4899" stroke-width="1.5" fill="none"/><path d="M6 8h4" stroke="#ec4899" stroke-width="1.5" stroke-linecap="round"/></svg>',
  'Allow This Conversion': '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4-4 4 4M4 10l4 4 4-4" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'Accept all': '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8l3 3 5-5" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 8l3 3 5-5" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

const PATTERN_DESCRIPTIONS: Record<string, string> = {
  'Run': 'Auto-click Run buttons for terminal commands',
  'Allow': 'Auto-allow requested permissions',
  'Always Allow': 'Auto-click Always Allow for permanent permissions',
  'Accept': 'Accept agent suggestions in chat panel',
  'Keep Waiting': 'Keep waiting when process takes long',
  'Retry': 'Auto-retry failed commands',
  'Continue': 'Continue paused operations',
  'Allow Once': 'Allow single-use permissions',
  'Allow This Conversion': 'Accept file/format conversions',
  'Accept all': 'Accept all changes in notifications only'
};

export class SettingsPanel {
  private panel: vscode.WebviewPanel | null = null;
  private context: vscode.ExtensionContext;
  private onSettingsChange: ((settings: any) => void) | null = null;
  private onStatsReset: (() => void) | null = null;
  private onProxyAction: ((action: string, data?: any) => void) | null = null;
  private currentStats: Record<string, number> = {};
  private statsUpdateInterval: NodeJS.Timeout | null = null;
  private activityLog: Array<{ time: string; pattern: string; count: number }> = [];
  private sessionStart: number = Date.now();
  private proxyStatus: any = { running: false, port: 8045, totalRequests: 0, accountsActive: 0, accountsLimited: 0 };
  private proxyApiKey: string = '';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.sessionStart = Date.now();
  }

  toggle(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
      return;
    }
    this.show();
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'autoAcceptSettings',
      'AG Auto Click & Scroll — Dashboard',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'saveSettings':
          if (this.onSettingsChange) {
            this.onSettingsChange(msg.settings);
          }
          break;
        case 'resetStats':
          if (this.onStatsReset) {
            this.onStatsReset();
          }
          this.currentStats = {};
          this.activityLog = [];
          this.sendStatsToWebView();
          break;
        case 'reload':
          vscode.commands.executeCommand('workbench.action.reloadWindow');
          break;
        case 'applyPreset':
          this.applyPreset(msg.preset);
          break;
        case 'exportSettings':
          this.exportSettings();
          break;
        case 'openShop':
          vscode.env.openExternal(vscode.Uri.parse('https://shop.nemarkdigital.com'));
          break;
        case 'proxyStart':
        case 'proxyStop':
        case 'proxySaveConfig':
        case 'proxyRegenKey':
          if (this.onProxyAction) {
            this.onProxyAction(msg.type, msg.data);
          }
          break;
        case 'copyToClipboard':
          vscode.env.clipboard.writeText(msg.text);
          vscode.window.showInformationMessage('Copied to clipboard!');
          break;
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = null;
      if (this.statsUpdateInterval) {
        clearInterval(this.statsUpdateInterval);
        this.statsUpdateInterval = null;
      }
    });

    this.sendCurrentSettings();

    this.statsUpdateInterval = setInterval(() => {
      this.sendStatsToWebView();
    }, 2000);
  }

  private applyPreset(preset: string): void {
    let clickInterval = 1000;
    let scrollInterval = 500;

    switch (preset) {
      case 'turbo':
        clickInterval = 200;
        scrollInterval = 200;
        break;
      case 'fast':
        clickInterval = 500;
        scrollInterval = 300;
        break;
      case 'balanced':
        clickInterval = 1000;
        scrollInterval = 500;
        break;
      case 'careful':
        clickInterval = 3000;
        scrollInterval = 1000;
        break;
    }

    const config = vscode.workspace.getConfiguration('autoAccept');
    config.update('clickInterval', clickInterval, vscode.ConfigurationTarget.Global);
    config.update('scrollInterval', scrollInterval, vscode.ConfigurationTarget.Global);

    if (this.onSettingsChange) {
      this.onSettingsChange({
        acceptEnabled: config.get('acceptEnabled', true),
        scrollEnabled: config.get('scrollEnabled', true),
        clickInterval,
        scrollInterval,
        patterns: config.get('patterns', {}),
        nativeDialogEnabled: config.get('nativeDialogEnabled', true)
      });
    }

    this.sendCurrentSettings();
  }

  private async exportSettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration('autoAccept');
    const data = {
      version: '8.0.0',
      settings: {
        acceptEnabled: config.get('acceptEnabled'),
        scrollEnabled: config.get('scrollEnabled'),
        clickInterval: config.get('clickInterval'),
        scrollInterval: config.get('scrollInterval'),
        patterns: config.get('patterns'),
        nativeDialogEnabled: config.get('nativeDialogEnabled'),
        commandsApiEnabled: config.get('commandsApiEnabled'),
      },
      stats: this.currentStats,
      exportedAt: new Date().toISOString()
    };

    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(data, null, 2),
      language: 'json'
    });
    await vscode.window.showTextDocument(doc);
  }

  private sendCurrentSettings(): void {
    if (!this.panel) return;
    const config = vscode.workspace.getConfiguration('autoAccept');
    this.panel.webview.postMessage({
      type: 'settings',
      settings: {
        acceptEnabled: config.get('acceptEnabled', true),
        scrollEnabled: config.get('scrollEnabled', true),
        clickInterval: config.get('clickInterval', 1000),
        scrollInterval: config.get('scrollInterval', 500),
        patterns: config.get('patterns', {}),
        nativeDialogEnabled: config.get('nativeDialogEnabled', true),
        commandsApiEnabled: config.get('commandsApiEnabled', true)
      }
    });
  }

  updateStats(stats: Record<string, number>): void {
    // Track activity log
    for (const [pattern, count] of Object.entries(stats)) {
      const prev = this.currentStats[pattern] || 0;
      if (count > prev) {
        this.activityLog.unshift({
          time: new Date().toLocaleTimeString('vi-VN'),
          pattern,
          count: count - prev
        });
        if (this.activityLog.length > 100) {
          this.activityLog = this.activityLog.slice(0, 100);
        }
      }
    }
    this.currentStats = stats;
  }

  private sendStatsToWebView(): void {
    if (!this.panel) return;
    this.panel.webview.postMessage({
      type: 'stats',
      stats: this.currentStats,
      activityLog: this.activityLog.slice(0, 50),
      sessionStart: this.sessionStart
    });
  }

  onSettings(cb: (settings: any) => void): void {
    this.onSettingsChange = cb;
  }

  onReset(cb: () => void): void {
    this.onStatsReset = cb;
  }

  onProxy(cb: (action: string, data?: any) => void): void {
    this.onProxyAction = cb;
  }

  updateProxyStatus(status: any, apiKey?: string): void {
    this.proxyStatus = status;
    if (apiKey) this.proxyApiKey = apiKey;
    if (!this.panel) return;
    this.panel.webview.postMessage({
      type: 'proxyStatus',
      status: this.proxyStatus,
      apiKey: this.proxyApiKey,
    });
  }

  isVisible(): boolean {
    return this.panel !== null;
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
    }
  }

  private getHtml(): string {
    const config = vscode.workspace.getConfiguration('autoAccept');
    const patterns = config.get<Record<string, boolean>>('patterns', {});
    const clickInterval = config.get<number>('clickInterval', 1000);
    const scrollInterval = config.get<number>('scrollInterval', 500);
    const acceptEnabled = config.get<boolean>('acceptEnabled', true);
    const scrollEnabled = config.get<boolean>('scrollEnabled', true);
    const nativeDialogEnabled = config.get<boolean>('nativeDialogEnabled', true);
    const commandsApiEnabled = config.get<boolean>('commandsApiEnabled', true);

    // Build pattern cards HTML
    let patternCardsHtml = '';
    for (const [pattern, enabled] of Object.entries(patterns)) {
      const displayName = DISPLAY_NAMES[pattern] || pattern;
      const icon = PATTERN_ICONS[pattern] || '🔘';
      const desc = PATTERN_DESCRIPTIONS[pattern] || '';
      patternCardsHtml += `
        <div class="pattern-card ${enabled ? 'active' : ''}">
          <div class="pattern-card-header">
            <span class="pattern-icon">${icon}</span>
            <span class="pattern-display-name">${displayName}</span>
            <label class="toggle">
              <input type="checkbox" data-pattern="${pattern}" ${enabled ? 'checked' : ''}>
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </div>
          <div class="pattern-desc">${desc}</div>
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AG Auto Click & Scroll — Dashboard</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  :root {
    --bg-primary: #0a0a0f;
    --bg-secondary: #12121a;
    --bg-card: rgba(255, 255, 255, 0.03);
    --bg-card-hover: rgba(255, 255, 255, 0.06);
    --bg-glass: rgba(255, 255, 255, 0.04);
    --border: rgba(255, 255, 255, 0.06);
    --border-hover: rgba(255, 255, 255, 0.12);
    --text: #e4e4e7;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --accent: #6366f1;
    --accent-glow: rgba(99, 102, 241, 0.3);
    --accent2: #8b5cf6;
    --success: #22c55e;
    --success-glow: rgba(34, 197, 94, 0.3);
    --warning: #f59e0b;
    --warning-glow: rgba(245, 158, 11, 0.3);
    --danger: #ef4444;
    --danger-glow: rgba(239, 68, 68, 0.3);
    --cyan: #06b6d4;
    --pink: #ec4899;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg-primary);
    color: var(--text);
    line-height: 1.6;
    overflow-x: hidden;
  }

  /* ===== HEADER ===== */
  .header {
    padding: 24px 24px 0;
    position: relative;
  }

  .header::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -20%;
    width: 140%;
    height: 200%;
    background: radial-gradient(ellipse at 30% 0%, rgba(99, 102, 241, 0.08) 0%, transparent 60%),
                radial-gradient(ellipse at 70% 0%, rgba(139, 92, 246, 0.06) 0%, transparent 50%);
    pointer-events: none;
  }

  .header-content {
    position: relative;
    z-index: 1;
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .logo-area {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo-icon {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    box-shadow: 0 4px 16px var(--accent-glow);
  }

  .logo-text {
    font-size: 18px;
    font-weight: 700;
    background: linear-gradient(135deg, #e4e4e7, #a1a1aa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .version-badge {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    color: white;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .header-stats {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .header-stat {
    flex: 1;
    background: var(--bg-glass);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px 16px;
    backdrop-filter: blur(20px);
    transition: all 0.3s ease;
  }

  .header-stat:hover {
    border-color: var(--border-hover);
    background: var(--bg-card-hover);
  }

  .header-stat .stat-value {
    font-size: 24px;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 4px;
  }

  .header-stat .stat-label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 600;
  }

  .stat-accent { color: var(--accent); }
  .stat-success { color: var(--success); }
  .stat-warning { color: var(--warning); }
  .stat-cyan { color: var(--cyan); }

  /* ===== TABS ===== */
  .tabs {
    display: flex;
    gap: 2px;
    padding: 20px 24px 0;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--bg-primary);
    z-index: 10;
  }

  .tab {
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.25s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
  }

  .tab:hover {
    color: var(--text-secondary);
  }

  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .tab-icon {
    font-size: 14px;
  }

  /* ===== TAB CONTENT ===== */
  .tab-content {
    display: none;
    padding: 20px 24px;
    animation: fadeIn 0.3s ease;
  }

  .tab-content.active {
    display: block;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ===== CARDS ===== */
  .card {
    background: var(--bg-glass);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 16px;
    backdrop-filter: blur(20px);
    transition: all 0.3s ease;
  }

  .card:hover {
    border-color: var(--border-hover);
  }

  .card-title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: var(--text-muted);
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-title .icon {
    font-size: 16px;
  }

  /* ===== STATUS INDICATORS ===== */
  .status-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .status-item {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    text-align: center;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  .status-item.on {
    border-color: rgba(34, 197, 94, 0.2);
  }

  .status-item.on::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--success), var(--cyan));
  }

  .status-item.off {
    border-color: rgba(239, 68, 68, 0.15);
    opacity: 0.6;
  }

  .status-item.off::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--danger);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 6px;
    animation: pulse 2s infinite;
  }

  .status-dot.on { background: var(--success); box-shadow: 0 0 8px var(--success-glow); }
  .status-dot.off { background: var(--danger); animation: none; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .status-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .status-value {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 4px;
  }

  /* ===== TOGGLE SWITCHES ===== */
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 0;
    border-bottom: 1px solid var(--border);
  }

  .setting-row:last-child {
    border-bottom: none;
  }

  .setting-info {
    flex: 1;
  }

  .setting-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .setting-desc {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .toggle {
    position: relative;
    display: inline-block;
    width: 48px;
    height: 26px;
    flex-shrink: 0;
    cursor: pointer;
  }

  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: #27272a;
    border-radius: 26px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid var(--border);
  }

  .toggle-thumb {
    position: absolute;
    width: 20px;
    height: 20px;
    left: 3px;
    top: 2px;
    background: #71717a;
    border-radius: 50%;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .toggle input:checked + .toggle-track {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 16px var(--accent-glow);
  }

  .toggle input:checked + .toggle-track .toggle-thumb {
    transform: translateX(22px);
    background: white;
  }

  /* ===== RANGE SLIDERS ===== */
  .slider-row {
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
  }

  .slider-row:last-child {
    border-bottom: none;
  }

  .slider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .slider-name {
    font-size: 14px;
    font-weight: 600;
  }

  .slider-value {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 2px 10px;
    font-size: 13px;
    font-weight: 700;
    font-family: 'SF Mono', 'Cascadia Code', monospace;
    color: var(--accent);
  }

  input[type="range"] {
    -webkit-appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--accent) 0%, var(--accent2) 100%);
    outline: none;
    opacity: 0.8;
    transition: opacity 0.2s;
  }

  input[type="range"]:hover {
    opacity: 1;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: white;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 3px var(--accent-glow);
    transition: transform 0.2s;
  }

  input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }

  /* ===== PRESETS ===== */
  .presets-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-top: 12px;
  }

  .preset-btn {
    background: linear-gradient(145deg, var(--bg-secondary), rgba(255,255,255,0.02));
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px 10px 14px;
    cursor: pointer;
    text-align: center;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    color: var(--text);
    position: relative;
    overflow: hidden;
  }

  .preset-btn::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: transparent;
    transition: background 0.3s;
  }

  .preset-btn:hover {
    border-color: var(--accent);
    background: rgba(99, 102, 241, 0.08);
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
  }

  .preset-btn:hover::before {
    background: linear-gradient(90deg, var(--accent), var(--accent2));
  }

  .preset-btn.active {
    border-color: var(--accent);
    background: rgba(99, 102, 241, 0.15);
    box-shadow: 0 0 24px var(--accent-glow), 0 4px 12px rgba(0,0,0,0.2);
  }

  .preset-btn.active::before {
    background: linear-gradient(90deg, var(--accent), var(--accent2));
  }

  .preset-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 8px;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    transition: all 0.3s;
  }

  .preset-btn:hover .preset-icon {
    background: rgba(99, 102, 241, 0.12);
    border-color: var(--accent);
    transform: scale(1.1);
  }

  .preset-btn.active .preset-icon {
    background: rgba(99, 102, 241, 0.2);
    border-color: var(--accent);
    box-shadow: 0 0 12px var(--accent-glow);
  }

  .preset-name {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .preset-value {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 4px;
    font-family: 'SF Mono', monospace;
    font-weight: 600;
  }

  /* ===== PATTERN CARDS ===== */
  .patterns-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .patterns-actions {
    display: flex;
    gap: 8px;
  }

  .btn-sm {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-sm:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(99, 102, 241, 0.08);
  }

  .patterns-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
  }

  .pattern-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    transition: all 0.3s ease;
  }

  .pattern-card.active {
    border-color: rgba(34, 197, 94, 0.2);
  }

  .pattern-card:hover {
    border-color: var(--border-hover);
    transform: translateY(-1px);
  }

  .pattern-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pattern-icon {
    font-size: 18px;
  }

  .pattern-display-name {
    font-size: 14px;
    font-weight: 600;
    flex: 1;
  }

  .pattern-desc {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 8px;
    line-height: 1.5;
  }

  /* ===== STATS BARS ===== */
  .stat-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
  }

  .stat-row + .stat-row {
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }

  .stat-name {
    min-width: 110px;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-bar-track {
    flex: 1;
    height: 8px;
    background: var(--bg-secondary);
    border-radius: 4px;
    overflow: hidden;
  }

  .stat-bar-fill {
    height: 100%;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .stat-count {
    min-width: 40px;
    text-align: right;
    font-family: 'SF Mono', monospace;
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
  }

  .crown-badge {
    font-size: 14px;
  }

  /* ===== ACTIVITY LOG ===== */
  .log-container {
    max-height: 400px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  .log-entry {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    transition: background 0.2s;
  }

  .log-entry:hover {
    background: var(--bg-card-hover);
  }

  .log-time {
    font-family: 'SF Mono', monospace;
    font-size: 12px;
    color: var(--text-muted);
    min-width: 70px;
  }

  .log-icon {
    font-size: 14px;
  }

  .log-pattern {
    font-weight: 600;
    flex: 1;
  }

  .log-count {
    background: var(--bg-secondary);
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
  }

  .log-empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted);
    font-size: 14px;
  }

  .log-empty-icon {
    font-size: 32px;
    margin-bottom: 8px;
    opacity: 0.5;
  }

  /* ===== BUTTONS ===== */
  .btn-group {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    font-family: inherit;
    transition: all 0.25s ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .btn:active {
    transform: translateY(0);
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    color: white;
  }

  .btn-danger {
    background: rgba(239, 68, 68, 0.15);
    color: var(--danger);
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .btn-warning {
    background: rgba(245, 158, 11, 0.15);
    color: var(--warning);
    border: 1px solid rgba(245, 158, 11, 0.2);
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    padding: 8px 14px;
    font-size: 12px;
  }

  /* ===== FOOTER ===== */
  .footer {
    padding: 20px 24px;
    border-top: 1px solid var(--border);
    margin-top: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .footer-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .footer-brand {
    font-size: 11px;
    color: var(--text-muted);
  }

  .footer-brand a {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }

  .footer-brand a:hover {
    text-decoration: underline;
  }

  .footer-shortcuts {
    font-size: 11px;
    color: var(--text-muted);
    display: flex;
    gap: 12px;
  }

  .kbd {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 6px;
    font-family: 'SF Mono', monospace;
    font-size: 10px;
    font-weight: 600;
  }

  /* ===== PROXY TAB ===== */
  .proxy-status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .proxy-status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .proxy-status-text {
    font-size: 14px;
    font-weight: 600;
  }

  .proxy-input {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    padding: 6px 10px;
    font-size: 13px;
    font-family: 'SF Mono', monospace;
    text-align: center;
    outline: none;
    transition: border-color 0.2s;
  }

  .proxy-input:focus {
    border-color: var(--accent);
  }

  .proxy-select {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    padding: 6px 10px;
    font-size: 13px;
    outline: none;
    cursor: pointer;
  }

  .proxy-select:focus {
    border-color: var(--accent);
  }

  .proxy-key-display {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    font-family: 'SF Mono', monospace;
    color: var(--accent);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .proxy-endpoint-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .proxy-endpoint {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--bg-secondary);
    border-radius: 8px;
    font-size: 13px;
  }

  .proxy-endpoint code {
    color: var(--accent);
    font-family: 'SF Mono', monospace;
    font-size: 12px;
  }

  .proxy-protocol {
    background: rgba(99, 102, 241, 0.12);
    color: var(--accent);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    min-width: 65px;
    text-align: center;
  }

  .proxy-code-block {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }

  .proxy-code-label {
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
  }

  .proxy-code {
    padding: 12px 14px;
    font-family: 'SF Mono', 'Cascadia Code', monospace;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
  }

  .proxy-port-val, .proxy-key-val {
    color: var(--accent);
  }
</style>
</head>
<body>

  <!-- ===== HEADER ===== -->
  <div class="header">
    <div class="header-content">
      <div class="header-top">
        <div class="logo-area">
          <div class="logo-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
          <span class="logo-text">AG Auto Click & Scroll</span>
        </div>
        <span class="version-badge">v8.0</span>
      </div>

      <div class="header-stats">
        <div class="header-stat">
          <div class="stat-value stat-accent" id="totalClicks">0</div>
          <div class="stat-label">Total Clicks</div>
        </div>
        <div class="header-stat">
          <div class="stat-value stat-success" id="clickRate">0</div>
          <div class="stat-label">Clicks/Min</div>
        </div>
        <div class="header-stat">
          <div class="stat-value stat-cyan" id="sessionTime">00:00</div>
          <div class="stat-label">Session</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== TABS ===== -->
  <div class="tabs">
    <div class="tab active" data-tab="dashboard"><span class="tab-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span> Dashboard</div>
    <div class="tab" data-tab="settings"><span class="tab-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg></span> Settings</div>
    <div class="tab" data-tab="patterns"><span class="tab-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> Patterns</div>
    <div class="tab" data-tab="activity"><span class="tab-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span> Activity</div>
    <div class="tab" data-tab="proxy"><span class="tab-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg></span> Proxy</div>
  </div>

  <!-- ===== DASHBOARD TAB ===== -->
  <div class="tab-content active" id="tab-dashboard">
    <!-- Status Grid -->
    <div class="card">
      <div class="card-title"><span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span> Live Status</div>
      <div class="status-grid">
        <div class="status-item ${acceptEnabled ? 'on' : 'off'}" id="statusAccept">
          <div><span class="status-dot ${acceptEnabled ? 'on' : 'off'}" id="dotAccept"></span><span class="status-label">Accept</span></div>
          <div class="status-value">${acceptEnabled ? 'Active' : 'Disabled'}</div>
        </div>
        <div class="status-item ${scrollEnabled ? 'on' : 'off'}" id="statusScroll">
          <div><span class="status-dot ${scrollEnabled ? 'on' : 'off'}" id="dotScroll"></span><span class="status-label">Scroll</span></div>
          <div class="status-value">${scrollEnabled ? 'Active' : 'Disabled'}</div>
        </div>
        <div class="status-item ${nativeDialogEnabled ? 'on' : 'off'}" id="statusNative">
          <div><span class="status-dot ${nativeDialogEnabled ? 'on' : 'off'}" id="dotNative"></span><span class="status-label">Native</span></div>
          <div class="status-value">${nativeDialogEnabled ? 'Active' : 'Disabled'}</div>
        </div>
      </div>
    </div>

    <!-- Click Stats -->
    <div class="card">
      <div class="card-title"><span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span> Click Statistics</div>
      <div id="statsContainer">
        <div class="log-empty">
          <div class="log-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
          <div>No clicks recorded yet</div>
          <div style="font-size: 12px; margin-top: 4px;">Stats will appear as buttons are clicked</div>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-danger" id="resetStatsBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> Reset Stats</button>
        <button class="btn btn-ghost" id="exportBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Export</button>
      </div>
    </div>
  </div>

  <!-- ===== SETTINGS TAB ===== -->
  <div class="tab-content" id="tab-settings">
    <!-- Main Controls -->
    <div class="card">
      <div class="card-title"><span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg></span> Controls</div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">Auto Accept</div>
          <div class="setting-desc">Automatically click approval buttons in chat</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="acceptToggle" ${acceptEnabled ? 'checked' : ''}>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">Auto Scroll</div>
          <div class="setting-desc">Keep chat scrolled to the latest message</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="scrollToggle" ${scrollEnabled ? 'checked' : ''}>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">Native Dialog (Win32)</div>
          <div class="setting-desc">Auto-click Keep Waiting in system dialogs</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="nativeToggle" ${nativeDialogEnabled ? 'checked' : ''}>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">Commands API</div>
          <div class="setting-desc">Use internal API for more reliable acceptance</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="commandsApiToggle" ${commandsApiEnabled ? 'checked' : ''}>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
    </div>

    <!-- Speed Presets -->
    <div class="card">
      <div class="card-title"><span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></span> Speed Profiles</div>
      <div class="presets-row">
        <div class="preset-btn" data-preset="turbo">
          <span class="preset-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>
          <div class="preset-name">Turbo</div>
          <div class="preset-value">200ms</div>
        </div>
        <div class="preset-btn" data-preset="fast">
          <span class="preset-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>
          <div class="preset-name">Fast</div>
          <div class="preset-value">500ms</div>
        </div>
        <div class="preset-btn ${clickInterval === 1000 ? 'active' : ''}" data-preset="balanced">
          <span class="preset-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span>
          <div class="preset-name">Balanced</div>
          <div class="preset-value">1000ms</div>
        </div>
        <div class="preset-btn" data-preset="careful">
          <span class="preset-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
          <div class="preset-name">Careful</div>
          <div class="preset-value">3000ms</div>
        </div>
      </div>
    </div>

    <!-- Speed Sliders -->
    <div class="card">
      <div class="card-title"><span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span> Fine Tuning</div>
      <div class="slider-row">
        <div class="slider-header">
          <span class="slider-name">Click Interval</span>
          <span class="slider-value" id="clickIntervalValue">${clickInterval}ms</span>
        </div>
        <input type="range" id="clickInterval" min="100" max="5000" step="100" value="${clickInterval}">
      </div>
      <div class="slider-row">
        <div class="slider-header">
          <span class="slider-name">Scroll Interval</span>
          <span class="slider-value" id="scrollIntervalValue">${scrollInterval}ms</span>
        </div>
        <input type="range" id="scrollInterval" min="100" max="3000" step="100" value="${scrollInterval}">
      </div>
    </div>

    <!-- Actions -->
    <div class="btn-group">
      <button class="btn btn-primary" id="saveBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save & Apply</button>
      <button class="btn btn-warning" id="reloadBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Reload Window</button>
    </div>
  </div>

  <!-- ===== PATTERNS TAB ===== -->
  <div class="tab-content" id="tab-patterns">
    <div class="patterns-toolbar">
      <div class="card-title" style="margin: 0;"><span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> Button Patterns</div>
      <div class="patterns-actions">
        <button class="btn-sm" id="enableAllBtn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Enable All</button>
        <button class="btn-sm" id="disableAllBtn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Disable All</button>
      </div>
    </div>
    <div class="patterns-grid">
      ${patternCardsHtml}
    </div>
  </div>

  <!-- ===== ACTIVITY LOG TAB ===== -->
  <div class="tab-content" id="tab-activity">
    <div class="card">
      <div class="card-title"><span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span> Recent Activity</div>
      <div class="log-container" id="logContainer">
        <div class="log-empty">
          <div class="log-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div>No activity yet</div>
          <div style="font-size: 12px; margin-top: 4px;">Click events will appear here in real-time</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== PROXY TAB ===== -->
  <div class="tab-content" id="tab-proxy">
    <!-- Service Status -->
    <div class="card">
      <div class="card-title"><span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg></span> Proxy Service</div>
      <div class="proxy-status-bar" id="proxyStatusBar">
        <div class="proxy-status-indicator">
          <span class="status-dot off" id="proxyDot"></span>
          <span class="proxy-status-text" id="proxyStatusText">Stopped</span>
        </div>
        <button class="btn btn-primary" id="proxyToggleBtn" style="padding: 8px 16px;">Start</button>
      </div>
      <div class="proxy-info-grid" style="margin-top: 14px;">
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-name">Port</div>
            <div class="setting-desc">TCP port for local proxy (restart to apply)</div>
          </div>
          <input type="number" id="proxyPort" value="8045" min="1024" max="65535" class="proxy-input" style="width:80px">
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-name">Request Timeout</div>
            <div class="setting-desc">Max seconds to wait for upstream (30-7200)</div>
          </div>
          <input type="number" id="proxyTimeout" value="120" min="30" max="7200" class="proxy-input" style="width:80px">
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-name">Allow LAN</div>
            <div class="setting-desc">Bind to 0.0.0.0 for network access</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="proxyLan">
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-name">Auto-start</div>
            <div class="setting-desc">Start proxy when extension activates</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="proxyAutoStart">
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
          </label>
        </div>
      </div>
    </div>

    <!-- Auth -->
    <div class="card">
      <div class="card-title"><span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></span> Authentication</div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">API Key</div>
          <div class="setting-desc">Shared secret for client authentication</div>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <code class="proxy-key-display" id="proxyKeyDisplay">-</code>
          <button class="btn-sm" id="copyKeyBtn" title="Copy"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
          <button class="btn-sm" id="regenKeyBtn" title="Regenerate"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg></button>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">Auth Mode</div>
          <div class="setting-desc">Auto = off for localhost, on for LAN</div>
        </div>
        <select id="proxyAuthMode" class="proxy-select">
          <option value="auto">Auto</option>
          <option value="all">All requests</option>
          <option value="allExceptHealth">All except /healthz</option>
          <option value="off">Disabled</option>
        </select>
      </div>
    </div>

    <!-- Endpoints -->
    <div class="card">
      <div class="card-title"><span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></span> Endpoints</div>
      <div class="proxy-endpoint-list">
        <div class="proxy-endpoint"><span class="proxy-protocol">OpenAI</span><code>/v1/chat/completions</code></div>
        <div class="proxy-endpoint"><span class="proxy-protocol">OpenAI</span><code>/v1/completions</code></div>
        <div class="proxy-endpoint"><span class="proxy-protocol">OpenAI</span><code>/v1/responses</code> (Codex)</div>
        <div class="proxy-endpoint"><span class="proxy-protocol">Anthropic</span><code>/v1/messages</code></div>
        <div class="proxy-endpoint"><span class="proxy-protocol">Gemini</span><code>/v1beta/models/...</code></div>
        <div class="proxy-endpoint"><span class="proxy-protocol">Models</span><code>/v1/models</code></div>
        <div class="proxy-endpoint"><span class="proxy-protocol">Health</span><code>/healthz</code></div>
      </div>
    </div>

    <!-- Quick Integration -->
    <div class="card">
      <div class="card-title"><span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span> Quick Integration</div>
      <div class="proxy-code-block">
        <div class="proxy-code-label">Python (OpenAI SDK)</div>
        <pre class="proxy-code" id="pythonSnippet">from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:<span class="proxy-port-val">8045</span>/v1",
    api_key="<span class="proxy-key-val">-</span>"
)

response = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Hello"}]
)
print(response.choices[0].message.content)</pre>
      </div>
      <div class="proxy-code-block" style="margin-top: 10px;">
        <div class="proxy-code-label">Cursor / VS Code — settings.json</div>
        <pre class="proxy-code">{"openai.baseUrl": "http://127.0.0.1:<span class="proxy-port-val">8045</span>/v1",
 "openai.apiKey": "<span class="proxy-key-val">-</span>"}</pre>
      </div>
    </div>

    <div class="btn-group">
      <button class="btn btn-primary" id="proxySaveBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Proxy Config</button>
    </div>
  </div>

  <!-- ===== FOOTER ===== -->
  <div class="footer">
    <div class="footer-left">
      <div class="footer-brand">
        Powered by <a href="#" id="shopLink">Nemark Digital</a> · v9.0
      </div>
    </div>
    <div class="footer-shortcuts">
      <span><span class="kbd">Ctrl</span>+<span class="kbd">Alt</span>+<span class="kbd">A</span> Toggle</span>
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  let sessionStartTime = Date.now();
  let lastTotalClicks = 0;
  let clickRateHistory = [];

  // ===== TABS =====
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ===== TOGGLES =====
  ['acceptToggle', 'scrollToggle', 'nativeToggle', 'commandsApiToggle'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => instantSave());
  });

  // ===== SLIDERS =====
  document.getElementById('clickInterval').addEventListener('input', (e) => {
    document.getElementById('clickIntervalValue').textContent = e.target.value + 'ms';
    updatePresetHighlight(parseInt(e.target.value));
  });

  document.getElementById('scrollInterval').addEventListener('input', (e) => {
    document.getElementById('scrollIntervalValue').textContent = e.target.value + 'ms';
  });

  document.getElementById('clickInterval').addEventListener('change', () => instantSave());
  document.getElementById('scrollInterval').addEventListener('change', () => instantSave());

  // ===== PRESETS =====
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      vscode.postMessage({ type: 'applyPreset', preset: btn.dataset.preset });
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  function updatePresetHighlight(value) {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    const map = { 200: 'turbo', 500: 'fast', 1000: 'balanced', 3000: 'careful' };
    if (map[value]) {
      document.querySelector('[data-preset="' + map[value] + '"]').classList.add('active');
    }
  }

  // ===== PATTERNS =====
  document.querySelectorAll('[data-pattern]').forEach(el => {
    el.addEventListener('change', () => {
      const card = el.closest('.pattern-card');
      if (card) card.classList.toggle('active', el.checked);
      instantSave();
    });
  });

  document.getElementById('enableAllBtn').addEventListener('click', () => {
    document.querySelectorAll('[data-pattern]').forEach(el => {
      el.checked = true;
      const card = el.closest('.pattern-card');
      if (card) card.classList.add('active');
    });
    instantSave();
  });

  document.getElementById('disableAllBtn').addEventListener('click', () => {
    document.querySelectorAll('[data-pattern]').forEach(el => {
      el.checked = false;
      const card = el.closest('.pattern-card');
      if (card) card.classList.remove('active');
    });
    instantSave();
  });

  // ===== BUTTONS =====
  document.getElementById('saveBtn').addEventListener('click', () => saveSettings());
  document.getElementById('reloadBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'reload' });
  });
  document.getElementById('resetStatsBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'resetStats' });
    clickRateHistory = [];
  });
  document.getElementById('exportBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'exportSettings' });
  });
  document.getElementById('shopLink').addEventListener('click', (e) => {
    e.preventDefault();
    vscode.postMessage({ type: 'openShop' });
  });

  // ===== SAVE =====
  function instantSave() { saveSettings(); }

  function saveSettings() {
    const patterns = {};
    document.querySelectorAll('[data-pattern]').forEach(el => {
      patterns[el.getAttribute('data-pattern')] = el.checked;
    });

    vscode.postMessage({
      type: 'saveSettings',
      settings: {
        acceptEnabled: document.getElementById('acceptToggle').checked,
        scrollEnabled: document.getElementById('scrollToggle').checked,
        clickInterval: parseInt(document.getElementById('clickInterval').value),
        scrollInterval: parseInt(document.getElementById('scrollInterval').value),
        patterns: patterns,
        nativeDialogEnabled: document.getElementById('nativeToggle').checked,
        commandsApiEnabled: document.getElementById('commandsApiToggle').checked
      }
    });

    // Update status indicators
    updateStatusUI();
  }

  function updateStatusUI() {
    const accept = document.getElementById('acceptToggle').checked;
    const scroll = document.getElementById('scrollToggle').checked;
    const native = document.getElementById('nativeToggle').checked;

    updateStatusItem('statusAccept', 'dotAccept', accept);
    updateStatusItem('statusScroll', 'dotScroll', scroll);
    updateStatusItem('statusNative', 'dotNative', native);
  }

  function updateStatusItem(itemId, dotId, isOn) {
    const item = document.getElementById(itemId);
    const dot = document.getElementById(dotId);
    if (!item || !dot) return;
    item.className = 'status-item ' + (isOn ? 'on' : 'off');
    dot.className = 'status-dot ' + (isOn ? 'on' : 'off');
    item.querySelector('.status-value').textContent = isOn ? 'Active' : 'Disabled';
  }

  // ===== STATS =====
  const displayNames = ${JSON.stringify(DISPLAY_NAMES)};
  const patternIcons = ${JSON.stringify(PATTERN_ICONS).replace(/<\//g, '<\\/')};

  function updateStats(stats) {
    const container = document.getElementById('statsContainer');
    const entries = Object.entries(stats).filter(([k, v]) => v > 0);

    const total = entries.reduce((sum, [k, v]) => sum + v, 0);
    document.getElementById('totalClicks').textContent = total.toLocaleString();

    // Click rate calculation
    clickRateHistory.push({ time: Date.now(), total });
    if (clickRateHistory.length > 30) clickRateHistory.shift();
    if (clickRateHistory.length >= 2) {
      const first = clickRateHistory[0];
      const last = clickRateHistory[clickRateHistory.length - 1];
      const minutes = (last.time - first.time) / 60000;
      const rate = minutes > 0 ? ((last.total - first.total) / minutes).toFixed(1) : '0';
      document.getElementById('clickRate').textContent = rate;
    }

    if (entries.length === 0) {
      container.innerHTML = '<div class="log-empty"><div class="log-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div><div>No clicks recorded yet</div></div>';
      return;
    }

    const maxCount = Math.max(...entries.map(([k, v]) => v));
    entries.sort((a, b) => b[1] - a[1]);

    let html = '';
    entries.forEach(([pattern, count], idx) => {
      const pct = (count / maxCount) * 100;
      const name = displayNames[pattern] || pattern;
      const icon = patternIcons[pattern] || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
      const isCrown = idx === 0;
      html += '<div class="stat-row">';
      html += '<span class="stat-name">' + (isCrown ? '<span class="crown-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5"><path d="M2 4l3 12h14l3-12-6 7-4-9-4 9-6-7z"/><rect x="4" y="18" width="16" height="2" rx="1"/></svg></span> ' : icon + ' ') + name + '</span>';
      html += '<div class="stat-bar-track"><div class="stat-bar-fill" style="width:' + pct + '%"></div></div>';
      html += '<span class="stat-count">' + count + '</span>';
      html += '</div>';
    });

    container.innerHTML = html;
  }

  function updateActivityLog(log) {
    const container = document.getElementById('logContainer');
    if (!log || log.length === 0) {
      container.innerHTML = '<div class="log-empty"><div class="log-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div>No activity yet</div></div>';
      return;
    }

    let html = '';
    log.forEach(entry => {
      const icon = patternIcons[entry.pattern] || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
      const name = displayNames[entry.pattern] || entry.pattern;
      html += '<div class="log-entry">';
      html += '<span class="log-time">' + entry.time + '</span>';
      html += '<span class="log-icon">' + icon + '</span>';
      html += '<span class="log-pattern">' + name + '</span>';
      html += '<span class="log-count">+' + entry.count + '</span>';
      html += '</div>';
    });

    container.innerHTML = html;
  }

  // ===== SESSION TIMER =====
  function updateSessionTimer(startTime) {
    sessionStartTime = startTime || sessionStartTime;
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;

    let timeStr;
    if (h > 0) {
      timeStr = h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    } else {
      timeStr = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    document.getElementById('sessionTime').textContent = timeStr;
  }

  setInterval(() => updateSessionTimer(), 1000);

  // ===== MESSAGE HANDLER =====
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'stats') {
      updateStats(msg.stats);
      updateActivityLog(msg.activityLog);
      if (msg.sessionStart) {
        sessionStartTime = msg.sessionStart;
      }
    }
    if (msg.type === 'settings') {
      document.getElementById('acceptToggle').checked = msg.settings.acceptEnabled;
      document.getElementById('scrollToggle').checked = msg.settings.scrollEnabled;
      document.getElementById('nativeToggle').checked = msg.settings.nativeDialogEnabled;
      if (msg.settings.commandsApiEnabled !== undefined) {
        document.getElementById('commandsApiToggle').checked = msg.settings.commandsApiEnabled;
      }
      document.getElementById('clickInterval').value = msg.settings.clickInterval;
      document.getElementById('scrollInterval').value = msg.settings.scrollInterval;
      document.getElementById('clickIntervalValue').textContent = msg.settings.clickInterval + 'ms';
      document.getElementById('scrollIntervalValue').textContent = msg.settings.scrollInterval + 'ms';
      updatePresetHighlight(msg.settings.clickInterval);
      updateStatusUI();
    }
    if (msg.type === 'proxyStatus') {
      updateProxyUI(msg.status, msg.apiKey);
    }
  });

  // ===== PROXY =====
  document.getElementById('proxyToggleBtn').addEventListener('click', () => {
    const dot = document.getElementById('proxyDot');
    const isRunning = dot.classList.contains('on');
    vscode.postMessage({ type: isRunning ? 'proxyStop' : 'proxyStart' });
  });

  document.getElementById('proxySaveBtn').addEventListener('click', () => {
    vscode.postMessage({
      type: 'proxySaveConfig',
      data: {
        port: parseInt(document.getElementById('proxyPort').value),
        requestTimeout: parseInt(document.getElementById('proxyTimeout').value),
        allowLan: document.getElementById('proxyLan').checked,
        autoStart: document.getElementById('proxyAutoStart').checked,
        authMode: document.getElementById('proxyAuthMode').value,
      }
    });
  });

  document.getElementById('copyKeyBtn').addEventListener('click', () => {
    const key = document.getElementById('proxyKeyDisplay').textContent;
    vscode.postMessage({ type: 'copyToClipboard', text: key });
  });

  document.getElementById('regenKeyBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'proxyRegenKey' });
  });

  function updateProxyUI(status, apiKey) {
    const dot = document.getElementById('proxyDot');
    const text = document.getElementById('proxyStatusText');
    const btn = document.getElementById('proxyToggleBtn');
    
    if (status.running) {
      dot.className = 'status-dot on';
      text.textContent = 'Running on port ' + status.port;
      text.style.color = 'var(--success)';
      btn.textContent = 'Stop';
      btn.className = 'btn btn-danger';
    } else {
      dot.className = 'status-dot off';
      text.textContent = 'Stopped';
      text.style.color = 'var(--text-muted)';
      btn.textContent = 'Start';
      btn.className = 'btn btn-primary';
    }

    if (apiKey) {
      document.getElementById('proxyKeyDisplay').textContent = apiKey;
      document.querySelectorAll('.proxy-key-val').forEach(el => el.textContent = apiKey);
    }
    if (status.port) {
      document.querySelectorAll('.proxy-port-val').forEach(el => el.textContent = status.port);
    }
  }
</script>
</body>
</html>`;
  }
}
