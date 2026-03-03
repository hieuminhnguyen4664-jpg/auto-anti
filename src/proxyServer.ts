/**
 * AG Auto Click & Scroll — API Proxy Server
 * Local HTTP proxy that routes AI requests through multiple protocols and accounts.
 */

import * as http from 'http';
import * as crypto from 'crypto';
import { ProxyConfig, ProxyStatus, DEFAULT_PROXY_CONFIG } from './proxyTypes';
import { ProxyAuth } from './proxyAuth';
import { AccountManager } from './accountManager';
import { ProxyRouter } from './proxyRouter';
import { forwardRequest, detectProtocol, extractModelFromBody, extractModelFromGeminiPath } from './protocolHandlers';

export class ProxyServer {
    private server: http.Server | null = null;
    private config: ProxyConfig;
    private auth: ProxyAuth;
    private accounts: AccountManager;
    private router: ProxyRouter;
    private startTime: number = 0;
    private totalRequests: number = 0;
    private activeConnections: number = 0;
    private onStatusChange: ((status: ProxyStatus) => void) | null = null;

    constructor() {
        this.config = { ...DEFAULT_PROXY_CONFIG };
        this.auth = new ProxyAuth();
        this.accounts = new AccountManager();
        this.router = new ProxyRouter();
    }

    /**
     * Update proxy configuration
     */
    configure(config: Partial<ProxyConfig>): void {
        this.config = { ...this.config, ...config };

        // Update sub-modules
        this.auth.configure(this.config.authEnabled, this.config.authMode, this.config.apiKey);
        this.accounts.configure(
            this.config.accounts,
            this.config.orchestrationMode,
            this.config.maxWaitSeconds,
            this.config.fixedAccountId,
            this.config.circuitBreaker
        );
        this.router.configure(this.config.modelRoutes, this.config.backgroundModel);
    }

    /**
     * Get current configuration
     */
    getConfig(): ProxyConfig {
        return { ...this.config };
    }

