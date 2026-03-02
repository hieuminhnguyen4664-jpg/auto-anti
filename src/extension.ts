import * as vscode from 'vscode';
import { StatusBar } from './statusBar';
import { SettingsPanel } from './settingsPanel';
import { HttpServer } from './httpServer';
import { Injector } from './injector';
import { ChecksumFixer } from './checksumFixer';
import { NativeDialogClicker } from './nativeDialog';

// ============================================================
// AG Auto Click & Scroll v8.0
// Entry point — Wires all modules together
// ============================================================

const EXTENSION_VERSION = '8.0.0';

let statusBar: StatusBar;
let settingsPanel: SettingsPanel;
let httpServer: HttpServer;
let injector: Injector;
let nativeDialog: NativeDialogClicker;
let commandsScanInterval: NodeJS.Timeout | null = null;

// Antigravity internal commands for Commands API
const ACCEPT_COMMANDS = [
    'antigravity.agent.acceptAgentStep',
    'antigravity.terminalCommand.accept',
    'antigravity.command.accept',
    'antigravity.agent.acceptAll',
    'antigravity.agent.acceptStep',
    'antigravity.accept',
    'antigravity.acceptAll',
    'antigravity.agent.approve',
    'antigravity.agent.proceed',
];

const RETRY_COMMANDS = [
    'antigravity.agent.retryStep',
    'antigravity.agent.retry',
    'antigravity.retry',
    'antigravity.command.retry',
    'antigravity.terminalCommand.retry',
];

let validAcceptCommands: string[] = [];
let validRetryCommands: string[] = [];

/**
 * Discover available Antigravity commands
 */
async function discoverCommands(): Promise<void> {
    try {
        const allCommands = await vscode.commands.getCommands(true);
        const agCommands = allCommands.filter(cmd =>
            cmd.toLowerCase().includes('antigravity') ||
            cmd.toLowerCase().includes('agent.accept') ||
            cmd.toLowerCase().includes('agent.retry') ||
            cmd.toLowerCase().includes('agent.proceed') ||
            cmd.toLowerCase().includes('agent.approve')
        );

        validAcceptCommands = [];
        validRetryCommands = [];

        // Add discovered commands
        agCommands.forEach(cmd => {
            const lower = cmd.toLowerCase();
            if (lower.includes('accept') || lower.includes('approve') || lower.includes('proceed')) {
                // SKIP agentAcceptAllInFile — that's diff editor, not chat
                if (lower.includes('acceptallinfile') || lower.includes('acceptall') && lower.includes('file')) {
                    return;
                }
                if (!validAcceptCommands.includes(cmd)) {
                    validAcceptCommands.push(cmd);
                }
            }
            if (lower.includes('retry') || lower.includes('rerun')) {
                if (!validRetryCommands.includes(cmd)) {
                    validRetryCommands.push(cmd);
                }
            }
        });

        // Add known commands as fallback
        for (const cmd of ACCEPT_COMMANDS) {
            if (!validAcceptCommands.includes(cmd)) {
                validAcceptCommands.push(cmd);
            }
        }
        for (const cmd of RETRY_COMMANDS) {
            if (!validRetryCommands.includes(cmd)) {
                validRetryCommands.push(cmd);
            }
        }

        console.log(`[AG Auto] Discovered ${validAcceptCommands.length} accept, ${validRetryCommands.length} retry commands`);
    } catch (e: any) {
        console.error('[AG Auto] Command discovery failed:', e.message);
        validAcceptCommands = [...ACCEPT_COMMANDS];
        validRetryCommands = [...RETRY_COMMANDS];
    }
}

/**
 * Execute accept/retry commands via Commands API
 */
async function performCommandsScan(): Promise<void> {
    const config = vscode.workspace.getConfiguration('autoAccept');
    const acceptEnabled = config.get<boolean>('acceptEnabled', true);
    const commandsApiEnabled = config.get<boolean>('commandsApiEnabled', true);

    if (!acceptEnabled || !commandsApiEnabled) return;

    // Execute accept commands
    for (const cmd of validAcceptCommands) {
        try {
            await vscode.commands.executeCommand(cmd);
        } catch {
            // Command not available or no pending action — normal
        }
    }

    // Execute retry commands
    for (const cmd of validRetryCommands) {
        try {
            await vscode.commands.executeCommand(cmd);
        } catch {
            // Normal
        }
    }
}

/**
 * Start the Commands API scan loop
 */
function startCommandsLoop(): void {
    if (commandsScanInterval) return;
    const config = vscode.workspace.getConfiguration('autoAccept');
    const interval = config.get<number>('clickInterval', 1000);
    commandsScanInterval = setInterval(performCommandsScan, interval);
    console.log(`[AG Auto] Commands API loop started (${interval}ms)`);
}

function stopCommandsLoop(): void {
    if (commandsScanInterval) {
        clearInterval(commandsScanInterval);
        commandsScanInterval = null;
    }
}

