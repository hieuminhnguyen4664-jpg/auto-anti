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
  'Run': '▶️',
  'Allow': '✅',
  'Always Allow': '🔓',
  'Accept': '👍',
  'Keep Waiting': '⏳',
  'Retry': '🔄',
  'Continue': '➡️',
  'Allow Once': '🔑',
  'Allow This Conversion': '🔀',
  'Accept all': '📋'
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
  private currentStats: Record<string, number> = {};
  private statsUpdateInterval: NodeJS.Timeout | null = null;
  private activityLog: Array<{ time: string; pattern: string; count: number }> = [];
  private sessionStart: number = Date.now();

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
    gap: 8px;
    margin-top: 8px;
  }

  .preset-btn {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 8px;
    cursor: pointer;
    text-align: center;
    transition: all 0.25s ease;
    color: var(--text);
  }

  .preset-btn:hover {
    border-color: var(--accent);
    background: rgba(99, 102, 241, 0.08);
    transform: translateY(-2px);
  }

  .preset-btn.active {
    border-color: var(--accent);
    background: rgba(99, 102, 241, 0.12);
    box-shadow: 0 0 16px var(--accent-glow);
  }

  .preset-icon {
    font-size: 20px;
    display: block;
    margin-bottom: 4px;
  }

  .preset-name {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .preset-value {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 2px;
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
</style>
</head>
<body>

  <!-- ===== HEADER ===== -->
  <div class="header">
    <div class="header-content">
      <div class="header-top">
        <div class="logo-area">
          <div class="logo-icon">⚡</div>
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
    <div class="tab active" data-tab="dashboard"><span class="tab-icon">📊</span> Dashboard</div>
    <div class="tab" data-tab="settings"><span class="tab-icon">⚙️</span> Settings</div>
    <div class="tab" data-tab="patterns"><span class="tab-icon">🎯</span> Patterns</div>
    <div class="tab" data-tab="activity"><span class="tab-icon">📋</span> Activity</div>
  </div>

  <!-- ===== DASHBOARD TAB ===== -->
  <div class="tab-content active" id="tab-dashboard">
    <!-- Status Grid -->
    <div class="card">
      <div class="card-title"><span class="icon">📡</span> Live Status</div>
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
      <div class="card-title"><span class="icon">📈</span> Click Statistics</div>
      <div id="statsContainer">
        <div class="log-empty">
          <div class="log-empty-icon">📊</div>
          <div>No clicks recorded yet</div>
          <div style="font-size: 12px; margin-top: 4px;">Stats will appear as buttons are clicked</div>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-danger" id="resetStatsBtn">🗑️ Reset Stats</button>
        <button class="btn btn-ghost" id="exportBtn">📤 Export</button>
      </div>
    </div>
  </div>

  <!-- ===== SETTINGS TAB ===== -->
  <div class="tab-content" id="tab-settings">
    <!-- Main Controls -->
    <div class="card">
      <div class="card-title"><span class="icon">🎛️</span> Controls</div>
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
      <div class="card-title"><span class="icon">🚀</span> Speed Profiles</div>
      <div class="presets-row">
        <div class="preset-btn" data-preset="turbo">
          <span class="preset-icon">🔥</span>
          <div class="preset-name">Turbo</div>
          <div class="preset-value">200ms</div>
        </div>
        <div class="preset-btn" data-preset="fast">
          <span class="preset-icon">⚡</span>
          <div class="preset-name">Fast</div>
          <div class="preset-value">500ms</div>
        </div>
        <div class="preset-btn ${clickInterval === 1000 ? 'active' : ''}" data-preset="balanced">
          <span class="preset-icon">🎯</span>
          <div class="preset-name">Balanced</div>
          <div class="preset-value">1000ms</div>
        </div>
        <div class="preset-btn" data-preset="careful">
          <span class="preset-icon">🛡️</span>
          <div class="preset-name">Careful</div>
          <div class="preset-value">3000ms</div>
        </div>
      </div>
    </div>

    <!-- Speed Sliders -->
    <div class="card">
      <div class="card-title"><span class="icon">⏱️</span> Fine Tuning</div>
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
      <button class="btn btn-primary" id="saveBtn">💾 Save & Apply</button>
      <button class="btn btn-warning" id="reloadBtn">🔄 Reload Window</button>
    </div>
  </div>

  <!-- ===== PATTERNS TAB ===== -->
  <div class="tab-content" id="tab-patterns">
    <div class="patterns-toolbar">
      <div class="card-title" style="margin: 0;"><span class="icon">🎯</span> Button Patterns</div>
      <div class="patterns-actions">
        <button class="btn-sm" id="enableAllBtn">✅ Enable All</button>
        <button class="btn-sm" id="disableAllBtn">❌ Disable All</button>
      </div>
    </div>
    <div class="patterns-grid">
      ${patternCardsHtml}
    </div>
  </div>

  <!-- ===== ACTIVITY LOG TAB ===== -->
  <div class="tab-content" id="tab-activity">
    <div class="card">
      <div class="card-title"><span class="icon">📋</span> Recent Activity</div>
      <div class="log-container" id="logContainer">
        <div class="log-empty">
          <div class="log-empty-icon">⏳</div>
          <div>No activity yet</div>
          <div style="font-size: 12px; margin-top: 4px;">Click events will appear here in real-time</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== FOOTER ===== -->
  <div class="footer">
    <div class="footer-left">
      <div class="footer-brand">
        Powered by <a href="#" id="shopLink">Nemark Digital</a> · v8.0
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
  const patternIcons = ${JSON.stringify(PATTERN_ICONS)};

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
      container.innerHTML = '<div class="log-empty"><div class="log-empty-icon">📊</div><div>No clicks recorded yet</div></div>';
      return;
    }

    const maxCount = Math.max(...entries.map(([k, v]) => v));
    entries.sort((a, b) => b[1] - a[1]);

    let html = '';
    entries.forEach(([pattern, count], idx) => {
      const pct = (count / maxCount) * 100;
      const name = displayNames[pattern] || pattern;
      const icon = patternIcons[pattern] || '🔘';
      const isCrown = idx === 0;
      html += '<div class="stat-row">';
      html += '<span class="stat-name">' + (isCrown ? '<span class="crown-badge">👑</span> ' : icon + ' ') + name + '</span>';
      html += '<div class="stat-bar-track"><div class="stat-bar-fill" style="width:' + pct + '%"></div></div>';
      html += '<span class="stat-count">' + count + '</span>';
      html += '</div>';
    });

    container.innerHTML = html;
  }

  function updateActivityLog(log) {
    const container = document.getElementById('logContainer');
    if (!log || log.length === 0) {
      container.innerHTML = '<div class="log-empty"><div class="log-empty-icon">⏳</div><div>No activity yet</div></div>';
      return;
    }

    let html = '';
    log.forEach(entry => {
      const icon = patternIcons[entry.pattern] || '🔘';
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
  });
</script>
</body>
</html>`;
  }
}
