/**
 * AG Auto Click & Scroll — Proxy Authentication Middleware
 * Handles API key validation for incoming proxy requests.
 */

import * as http from 'http';
import * as crypto from 'crypto';
import { AuthMode } from './proxyTypes';

export class ProxyAuth {
    private apiKey: string = '';
    private authEnabled: boolean = true;
    private authMode: AuthMode = 'auto';

    /**
     * Generate a new random API key
     */
    static generateApiKey(): string {
        return 'sk-' + crypto.randomBytes(16).toString('hex');
    }

    /**
     * Update auth configuration
     */
    configure(enabled: boolean, mode: AuthMode, apiKey: string): void {
        this.authEnabled = enabled;
        this.authMode = mode;
        this.apiKey = apiKey;
    }

    /**
     * Get current API key
     */
    getApiKey(): string {
        return this.apiKey;
    }

    /**
     * Check if a request is authenticated
     * Returns true if request is allowed, false if rejected
     */
    authenticate(req: http.IncomingMessage): { allowed: boolean; reason?: string } {
        // Auth disabled globally
        if (!this.authEnabled || this.authMode === 'off') {
            return { allowed: true };
        }

        const url = req.url || '';
        const remoteAddr = req.socket.remoteAddress || '';

        // Health endpoint exception
        if (this.authMode === 'allExceptHealth' && (url === '/healthz' || url === '/health')) {
            return { allowed: true };
        }

        // Auto mode: no auth for localhost, require for LAN
        if (this.authMode === 'auto') {
            const isLocalhost = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';

            // Health endpoint is always open
            if (url === '/healthz' || url === '/health') {
                return { allowed: true };
            }

            if (isLocalhost) {
                return { allowed: true };
            }
        }

        // Extract API key from request
        const authHeader = req.headers['authorization'] || '';
        const xApiKey = req.headers['x-api-key'] as string || '';

        let providedKey = '';

        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
            providedKey = authHeader.slice(7).trim();
        } else if (xApiKey) {
            providedKey = xApiKey.trim();
        }

        if (!providedKey) {
            return { allowed: false, reason: 'Missing API key. Use Authorization: Bearer <key> or x-api-key header.' };
        }

        // Constant-time comparison to prevent timing attacks
        if (!this.apiKey || !this.timingSafeEqual(providedKey, this.apiKey)) {
            return { allowed: false, reason: 'Invalid API key.' };
        }

        return { allowed: true };
    }

    /**
     * Send 401 Unauthorized response
     */
    sendUnauthorized(res: http.ServerResponse, reason: string): void {
        res.writeHead(401, {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer',
        });
        res.end(JSON.stringify({
            error: {
                message: reason,
                type: 'authentication_error',
                code: 'unauthorized',
            }
        }));
    }

    /**
     * Constant-time string comparison
     */
    private timingSafeEqual(a: string, b: string): boolean {
        if (a.length !== b.length) {
            // Still do a comparison to maintain constant time
            const dummy = Buffer.alloc(a.length);
            crypto.timingSafeEqual(Buffer.from(a), dummy);
            return false;
        }
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    }
}