/**
 * Activation — called when extension starts (onStartupFinished)
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('[AG Auto Click & Scroll] Activating v8.0...');

    const config = vscode.workspace.getConfiguration('autoAccept');

    // ==========================
    // 1. Status Bar
    // ==========================
    statusBar = new StatusBar();
    statusBar.registerCommands(context);
    statusBar.setAcceptEnabled(config.get<boolean>('acceptEnabled', true));
    statusBar.setScrollEnabled(config.get<boolean>('scrollEnabled', true));

    // ==========================
    // 2. HTTP Server (IPC with injected script)
    // ==========================
    httpServer = new HttpServer();
    let httpPort = 0;
    try {
        httpPort = await httpServer.start();
        console.log(`[AG Auto] HTTP server on port ${httpPort}`);
    } catch (err: any) {
        console.error('[AG Auto] HTTP server failed:', err.message);
    }

    // Push current settings to HTTP server
    function syncSettingsToHttp(): void {
        const cfg = vscode.workspace.getConfiguration('autoAccept');
        httpServer.updateSettings({
            acceptEnabled: cfg.get('acceptEnabled', true),
            scrollEnabled: cfg.get('scrollEnabled', true),
            clickInterval: cfg.get('clickInterval', 1000),
            scrollInterval: cfg.get('scrollInterval', 500),
            patterns: cfg.get('patterns', {}),
        });
    }
    syncSettingsToHttp();

    // ==========================
    // 3. Settings Panel
    // ==========================
    settingsPanel = new SettingsPanel(context);

    settingsPanel.onSettings((settings) => {
        // Save to VS Code config
        const cfg = vscode.workspace.getConfiguration('autoAccept');
        cfg.update('acceptEnabled', settings.acceptEnabled, vscode.ConfigurationTarget.Global);
        cfg.update('scrollEnabled', settings.scrollEnabled, vscode.ConfigurationTarget.Global);
        cfg.update('clickInterval', settings.clickInterval, vscode.ConfigurationTarget.Global);
        cfg.update('scrollInterval', settings.scrollInterval, vscode.ConfigurationTarget.Global);
        cfg.update('nativeDialogEnabled', settings.nativeDialogEnabled, vscode.ConfigurationTarget.Global);
        if (settings.commandsApiEnabled !== undefined) {
            cfg.update('commandsApiEnabled', settings.commandsApiEnabled, vscode.ConfigurationTarget.Global);
        }
        if (settings.patterns) {
            cfg.update('patterns', settings.patterns, vscode.ConfigurationTarget.Global);
        }

        // Sync to status bar
        statusBar.setAcceptEnabled(settings.acceptEnabled);
        statusBar.setScrollEnabled(settings.scrollEnabled);

        // Sync to HTTP server
        syncSettingsToHttp();

        // Sync native dialog
        if (nativeDialog) {
            nativeDialog.setEnabled(settings.nativeDialogEnabled ?? true);
        }

        // Restart commands loop if interval changed
        stopCommandsLoop();
        if (settings.acceptEnabled) {
            startCommandsLoop();
        }
    });

    settingsPanel.onReset(() => {
        // Reset stats in HTTP server too
        httpServer.resetStats();
    });

    // Stats pipeline: HTTP server → SettingsPanel + StatusBar
    httpServer.onStats((stats) => {
        settingsPanel.updateStats(stats);
        const total = Object.values(stats).reduce((sum, v) => sum + v, 0);
        statusBar.setClickCount(total);
    });

    // Load persisted stats
    const savedStats = context.globalState.get<Record<string, number>>('clickStats', {});
    if (Object.keys(savedStats).length > 0) {
        settingsPanel.updateStats(savedStats);
        const total = Object.values(savedStats).reduce((sum, v) => sum + v, 0);
        statusBar.setClickCount(total);
    }

    // Persist stats periodically
    const statsPersistInterval = setInterval(() => {
        const stats = httpServer.getStats();
        if (Object.keys(stats).length > 0) {
            context.globalState.update('clickStats', stats);
        }
    }, 10000);

    // ==========================
    // 4. Toggle Callbacks
    // ==========================

    statusBar.onAcceptToggle((enabled) => {
        vscode.workspace.getConfiguration('autoAccept')
            .update('acceptEnabled', enabled, vscode.ConfigurationTarget.Global);
        syncSettingsToHttp();

        if (enabled) {
            startCommandsLoop();
        } else {
            stopCommandsLoop();
        }
    });

    statusBar.onScrollToggle((enabled) => {
        vscode.workspace.getConfiguration('autoAccept')
            .update('scrollEnabled', enabled, vscode.ConfigurationTarget.Global);
        syncSettingsToHttp();
    });

    statusBar.onSettingsOpen(() => {
        settingsPanel.toggle();
    });

    // Toggle All callback (from unified status bar)
    statusBar.onScrollToggle((enabled) => {
        vscode.workspace.getConfiguration('autoAccept')
            .update('scrollEnabled', enabled, vscode.ConfigurationTarget.Global);
        syncSettingsToHttp();
    });

    // ==========================
    // 5. Register Commands
    // ==========================

    context.subscriptions.push(
        vscode.commands.registerCommand('autoAccept.openSettings', () => {
            settingsPanel.toggle();
        }),

        vscode.commands.registerCommand('autoAccept.enable', async () => {
            await performInjection(context, httpPort);
        }),

        vscode.commands.registerCommand('autoAccept.disable', async () => {
            injector = injector || new Injector(context.extensionPath);
            injector.findWorkbenchHtml();
            const removed = await injector.removeInjectionFromFile();
            if (removed) {
                await ChecksumFixer.fixChecksums();
                vscode.window.showInformationMessage('AG Auto: Disabled — Reload to apply', 'Reload').then(sel => {
                    if (sel === 'Reload') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                });
            }
        })
    );

    // ==========================
    // 6. Injector — Auto-inject on activation
    // ==========================
    injector = new Injector(context.extensionPath);
    const wbPath = injector.findWorkbenchHtml();

    if (wbPath) {
        // Check if extension was upgraded → re-inject with new script
        const storedVersion = context.globalState.get<string>('agAuto.extensionVersion', '');
        const versionChanged = storedVersion !== EXTENSION_VERSION;

        if (injector.needsReinjection() || versionChanged) {
            const reason = versionChanged
                ? `Extension upgraded (${storedVersion || 'none'} → ${EXTENSION_VERSION})`
                : 'Injection missing';
            console.log(`[AG Auto] ${reason} — auto-injecting...`);
            await performInjection(context, httpPort);
            context.globalState.update('agAuto.extensionVersion', EXTENSION_VERSION);
        } else {
            console.log('[AG Auto] Script already injected ✅');
        }
    } else {
        console.log('[AG Auto] workbench.html not found — skipping injection');
    }

    // ==========================
    // 7. Native Dialog Clicker (Windows)
    // ==========================
    nativeDialog = new NativeDialogClicker();
    if (config.get<boolean>('nativeDialogEnabled', true)) {
        nativeDialog.start();
    }
    nativeDialog.onCountChange((count) => {
        // Merge native dialog clicks into stats
        const stats = httpServer.getStats();
        stats['Keep Waiting (Native)'] = count;
        settingsPanel.updateStats(stats);
        const total = Object.values(stats).reduce((sum, v) => sum + v, 0);
        statusBar.setClickCount(total);
    });

    // ==========================
    // 8. Commands API Discovery + Loop
    // ==========================
    await discoverCommands();
    if (config.get<boolean>('acceptEnabled', true)) {
        startCommandsLoop();
    }

    // ==========================
    // 9. Config Change Listener
    // ==========================
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('autoAccept')) {
                const cfg = vscode.workspace.getConfiguration('autoAccept');
                statusBar.setAcceptEnabled(cfg.get<boolean>('acceptEnabled', true));
                statusBar.setScrollEnabled(cfg.get<boolean>('scrollEnabled', true));
                syncSettingsToHttp();

                if (nativeDialog) {
                    nativeDialog.setEnabled(cfg.get<boolean>('nativeDialogEnabled', true));
                }

                // Restart commands loop with new interval
                stopCommandsLoop();
                if (cfg.get<boolean>('acceptEnabled', true)) {
                    startCommandsLoop();
                }
            }
        })
    );

    // ==========================
    // 10. Cleanup
    // ==========================
    context.subscriptions.push({
        dispose: () => {
            statusBar.dispose();
            settingsPanel.dispose();
            httpServer.stop();
            nativeDialog.stop();
            stopCommandsLoop();
            clearInterval(statsPersistInterval);
        },
    });

    console.log('[AG Auto Click & Scroll] Activated v8.0 ✅');
}

/**
 * Perform injection + checksum fix + reload
 */
async function performInjection(context: vscode.ExtensionContext, httpPort: number): Promise<void> {
    injector = injector || new Injector(context.extensionPath);
    injector.findWorkbenchHtml();

    const success = await injector.inject(httpPort);
    if (success) {
        console.log('[AG Auto] Injection successful');
        const checksumOk = await ChecksumFixer.fixChecksums();
        if (checksumOk) {
            console.log('[AG Auto] Checksums fixed');
        }
        await ChecksumFixer.dismissCorruptNotification();

        // Mark first inject done
        const firstInject = !context.globalState.get('agAuto.injected', false);
        context.globalState.update('agAuto.injected', true);

        if (firstInject) {
            vscode.window.showInformationMessage(
                'AG Auto Click & Scroll: Injected! Reloading...',
            );
            setTimeout(() => {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }, 1500);
        }
    } else {
        vscode.window.showErrorMessage('AG Auto: Injection failed. Try running as admin.');
    }
}

/**
 * Deactivation
 */
export function deactivate() {
    console.log('[AG Auto Click & Scroll] Deactivating...');
    statusBar?.dispose();
    settingsPanel?.dispose();
    httpServer?.stop();
    nativeDialog?.stop();
    stopCommandsLoop();
}
