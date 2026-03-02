import * as vscode from 'vscode';
import * as path from 'path';

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

export class SettingsPanel {
  private panel: vscode.WebviewPanel | null = null;
  private context: vscode.ExtensionContext;
  private onSettingsChange: ((settings: any) => void) | null = null;
  private onStatsReset: (() => void) | null = null;
  private currentStats: Record<string, number> = {};
  private statsUpdateInterval: NodeJS.Timeout | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Toggle the settings panel visibility
   */
  toggle(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
      return;
    }
    this.show();
  }

  /**
   * Show the settings panel
   */
  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'autoAcceptSettings',
      'AG Auto Click & Scroll - Settings',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getHtml();

    // Handle messages from WebView
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
          this.sendStatsToWebView();
          break;
        case 'reload':
          vscode.commands.executeCommand('workbench.action.reloadWindow');
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

    // Send initial settings
    this.sendCurrentSettings();

    // Start stats update interval
    this.statsUpdateInterval = setInterval(() => {
      this.sendStatsToWebView();
    }, 2000);
  }

  /**
   * Send current settings to WebView
   */
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
        nativeDialogEnabled: config.get('nativeDialogEnabled', true)
      }
    });
  }

  /**
   * Update click stats in the panel
   */
  updateStats(stats: Record<string, number>): void {
    this.currentStats = stats;
  }

  private sendStatsToWebView(): void {
    if (!this.panel) return;
    this.panel.webview.postMessage({
      type: 'stats',
      stats: this.currentStats
    });
  }

  /**
   * Register callbacks
   */
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

  /**
   * Generate the WebView HTML
   */
  private getHtml(): string {
    const config = vscode.workspace.getConfiguration('autoAccept');
    const patterns = config.get<Record<string, boolean>>('patterns', {});
    const clickInterval = config.get<number>('clickInterval', 1000);
    const scrollInterval = config.get<number>('scrollInterval', 500);
    const acceptEnabled = config.get<boolean>('acceptEnabled', true);
    const scrollEnabled = config.get<boolean>('scrollEnabled', true);
    const nativeDialogEnabled = config.get<boolean>('nativeDialogEnabled', true);

    let patternTogglesHtml = '';
    for (const [pattern, enabled] of Object.entries(patterns)) {
      const displayName = DISPLAY_NAMES[pattern] || pattern;
      const defaultOn = pattern !== 'Accept all';
      patternTogglesHtml += `
        <div class="pattern-row">
          <label class="switch-label">
            <span class="pattern-name">${displayName}</span>
            <span class="pattern-key">${pattern}</span>
          </label>
          <label class="switch">
            <input type="checkbox" data-pattern="${pattern}" ${enabled ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AG Auto Click & Scroll Settings</title>
<style>
  :root {
    --bg: #1e1e1e;
    --card: #252526;
    --border: #3c3c3c;
    --text: #cccccc;
    --text-muted: #888888;
    --accent: #4EC9B0;
    --accent2: #569CD6;
    --danger: #F44747;
    --warning: #CCA700;
    --success: #4EC9B0;
    --crown: #FFD700;
  }
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 20px;
    line-height: 1.5;
  }
  
  h1 {
    font-size: 1.4em;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  h1 .badge {
    background: var(--accent);
    color: #1e1e1e;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.7em;
    font-weight: 600;
  }
  
  .subtitle {
    color: var(--text-muted);
    font-size: 0.85em;
    margin-bottom: 20px;
  }
  
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }
  
  .card-title {
    font-size: 1em;
    font-weight: 600;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .section-divider {
    border: none;
    border-top: 1px solid var(--border);
    margin: 12px 0;
  }
  
  /* Toggle Switch */
  .toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
  }
  
  .toggle-row + .toggle-row {
    border-top: 1px solid var(--border);
  }
  
  .switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }
  
  .switch input { opacity: 0; width: 0; height: 0; }
  
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0; left: 0; right: 0; bottom: 0;
    background-color: #555;
    transition: 0.3s;
  }
  
  .slider.round { border-radius: 24px; }
  
  .slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }
  
  input:checked + .slider { background-color: var(--accent); }
  input:checked + .slider:before { transform: translateX(20px); }
  
  /* Pattern rows */
  .pattern-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
  }
  
  .pattern-row + .pattern-row {
    border-top: 1px solid var(--border);
  }
  
  .pattern-name {
    font-size: 0.9em;
    font-weight: 500;
  }
  
  .pattern-key {
    font-size: 0.75em;
    color: var(--text-muted);
    font-family: monospace;
    margin-left: 8px;
  }
  
  .switch-label {
    display: flex;
    align-items: center;
  }
  
  /* Range input */
  .range-row {
    padding: 8px 0;
  }
  
  .range-row + .range-row {
    border-top: 1px solid var(--border);
  }
  
  .range-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  
  .range-value {
    color: var(--accent);
    font-weight: 600;
    font-family: monospace;
  }
  
  input[type="range"] {
    width: 100%;
    accent-color: var(--accent);
  }
  
  /* Stats */
  .stat-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  
  .stat-row + .stat-row {
    border-top: 1px solid var(--border);
    padding-top: 8px;
    margin-top: 4px;
  }
  
  .stat-label {
    min-width: 120px;
    font-size: 0.85em;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .stat-bar-container {
    flex: 1;
    height: 20px;
    background: #333;
    border-radius: 10px;
    overflow: hidden;
  }
  
  .stat-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    border-radius: 10px;
    transition: width 0.5s ease;
    min-width: 0;
  }
  
  .stat-count {
    min-width: 40px;
    text-align: right;
    font-family: monospace;
    font-weight: 600;
    font-size: 0.85em;
  }
  
  .crown { color: var(--crown); }
  
  /* Buttons */
  .btn-group {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }
  
  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85em;
    font-weight: 600;
    transition: all 0.2s;
  }
  
  .btn:hover { opacity: 0.85; transform: translateY(-1px); }
  
  .btn-primary {
    background: var(--accent);
    color: #1e1e1e;
  }
  
  .btn-danger {
    background: var(--danger);
    color: white;
  }
  
  .btn-secondary {
    background: var(--border);
    color: var(--text);
  }
  
  .btn-warning {
    background: var(--warning);
    color: #1e1e1e;
  }
  
  .status-indicator {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 4px;
  }
  
  .status-on { background: var(--success); }
  .status-off { background: var(--danger); }
</style>
</head>
<body>
  <h1>
    ⚡ AG Auto Click & Scroll
    <span class="badge" id="totalBadge">0 clicks</span>
  </h1>
  <p class="subtitle">Settings & Click Stats Dashboard</p>
  
  <!-- Main Toggles -->
  <div class="card">
    <div class="card-title">🎛️ Main Controls</div>
    <div class="toggle-row">
      <span><span class="status-indicator ${acceptEnabled ? 'status-on' : 'status-off'}" id="acceptIndicator"></span> Auto Accept</span>
      <label class="switch">
        <input type="checkbox" id="acceptToggle" ${acceptEnabled ? 'checked' : ''}>
        <span class="slider round"></span>
      </label>
    </div>
    <div class="toggle-row">
      <span><span class="status-indicator ${scrollEnabled ? 'status-on' : 'status-off'}" id="scrollIndicator"></span> Auto Scroll</span>
      <label class="switch">
        <input type="checkbox" id="scrollToggle" ${scrollEnabled ? 'checked' : ''}>
        <span class="slider round"></span>
      </label>
    </div>
    <div class="toggle-row">
      <span><span class="status-indicator ${nativeDialogEnabled ? 'status-on' : 'status-off'}" id="nativeIndicator"></span> Native Dialog (Win32)</span>
      <label class="switch">
        <input type="checkbox" id="nativeToggle" ${nativeDialogEnabled ? 'checked' : ''}>
        <span class="slider round"></span>
      </label>
    </div>
  </div>
  
  <!-- Speed Settings -->
  <div class="card">
    <div class="card-title">⚡ Speed Settings</div>
    <div class="range-row">
      <div class="range-header">
        <span>Click Interval</span>
        <span class="range-value" id="clickIntervalValue">${clickInterval}ms</span>
      </div>
      <input type="range" id="clickInterval" min="200" max="5000" step="100" value="${clickInterval}">
    </div>
    <div class="range-row">
      <div class="range-header">
        <span>Scroll Interval</span>
        <span class="range-value" id="scrollIntervalValue">${scrollInterval}ms</span>
      </div>
      <input type="range" id="scrollInterval" min="200" max="3000" step="100" value="${scrollInterval}">
    </div>
  </div>
  
  <!-- Button Patterns -->
  <div class="card">
    <div class="card-title">🔘 Button Patterns</div>
    ${patternTogglesHtml}
  </div>
  
  <!-- Click Stats -->
  <div class="card">
    <div class="card-title">📊 Click Stats</div>
    <div id="statsContainer">
      <p style="color: var(--text-muted); font-size: 0.85em;">No clicks yet...</p>
    </div>
    <div class="btn-group">
      <button class="btn btn-danger" id="resetStatsBtn">🗑️ Reset Stats</button>
    </div>
  </div>
  
  <!-- Actions -->
  <div class="btn-group">
    <button class="btn btn-primary" id="saveBtn">💾 Save & Apply</button>
    <button class="btn btn-warning" id="reloadBtn">🔄 Reload Window</button>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  
  // Toggle instant apply
  document.getElementById('acceptToggle').addEventListener('change', (e) => {
    const indicator = document.getElementById('acceptIndicator');
    indicator.className = 'status-indicator ' + (e.target.checked ? 'status-on' : 'status-off');
    instantSave();
  });
  
  document.getElementById('scrollToggle').addEventListener('change', (e) => {
    const indicator = document.getElementById('scrollIndicator');
    indicator.className = 'status-indicator ' + (e.target.checked ? 'status-on' : 'status-off');
    instantSave();
  });
  
  document.getElementById('nativeToggle').addEventListener('change', (e) => {
    const indicator = document.getElementById('nativeIndicator');
    indicator.className = 'status-indicator ' + (e.target.checked ? 'status-on' : 'status-off');
    instantSave();
  });
  
  // Range sliders
  document.getElementById('clickInterval').addEventListener('input', (e) => {
    document.getElementById('clickIntervalValue').textContent = e.target.value + 'ms';
  });
  
  document.getElementById('scrollInterval').addEventListener('input', (e) => {
    document.getElementById('scrollIntervalValue').textContent = e.target.value + 'ms';
  });
  
  // Pattern toggles
  document.querySelectorAll('[data-pattern]').forEach(el => {
    el.addEventListener('change', () => instantSave());
  });
  
  // Buttons
  document.getElementById('saveBtn').addEventListener('click', () => saveSettings());
  document.getElementById('reloadBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'reload' });
  });
  document.getElementById('resetStatsBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'resetStats' });
  });
  
  function instantSave() {
    saveSettings();
  }
  
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
        nativeDialogEnabled: document.getElementById('nativeToggle').checked
      }
    });
  }
  
  // Stats display
  const displayNames = ${JSON.stringify(DISPLAY_NAMES)};
  
  function updateStats(stats) {
    const container = document.getElementById('statsContainer');
    const entries = Object.entries(stats).filter(([k, v]) => v > 0);
    
    if (entries.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85em;">No clicks yet...</p>';
      document.getElementById('totalBadge').textContent = '0 clicks';
      return;
    }
    
    const total = entries.reduce((sum, [k, v]) => sum + v, 0);
    const maxCount = Math.max(...entries.map(([k, v]) => v));
    
    document.getElementById('totalBadge').textContent = total + ' clicks';
    
    // Sort by count descending
    entries.sort((a, b) => b[1] - a[1]);
    
    let html = '';
    entries.forEach(([pattern, count], idx) => {
      const pct = (count / maxCount) * 100;
      const name = displayNames[pattern] || pattern;
      const isCrown = idx === 0 && count > 0;
      html += '<div class="stat-row">';
      html += '<span class="stat-label">' + (isCrown ? '<span class="crown">👑</span> ' : '') + name + '</span>';
      html += '<div class="stat-bar-container"><div class="stat-bar" style="width:' + pct + '%"></div></div>';
      html += '<span class="stat-count">' + count + '</span>';
      html += '</div>';
    });
    
    container.innerHTML = html;
  }
  
  // Listen for messages from extension
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'stats') {
      updateStats(msg.stats);
    }
    if (msg.type === 'settings') {
      // Update UI with new settings if needed
    }
  });
</script>
</body>
</html>`;
  }
}
