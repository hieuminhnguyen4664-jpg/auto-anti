const vscode = require('vscode');

let statusBarItem;
let scanInterval;
let isActive = false;
let totalAccepts = 0;
let totalRetries = 0;
let outputChannel;

// ==================== ANTIGRAVITY INTERNAL COMMANDS ====================
// These are the internal commands exposed by Antigravity IDE.
// Using these directly bypasses all UI/DOM dependencies,
// making the extension immune to CSS/class changes from IDE updates.
const ANTIGRAVITY_COMMANDS = {
    // Agent step acceptance
    accept: [
        'antigravity.agent.acceptAgentStep',
        'antigravity.terminalCommand.accept',
        'antigravity.command.accept',
        'antigravity.agent.acceptAll',
        'antigravity.agent.acceptStep',
        'antigravity.accept',
        'antigravity.acceptAll',
        'antigravity.agent.approve',
        'antigravity.agent.proceed',
        // VS Code built-in fallbacks
        'workbench.action.acceptSelectedQuickOpenItem',
        'editor.action.inlineSuggest.commit',
    ],
    // Retry on failure
    retry: [
        'antigravity.agent.retryStep',
        'antigravity.agent.retry',
        'antigravity.retry',
        'antigravity.command.retry',
        'antigravity.terminalCommand.retry',
    ],
};

// Store discovered valid commands
let validAcceptCommands = [];
let validRetryCommands = [];

// ==================== ACTIVATION ====================
function activate(context) {
    // Create output channel for logging
    outputChannel = vscode.window.createOutputChannel('AG Auto Accept');
    context.subscriptions.push(outputChannel);

    log('⚡ Extension activated — by Nemark Digital');
    log(`🔍 Discovering Antigravity internal commands...`);

    // Create status bar button
    const config = vscode.workspace.getConfiguration('agAutoAccept');
    const position = config.get('statusBarPosition', 'right');
    const alignment = position === 'right'
        ? vscode.StatusBarAlignment.Right
        : vscode.StatusBarAlignment.Left;

    statusBarItem = vscode.window.createStatusBarItem(alignment, 100);
    statusBarItem.command = 'agAutoAccept.toggle';
    context.subscriptions.push(statusBarItem);

    // Register all commands
    context.subscriptions.push(
        vscode.commands.registerCommand('agAutoAccept.start', () => startAutoAccept()),
        vscode.commands.registerCommand('agAutoAccept.stop', () => stopAutoAccept()),
        vscode.commands.registerCommand('agAutoAccept.toggle', () => {
            if (isActive) {
                stopAutoAccept();
            } else {
                startAutoAccept();
            }
        }),
        vscode.commands.registerCommand('agAutoAccept.showWelcome', () => {
            showWelcomePanel(context);
        }),
        vscode.commands.registerCommand('agAutoAccept.showLog', () => {
            outputChannel.show();
        })
    );

    // Listen for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('agAutoAccept')) {
                if (isActive) {
                    stopAutoAccept();
                    startAutoAccept();
                }
            }
        })
    );

    // Discover valid commands on startup
    discoverCommands().then(() => {
        // Auto-start if enabled
        if (config.get('enabled', true)) {
            startAutoAccept();
        }
    });

    updateStatusBar();

    // Show welcome on first install
    const hasShownWelcome = context.globalState.get('agAutoAccept.welcomeShown', false);
    if (!hasShownWelcome) {
        context.globalState.update('agAutoAccept.welcomeShown', true);
        showWelcomePanel(context);
    }
}

