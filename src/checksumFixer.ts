import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from 'vscode';

export class ChecksumFixer {
    /**
     * Fix the "corrupt installation" warning by updating checksums in product.json
     */
    static async fixChecksums(): Promise<boolean> {
        try {
            const appRoot = vscode.env.appRoot;

            // Find product.json
            const productJsonPath = path.join(appRoot, 'product.json');
            if (!fs.existsSync(productJsonPath)) {
                return false;
            }

            const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf-8'));

            if (!productJson.checksums) {
                // No checksums to fix
                return true;
            }

            // Find all files that have checksums and recalculate them
            let changed = false;
            for (const [relativePath, _oldChecksum] of Object.entries(productJson.checksums)) {
                const filePath = path.join(appRoot, relativePath);
                if (fs.existsSync(filePath)) {
                    const fileContent = fs.readFileSync(filePath);
                    const newChecksum = crypto.createHash('md5').update(fileContent).digest('base64').replace(/=+$/, '');

                    if (productJson.checksums[relativePath] !== newChecksum) {
                        productJson.checksums[relativePath] = newChecksum;
                        changed = true;
                    }
                }
            }

            if (changed) {
                // Write updated product.json
                try {
                    fs.writeFileSync(productJsonPath, JSON.stringify(productJson, null, '\t'), 'utf-8');
                } catch (err: any) {
                    if (err.code === 'EPERM' || err.code === 'EACCES') {
                        // Try with elevation on Windows
                        return await ChecksumFixer.fixWithElevation(productJsonPath, productJson);
                    }
                    return false;
                }
            }

            return true;
        } catch (err) {
            console.error('[Auto Accept] Checksum fix error:', err);
            return false;
        }
    }

    /**
     * Fix checksums with elevated permissions on Windows
     */
    private static async fixWithElevation(productJsonPath: string, productJson: any): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                const { exec } = require('child_process');
                const os = require('os');
                const tmpFile = path.join(os.tmpdir(), 'product_patched.json');
                fs.writeFileSync(tmpFile, JSON.stringify(productJson, null, '\t'), 'utf-8');

                const cmd = `powershell -Command "Start-Process powershell -ArgumentList '-Command', 'Copy-Item -Path \\\"${tmpFile.replace(/\\/g, '\\\\')}\\\" -Destination \\\"${productJsonPath.replace(/\\/g, '\\\\')}\\\" -Force' -Verb RunAs -Wait"`;
                exec(cmd, (error: any) => {
                    resolve(!error);
                });
            } catch {
                resolve(false);
            }
        });
    }

    /**
     * Dismiss corrupt installation notifications
     */
    static async dismissCorruptNotification(): Promise<void> {
        // Auto-dismiss any "corrupt installation" notification after a delay
        setTimeout(async () => {
            try {
                await vscode.commands.executeCommand('notifications.clearAll');
            } catch {
                // Command may not exist, ignore
            }
        }, 3000);
    }
}
