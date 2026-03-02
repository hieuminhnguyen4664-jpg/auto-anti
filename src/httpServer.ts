import * as http from 'http';
import * as vscode from 'vscode';

export class HttpServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private settings: any = {};
    private clickStats: Record<string, number> = {};
    private onStatsUpdate: ((stats: Record<string, number>) => void) | null = null;

    /**
     * Start the HTTP IPC server on a random available port
     */
    async start(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                // CORS headers for renderer process
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                if (req.method === 'GET' && req.url === '/settings') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(this.settings));
                    return;
                }

                if (req.method === 'POST' && req.url === '/stats') {
                    let body = '';
                    req.on('data', (chunk: Buffer) => {
                        body += chunk.toString();
                    });
                    req.on('end', () => {
                        try {
                            const stats = JSON.parse(body);
                            // Merge stats
                            for (const [key, value] of Object.entries(stats)) {
                                this.clickStats[key] = value as number;
                            }
                            if (this.onStatsUpdate) {
                                this.onStatsUpdate(this.clickStats);
                            }
                        } catch { }
                        res.writeHead(200);
                        res.end('OK');
                    });
                    return;
                }

                if (req.method === 'GET' && req.url === '/stats') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(this.clickStats));
                    return;
                }

                if (req.method === 'POST' && req.url === '/reset-stats') {
                    this.clickStats = {};
                    if (this.onStatsUpdate) {
                        this.onStatsUpdate(this.clickStats);
                    }
                    res.writeHead(200);
                    res.end('OK');
                    return;
                }

                res.writeHead(404);
                res.end('Not Found');
            });

            this.server.listen(0, '127.0.0.1', () => {
                const addr = this.server!.address();
                if (addr && typeof addr === 'object') {
                    this.port = addr.port;
                    console.log(`[Auto Accept] HTTP server started on port ${this.port}`);
                    resolve(this.port);
                } else {
                    reject(new Error('Failed to get server address'));
                }
            });

            this.server.on('error', (err) => {
                console.error('[Auto Accept] HTTP server error:', err);
                reject(err);
            });
        });
    }

    /**
     * Update settings that the autoScript will poll
     */
    updateSettings(settings: any): void {
        this.settings = settings;
    }

    /**
     * Get current click stats
     */
    getStats(): Record<string, number> {
        return { ...this.clickStats };
    }

    /**
     * Reset click stats
     */
    resetStats(): void {
        this.clickStats = {};
    }

    /**
     * Register a callback for stats updates
     */
    onStats(callback: (stats: Record<string, number>) => void): void {
        this.onStatsUpdate = callback;
    }

    /**
     * Get the server port
     */
    getPort(): number {
        return this.port;
    }

    /**
     * Stop the server
     */
    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}
