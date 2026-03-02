import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const INJECT_MARKER_START = '<!-- AUTO-ACCEPT-INJECT-START -->';
const INJECT_MARKER_END = '<!-- AUTO-ACCEPT-INJECT-END -->';

export class Injector {
    private extensionPath: string;
    private workbenchPath: string = '';
    private backupPath: string = '';

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
    }

    /**
     * Find the workbench HTML file for Antigravity/VS Code
     */
    findWorkbenchHtml(): string | null {
        // VS Code / Antigravity installation paths
        const appRoot = vscode.env.appRoot;
        const possiblePaths = [
            path.join(appRoot, 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'),
            path.join(appRoot, 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'),
            path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.html'),
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                this.workbenchPath = p;
                this.backupPath = p + '.backup';
                return p;
            }
        }

        return null;
    }

    /**
     * Check if script is already injected
     */
    isInjected(): boolean {
        if (!this.workbenchPath) return false;
        try {
            const content = fs.readFileSync(this.workbenchPath, 'utf-8');
            return content.includes(INJECT_MARKER_START);
        } catch {
            return false;
        }
    }

    /**
     * Inject the auto-click script into workbench HTML
     */
    async inject(httpPort: number): Promise<boolean> {
        const wbPath = this.workbenchPath || this.findWorkbenchHtml();
        if (!wbPath) {
            vscode.window.showErrorMessage('Auto Accept: Cannot find workbench.html. Please check Antigravity installation.');
            return false;
        }

        try {
            let content = fs.readFileSync(wbPath, 'utf-8');

            // Remove old injection if present
            content = this.removeInjection(content);

            // Read the auto-click script
            const scriptPath = path.join(this.extensionPath, 'src', 'autoScript.js');
            let scriptContent: string;

            if (fs.existsSync(scriptPath)) {
                scriptContent = fs.readFileSync(scriptPath, 'utf-8');
            } else {
                // Try from out directory
                const outScriptPath = path.join(this.extensionPath, 'out', 'autoScript.js');
                if (fs.existsSync(outScriptPath)) {
                    scriptContent = fs.readFileSync(outScriptPath, 'utf-8');
                } else {
                    vscode.window.showErrorMessage('Auto Accept: Cannot find autoScript.js');
                    return false;
                }
            }

            // Create the injection HTML
            const injection = `
${INJECT_MARKER_START}
<meta name="auto-accept-port" content="${httpPort}">
<script>
${scriptContent}
</script>
${INJECT_MARKER_END}`;

            // Backup original
            if (!fs.existsSync(this.backupPath)) {
                fs.copyFileSync(wbPath, this.backupPath);
            }

            // Inject before </html>
            content = content.replace('</html>', `${injection}\n</html>`);

            // Write
            fs.writeFileSync(wbPath, content, 'utf-8');

            return true;
        } catch (err: any) {
            // Permission error on Windows - try with elevated permissions
            if (err.code === 'EPERM' || err.code === 'EACCES') {
                return await this.injectWithElevation(httpPort);
            }
            vscode.window.showErrorMessage(`Auto Accept: Injection failed: ${err.message}`);
            return false;
        }
    }

    /**
     * Try injection with elevated permissions (Windows)
     */
    private async injectWithElevation(httpPort: number): Promise<boolean> {
        try {
            const { exec } = require('child_process');
            const wbPath = this.workbenchPath;

            // Read current content and prepare new content
            let content = fs.readFileSync(wbPath, 'utf-8');
            content = this.removeInjection(content);

            const scriptPath = path.join(this.extensionPath, 'src', 'autoScript.js');
            const scriptContent = fs.existsSync(scriptPath)
                ? fs.readFileSync(scriptPath, 'utf-8')
                : fs.readFileSync(path.join(this.extensionPath, 'out', 'autoScript.js'), 'utf-8');

            const injection = `\n${INJECT_MARKER_START}\n<meta name="auto-accept-port" content="${httpPort}">\n<script>\n${scriptContent}\n</script>\n${INJECT_MARKER_END}`;
            const newContent = content.replace('</html>', `${injection}\n</html>`);

            // Write to temp file first
            const tmpFile = path.join(require('os').tmpdir(), 'workbench_patched.html');
            fs.writeFileSync(tmpFile, newContent, 'utf-8');

            // Use PowerShell to copy with elevated permissions
            return new Promise((resolve) => {
                const cmd = `powershell -Command "Start-Process powershell -ArgumentList '-Command', 'Copy-Item -Path \\\"${tmpFile.replace(/\\/g, '\\\\')}\\\" -Destination \\\"${wbPath.replace(/\\/g, '\\\\')}\\\" -Force' -Verb RunAs -Wait"`;
                exec(cmd, (error: any) => {
                    if (error) {
                        vscode.window.showErrorMessage(`Auto Accept: Elevation failed: ${error.message}`);
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                });
            });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Auto Accept: Elevated injection failed: ${err.message}`);
            return false;
        }
    }

    /**
     * Remove injected script from content
     */
    removeInjection(content: string): string {
        const startIdx = content.indexOf(INJECT_MARKER_START);
        const endIdx = content.indexOf(INJECT_MARKER_END);
        if (startIdx !== -1 && endIdx !== -1) {
            content = content.substring(0, startIdx) + content.substring(endIdx + INJECT_MARKER_END.length);
        }
        return content;
    }

    /**
     * Remove injection and restore original
     */
    async removeInjectionFromFile(): Promise<boolean> {
        const wbPath = this.workbenchPath || this.findWorkbenchHtml();
        if (!wbPath) return false;

        try {
            if (this.backupPath && fs.existsSync(this.backupPath)) {
                fs.copyFileSync(this.backupPath, wbPath);
                return true;
            }

            let content = fs.readFileSync(wbPath, 'utf-8');
            content = this.removeInjection(content);
            fs.writeFileSync(wbPath, content, 'utf-8');
            return true;
        } catch (err: any) {
            vscode.window.showErrorMessage(`Auto Accept: Remove injection failed: ${err.message}`);
            return false;
        }
    }

    /**
     * Check if Antigravity was updated (workbench.html changed, injection missing)
     */
    needsReinjection(): boolean {
        if (!this.workbenchPath) this.findWorkbenchHtml();
        if (!this.workbenchPath) return false;

        try {
            const content = fs.readFileSync(this.workbenchPath, 'utf-8');
            return !content.includes(INJECT_MARKER_START);
        } catch {
            return false;
        }
    }

    getWorkbenchPath(): string {
        return this.workbenchPath;
    }
}