// ==================== COMMAND DISCOVERY ====================
// Dynamically discovers which Antigravity commands are available.
// This makes the extension self-healing — if Google adds new commands
// or renames existing ones, we'll find them automatically.
async function discoverCommands() {
    try {
        const allCommands = await vscode.commands.getCommands(true);

        // Find all antigravity-related commands
        const antigravityCommands = allCommands.filter(cmd =>
            cmd.toLowerCase().includes('antigravity') ||
            cmd.toLowerCase().includes('agent.accept') ||
            cmd.toLowerCase().includes('agent.retry') ||
            cmd.toLowerCase().includes('agent.proceed') ||
            cmd.toLowerCase().includes('agent.approve')
        );

        if (antigravityCommands.length > 0) {
            log(`✅ Found ${antigravityCommands.length} Antigravity commands:`);
            antigravityCommands.forEach(cmd => log(`   📌 ${cmd}`));
        } else {
            log(`⚠️ No Antigravity-specific commands found. Using known command list.`);
        }

        // Build valid command lists
        // Priority: discovered Antigravity commands first, then our known list
        validAcceptCommands = [];
        validRetryCommands = [];

        // Add discovered accept-like commands
        antigravityCommands.forEach(cmd => {
            const lower = cmd.toLowerCase();
            if (lower.includes('accept') || lower.includes('approve') || lower.includes('proceed')) {
                if (!validAcceptCommands.includes(cmd)) {
                    validAcceptCommands.push(cmd);
                }
            }
            if (lower.includes('retry') || lower.includes('rerun') || lower.includes('re-run')) {
                if (!validRetryCommands.includes(cmd)) {
                    validRetryCommands.push(cmd);
                }
            }
        });

        // Add known commands that exist in the IDE
        for (const cmd of ANTIGRAVITY_COMMANDS.accept) {
            if (allCommands.includes(cmd) && !validAcceptCommands.includes(cmd)) {
                validAcceptCommands.push(cmd);
            }
        }
        for (const cmd of ANTIGRAVITY_COMMANDS.retry) {
            if (allCommands.includes(cmd) && !validRetryCommands.includes(cmd)) {
                validRetryCommands.push(cmd);
            }
        }

        // Always keep our full known list as fallback (commands may appear dynamically)
        ANTIGRAVITY_COMMANDS.accept.forEach(cmd => {
            if (!validAcceptCommands.includes(cmd)) {
                validAcceptCommands.push(cmd);
            }
        });
        ANTIGRAVITY_COMMANDS.retry.forEach(cmd => {
            if (!validRetryCommands.includes(cmd)) {
                validRetryCommands.push(cmd);
            }
        });

        log(`📋 Accept commands: ${validAcceptCommands.length}`);
        log(`📋 Retry commands: ${validRetryCommands.length}`);

    } catch (e) {
        log(`⚠️ Command discovery failed: ${e.message}`);
        // Fallback to full known lists
        validAcceptCommands = [...ANTIGRAVITY_COMMANDS.accept];
        validRetryCommands = [...ANTIGRAVITY_COMMANDS.retry];
    }
}

// ==================== START / STOP ====================
function startAutoAccept() {
    if (isActive) return;
    isActive = true;

    const config = vscode.workspace.getConfiguration('agAutoAccept');
    const interval = config.get('scanInterval', 2000);

    // Perform initial scan immediately
    performScan();

    scanInterval = setInterval(() => {
        performScan();
    }, interval);

    updateStatusBar();
    log(`▶ Started — scanning every ${interval}ms`);
    log(`  Accept commands: ${validAcceptCommands.length}`);
    log(`  Retry commands: ${validRetryCommands.length}`);
}

function stopAutoAccept() {
    if (!isActive) return;
    isActive = false;

    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }

    updateStatusBar();
    log('⏹ Stopped');
}

// ==================== SCAN ====================
async function performScan() {
    const config = vscode.workspace.getConfiguration('agAutoAccept');
    const autoRetry = config.get('autoRetry', true);

    // Execute all accept commands
    for (const cmd of validAcceptCommands) {
        try {
            await vscode.commands.executeCommand(cmd);
            // If it succeeds without error, it likely did something
            totalAccepts++;
        } catch (e) {
            // Command not available or no pending action — this is normal
        }
    }

    // Execute retry commands if enabled
    if (autoRetry) {
        for (const cmd of validRetryCommands) {
            try {
                await vscode.commands.executeCommand(cmd);
                totalRetries++;
            } catch (e) {
                // Command not available or no pending retry — this is normal
            }
        }
    }
}