    /**
     * Start the proxy server
     */
    async start(): Promise<number> {
        if (this.server) {
            throw new Error('Proxy server is already running');
        }

        // Generate API key if empty
        if (!this.config.apiKey) {
            this.config.apiKey = ProxyAuth.generateApiKey();
            this.auth.configure(this.config.authEnabled, this.config.authMode, this.config.apiKey);
        }

        return new Promise<number>((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            const bindAddress = this.config.allowLan ? '0.0.0.0' : '127.0.0.1';

            this.server.listen(this.config.port, bindAddress, () => {
                this.startTime = Date.now();
                console.log(`[API Proxy] Started on ${bindAddress}:${this.config.port}`);
                this.emitStatus();
                resolve(this.config.port);
            });

            this.server.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    reject(new Error(`Port ${this.config.port} is already in use`));
                } else {
                    reject(err);
                }
            });
        });
    }

    /**
     * Stop the proxy server
     */
    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.startTime = 0;
            console.log('[API Proxy] Stopped');
            this.emitStatus();
        }
    }

    /**
     * Check if server is running
     */
    isRunning(): boolean {
        return this.server !== null;
    }

    /**
     * Get current status
     */
    getStatus(): ProxyStatus {
        const accountStatus = this.accounts.getStatus();
        return {
            running: this.isRunning(),
            port: this.config.port,
            uptime: this.startTime > 0 ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
            totalRequests: this.totalRequests,
            activeConnections: this.activeConnections,
            accountsActive: accountStatus.active,
            accountsLimited: accountStatus.limited,
        };
    }

    /**
     * Register status change callback
     */
    onStatus(callback: (status: ProxyStatus) => void): void {
        this.onStatusChange = callback;
    }

    /**
     * Get the account manager (for external config)
     */
    getAccountManager(): AccountManager {
        return this.accounts;
    }

    /**
     * Get the auth module (for API key access)
     */
    getAuth(): ProxyAuth {
        return this.auth;
    }

    /**
     * Handle incoming HTTP request
     */
    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        this.activeConnections++;
        this.totalRequests++;

        try {
            // CORS preflight
            if (req.method === 'OPTIONS') {
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Max-Age': '86400',
                });
                res.end();
                return;
            }

            // Health check endpoint
            const url = req.url || '';
            if (url === '/healthz' || url === '/health') {
                const status = this.getStatus();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', ...status }));
                return;
            }

            // Authentication
            const authResult = this.auth.authenticate(req);
            if (!authResult.allowed) {
                this.auth.sendUnauthorized(res, authResult.reason || 'Unauthorized');
                return;
            }

            // Models list endpoint (OpenAI compatible)
            if (url === '/v1/models' && req.method === 'GET') {
                this.handleModelsList(res);
                return;
            }

            // Detect protocol from URL path
            const protocol = detectProtocol(url);
            if (!protocol) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: { message: 'Unknown endpoint: ' + url, type: 'invalid_request', code: 'not_found' }
                }));
                return;
            }

            // Read body to extract model
            const bodyChunks: Buffer[] = [];
            await new Promise<void>((resolve) => {
                req.on('data', (chunk: Buffer) => bodyChunks.push(chunk));
                req.on('end', resolve);
            });
            const body = Buffer.concat(bodyChunks).toString();

            // Extract model name
            let requestedModel = '';
            if (protocol === 'gemini') {
                requestedModel = extractModelFromGeminiPath(url);
            } else {
                requestedModel = extractModelFromBody(body, protocol);
            }

            if (!requestedModel) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: { message: 'Missing model in request', type: 'invalid_request', code: 'missing_model' }
                }));
                return;
            }

            // Route model
            const resolved = this.router.resolve(requestedModel);

            // Select account
            const sessionId = this.extractSessionId(req);
            const account = this.accounts.selectAccount(sessionId, resolved.provider);

            if (!account) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: {
                        message: `No available account for provider: ${resolved.provider}. All accounts may be rate-limited or disabled.`,
                        type: 'proxy_error',
                        code: 'no_account_available'
                    }
                }));
                return;
            }

            // Create a synthetic IncomingMessage with the already-read body
            const proxyReq = this.createBodyRequest(req, body);

            // Forward request
            const result = await forwardRequest(
                proxyReq,
                res,
                account,
                resolved.model,
                protocol,
                this.config.requestTimeout,
                this.config.userAgentOverride || undefined
            );

            // Report result to account manager
            if (result.isRateLimit) {
                this.accounts.reportRateLimit(account.id, result.retryAfterMs);
            } else if (result.isQuotaExhaustion) {
                this.accounts.reportError(account.id, true);
            } else if (result.statusCode >= 200 && result.statusCode < 400) {
                this.accounts.reportSuccess(account.id);
            } else if (result.statusCode >= 500) {
                this.accounts.reportError(account.id, false);
            }
        } catch (error: any) {
            console.error('[API Proxy] Request error:', error?.message);
            if (!res.writableEnded) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: { message: 'Internal proxy error', type: 'proxy_error', code: 'internal_error' }
                }));
            }
        } finally {
            this.activeConnections--;
            this.emitStatus();
        }
    }

    /**
     * Handle /v1/models endpoint
     */
    private handleModelsList(res: http.ServerResponse): void {
        const { SUPPORTED_MODELS } = require('./proxyTypes');
        const models = SUPPORTED_MODELS.map((m: any) => ({
            id: m.modelId,
            object: 'model',
            created: 1700000000,
            owned_by: m.provider,
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: models }));
    }

    /**
     * Extract session ID from request for account binding
     */
    private extractSessionId(req: http.IncomingMessage): string | undefined {
        // Try common session headers
        const sessionHeader = req.headers['x-session-id'] as string
            || req.headers['x-request-id'] as string
            || req.headers['x-conversation-id'] as string;

        if (sessionHeader) return sessionHeader;

        // Use client IP + User-Agent as fallback session key
        const ip = req.socket.remoteAddress || 'unknown';
        const ua = req.headers['user-agent'] || '';
        return crypto.createHash('md5').update(ip + ua).digest('hex').slice(0, 16);
    }

    /**
     * Create a request-like object that re-emits a pre-read body
     */
    private createBodyRequest(originalReq: http.IncomingMessage, body: string): http.IncomingMessage {
        const { Readable } = require('stream');
        const readable = new Readable({
            read() {
                this.push(body);
                this.push(null);
            }
        });

        // Copy properties from original request
        Object.assign(readable, {
            method: originalReq.method,
            url: originalReq.url,
            headers: originalReq.headers,
            socket: originalReq.socket,
        });

        return readable as any;
    }

    /**
     * Emit status update
     */
    private emitStatus(): void {
        if (this.onStatusChange) {
            this.onStatusChange(this.getStatus());
        }
    }
}