// ==================== STATUS BAR ====================
function updateStatusBar() {
    if (isActive) {
        statusBarItem.text = `$(zap) Auto-Accept: ON`;
        statusBarItem.tooltip = [
            '⚡ Antigravity Auto Accept & Retry',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `✅ Accepted: ${totalAccepts}`,
            `🔄 Retried: ${totalRetries}`,
            `📋 Commands: ${validAcceptCommands.length} accept, ${validRetryCommands.length} retry`,
            '',
            '📌 Click to toggle OFF',
            '',
            '🏪 shop.nemarkdigital.com'
        ].join('\n');
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarItem.color = undefined;
    } else {
        statusBarItem.text = `$(circle-slash) Auto-Accept: OFF`;
        statusBarItem.tooltip = [
            '⚡ Antigravity Auto Accept & Retry',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '⏸ Currently paused',
            '',
            '📌 Click to toggle ON',
            '',
            '🏪 shop.nemarkdigital.com'
        ].join('\n');
        statusBarItem.backgroundColor = undefined;
        statusBarItem.color = undefined;
    }
    statusBarItem.show();
}

// ==================== LOGGING ====================
function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] ${message}`;
    if (outputChannel) {
        outputChannel.appendLine(line);
    }
    console.log(`[AG Auto Accept] ${message}`);
}

// ==================== WELCOME PANEL ====================
function showWelcomePanel(context) {
    const panel = vscode.window.createWebviewPanel(
        'agAutoAcceptWelcome',
        '⚡ Auto Accept — Welcome',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getWelcomeHtml();
}

function getWelcomeHtml() {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #0d1117;
        color: #e6edf3;
        padding: 0;
        line-height: 1.6;
    }

    .hero {
        background: linear-gradient(135deg, #0d1b2a 0%, #1b2838 50%, #0a192f 100%);
        padding: 60px 40px;
        text-align: center;
        border-bottom: 2px solid #30363d;
        position: relative;
        overflow: hidden;
    }
    .hero::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle at 30% 50%, rgba(56,189,248,0.08) 0%, transparent 50%),
                    radial-gradient(circle at 70% 50%, rgba(139,92,246,0.06) 0%, transparent 50%);
        animation: pulse 8s ease-in-out infinite;
    }
    @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 0.5; }
        50% { transform: scale(1.1); opacity: 1; }
    }

    .hero-content { position: relative; z-index: 1; }
    .hero-icon { font-size: 64px; margin-bottom: 16px; }
    .hero h1 {
        font-size: 32px;
        font-weight: 800;
        background: linear-gradient(135deg, #58a6ff, #a78bfa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 8px;
    }
    .hero .subtitle {
        color: #8b949e;
        font-size: 16px;
        margin-bottom: 20px;
    }
    .hero .version-badge {
        display: inline-block;
        background: rgba(56,189,248,0.15);
        color: #58a6ff;
        padding: 4px 14px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        border: 1px solid rgba(56,189,248,0.2);
    }
    .hero .resilient-badge {
        display: inline-block;
        background: rgba(166,227,161,0.15);
        color: #a6e3a1;
        padding: 4px 14px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        border: 1px solid rgba(166,227,161,0.2);
        margin-left: 8px;
    }

    .container { max-width: 800px; margin: 0 auto; padding: 40px; }

    .section { margin-bottom: 40px; }
    .section h2 {
        font-size: 22px;
        font-weight: 700;
        color: #e6edf3;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .tech-banner {
        background: linear-gradient(135deg, #1a2332, #0d1b2a);
        border: 1px solid #238636;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 24px;
    }
    .tech-banner h3 { color: #58a6ff; font-size: 16px; margin-bottom: 10px; }
    .tech-banner p { color: #8b949e; font-size: 13px; line-height: 1.6; }
    .tech-banner code {
        background: #0d1117;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
        color: #79c0ff;
        border: 1px solid #30363d;
    }

    .features {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
    }
    .feature-card {
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 12px;
        padding: 20px;
        transition: all 0.3s ease;
    }
    .feature-card:hover {
        border-color: #58a6ff;
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(56,189,248,0.1);
    }
    .feature-card .icon { font-size: 28px; margin-bottom: 10px; }
    .feature-card h3 { font-size: 15px; color: #e6edf3; margin-bottom: 6px; }
    .feature-card p { font-size: 13px; color: #8b949e; line-height: 1.5; }

    .guide-steps {
        counter-reset: step;
    }
    .step {
        display: flex;
        gap: 16px;
        margin-bottom: 20px;
        padding: 16px;
        background: #161b22;
        border-radius: 12px;
        border: 1px solid #30363d;
    }
    .step-num {
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        background: linear-gradient(135deg, #58a6ff, #a78bfa);
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 16px;
    }
    .step-content h3 { font-size: 15px; color: #e6edf3; margin-bottom: 4px; }
    .step-content p { font-size: 13px; color: #8b949e; }
    .step-content code {
        background: #0d1117;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
        color: #79c0ff;
        border: 1px solid #30363d;
    }

    .shop-banner {
        background: linear-gradient(135deg, #1a1a2e, #16213e);
        border: 1px solid #e2725b;
        border-radius: 16px;
        padding: 30px;
        text-align: center;
        position: relative;
        overflow: hidden;
    }
    .shop-banner::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(135deg, rgba(226,114,91,0.08), rgba(255,154,0,0.05));
    }
    .shop-banner * { position: relative; z-index: 1; }
    .shop-banner h2 {
        justify-content: center;
        color: #ff9a00;
    }
    .shop-banner p { color: #b0b0b0; margin-bottom: 12px; }
    .shop-banner .shop-link {
        display: inline-block;
        background: linear-gradient(135deg, #e2725b, #ff9a00);
        color: white;
        padding: 10px 28px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 700;
        font-size: 14px;
        transition: all 0.3s;
    }
    .shop-banner .shop-link:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 20px rgba(226,114,91,0.4);
    }
    .shop-banner .ultra-badge {
        display: inline-block;
        background: linear-gradient(135deg, #ffd700, #ffaa00);
        color: #1a1a2e;
        padding: 3px 12px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 800;
        margin-left: 6px;
        text-transform: uppercase;
    }

    .footer {
        text-align: center;
        padding: 24px;
        color: #484f58;
        font-size: 12px;
        border-top: 1px solid #21262d;
        margin-top: 20px;
    }
    .footer a { color: #58a6ff; text-decoration: none; }
</style>
</head>
<body>

<div class="hero">
    <div class="hero-content">
        <div class="hero-icon">⚡</div>
        <h1>Antigravity Auto Accept & Retry</h1>
        <p class="subtitle">Tự động Accept commands & Retry khi lỗi — by Nemark Digital</p>
        <span class="version-badge">v0.3.0</span>
        <span class="resilient-badge">🛡️ Update-Proof</span>
    </div>
</div>

<div class="container">

    <div class="section">
        <div class="tech-banner">
            <h3>🛡️ Công nghệ chống lỗi khi IDE update</h3>
            <p>
                Extension này sử dụng <strong>Internal Antigravity Commands</strong> trực tiếp thay vì
                dựa vào CSS class hay DOM selectors. Khi Google update IDE, giao diện có thể thay đổi
                nhưng các internal commands (<code>antigravity.agent.acceptAgentStep</code>, v.v.) luôn ổn định.
                <br><br>
                Ngoài ra, extension có <strong>Command Discovery</strong> — tự động tìm và sử dụng
                tất cả commands mới mà Antigravity thêm vào trong tương lai.
            </p>
        </div>
    </div>

    <div class="section">
        <h2>✨ Tính năng</h2>
        <div class="features">
            <div class="feature-card">
                <div class="icon">✅</div>
                <h3>Auto Accept</h3>
                <p>Tự động nhấn Accept khi Antigravity yêu cầu phê duyệt command</p>
            </div>
            <div class="feature-card">
                <div class="icon">🔄</div>
                <h3>Auto Retry</h3>
                <p>Tự động Retry khi command thất bại, không cần thao tác thủ công</p>
            </div>
            <div class="feature-card">
                <div class="icon">🛡️</div>
                <h3>Update-Proof</h3>
                <p>Sử dụng internal API — không bao giờ hỏng khi IDE update UI</p>
            </div>
            <div class="feature-card">
                <div class="icon">🔍</div>
                <h3>Auto-Discovery</h3>
                <p>Tự phát hiện commands mới — luôn tương thích phiên bản mới nhất</p>
            </div>
            <div class="feature-card">
                <div class="icon">⚡</div>
                <h3>Quick Toggle</h3>
                <p>Bật/tắt nhanh bằng nút ở status bar góc phải — 1 click là xong</p>
            </div>
            <div class="feature-card">
                <div class="icon">📊</div>
                <h3>Output Log</h3>
                <p>Xem log chi tiết trong Output panel — dễ debug khi có vấn đề</p>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>📖 Hướng dẫn sử dụng</h2>
        <div class="guide-steps">
            <div class="step">
                <div class="step-num">1</div>
                <div class="step-content">
                    <h3>Cài đặt xong — tự động chạy</h3>
                    <p>Extension sẽ tự kích hoạt khi mở IDE. Bạn sẽ thấy <code>⚡ Auto-Accept: ON</code> ở góc phải dưới màn hình.</p>
                </div>
            </div>
            <div class="step">
                <div class="step-num">2</div>
                <div class="step-content">
                    <h3>Bật/Tắt nhanh</h3>
                    <p>Click vào nút <code>⚡ Auto-Accept: ON</code> trên status bar để toggle. Hoặc mở Command Palette <code>Ctrl+Shift+P</code> → gõ <code>Auto Accept: Toggle</code></p>
                </div>
            </div>
            <div class="step">
                <div class="step-num">3</div>
                <div class="step-content">
                    <h3>Xem Log</h3>
                    <p>Mở Command Palette → <code>Auto Accept: Show Log</code> để xem danh sách commands đã phát hiện và trạng thái hoạt động.</p>
                </div>
            </div>
            <div class="step">
                <div class="step-num">4</div>
                <div class="step-content">
                    <h3>Tùy chỉnh Settings</h3>
                    <p>Mở <code>Ctrl+,</code> → tìm <code>Auto Accept</code> để thay đổi tốc độ scan, bật/tắt auto-retry, và vị trí nút status bar.</p>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="shop-banner">
            <h2>🏪 Nemark Digital Shop</h2>
            <p>Mua Account Ultra để sử dụng Antigravity không giới hạn!</p>
            <p style="font-size:14px; color:#ccc;">
                💎 <strong>Shop Account Ultra</strong> <span class="ultra-badge">Premium</span>
            </p>
            <p style="font-size:13px; color:#999; margin-bottom:16px;">
                Cung cấp tài khoản Antigravity chất lượng cao, hỗ trợ 24/7
            </p>
            <a class="shop-link" href="https://shop.nemarkdigital.com" target="_blank">
                🛒 Truy cập shop.nemarkdigital.com
            </a>
        </div>
    </div>

</div>

<div class="footer">
    Made with ❤️ by <a href="https://shop.nemarkdigital.com">Nemark Digital</a> •
    <a href="https://github.com/ducvps12/auto-accept">GitHub</a>
</div>

</body>
</html>`;
}

// ==================== DEACTIVATION ====================
function deactivate() {
    stopAutoAccept();
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (outputChannel) {
        outputChannel.dispose();
    }
    console.log('[AG Auto Accept] Extension deactivated');
}

module.exports = { activate, deactivate };
