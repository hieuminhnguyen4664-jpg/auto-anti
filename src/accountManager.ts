/**
 * AG Auto Click & Scroll — Account Manager
 * Manages upstream API accounts, rotation, rate-limit handling, and circuit breaker.
 */

import { ProxyAccount, OrchestrationMode, CircuitBreakerConfig, SessionBinding } from './proxyTypes';

export class AccountManager {
    private accounts: ProxyAccount[] = [];
    private sessions: Map<string, SessionBinding> = new Map();
    private mode: OrchestrationMode = 'cachePriority';
    private maxWaitSeconds: number = 60;
    private fixedAccountId: string | null = null;
    private circuitBreaker: CircuitBreakerConfig = {
        enabled: true,
        backoffLevels: [60, 300, 1800, 7200],
    };
    private roundRobinIndex: number = 0;

    /**
     * Update configuration
     */
    configure(
        accounts: ProxyAccount[],
        mode: OrchestrationMode,
        maxWait: number,
        fixedId: string | null,
        cb: CircuitBreakerConfig
    ): void {
        this.accounts = accounts;
        this.mode = mode;
        this.maxWaitSeconds = maxWait;
        this.fixedAccountId = fixedId;
        this.circuitBreaker = cb;
    }

    /**
     * Get all accounts
     */
    getAccounts(): ProxyAccount[] {
        return [...this.accounts];
    }

    /**
     * Get account status summary
     */
    getStatus(): { active: number; limited: number; total: number } {
        const now = Date.now();
        let active = 0;
        let limited = 0;
        for (const acc of this.accounts) {
            if (acc.status === 'disabled') continue;
            if (this.isCircuitOpen(acc, now)) {
                limited++;
            } else if (acc.status === 'rateLimited' && acc.rateLimitResetAt > now) {
                limited++;
            } else {
                active++;
            }
        }
        return { active, limited, total: this.accounts.length };
    }

    /**
     * Select the best account for a request
     */
    selectAccount(sessionId?: string, provider?: string): ProxyAccount | null {
        const now = Date.now();

        // Fixed account mode
        if (this.fixedAccountId) {
            const fixed = this.accounts.find(a => a.id === this.fixedAccountId && a.status !== 'disabled');
            return fixed || null;
        }

        // Filter available accounts by provider
        const available = this.accounts.filter(a => {
            if (a.status === 'disabled') return false;
            if (provider && a.provider !== provider) return false;
            if (this.isCircuitOpen(a, now)) return false;
            if (a.status === 'rateLimited' && a.rateLimitResetAt > now) return false;
            return true;
        });

        if (available.length === 0) {
            // Try to find one that will be available soonest
            return this.findSoonestAvailable(provider);
        }

        switch (this.mode) {
            case 'cachePriority':
                return this.selectCachePriority(available, sessionId, now);
            case 'balance':
                return this.selectBalance(available, sessionId, now);
            case 'performance':
                return this.selectPerformance(available);
            default:
                return available[0] || null;
        }
    }

    /**
     * Cache Priority: Stick to session-bound account, wait if rate limited
     */
    private selectCachePriority(available: ProxyAccount[], sessionId?: string, now: number = Date.now()): ProxyAccount | null {
        if (sessionId) {
            const binding = this.sessions.get(sessionId);
            if (binding) {
                const bound = available.find(a => a.id === binding.accountId);
                if (bound) return bound;
                // Bound account not available — check if we should wait
                const original = this.accounts.find(a => a.id === binding.accountId);
                if (original && original.status === 'rateLimited') {
                    const waitTime = (original.rateLimitResetAt - now) / 1000;
                    if (waitTime > 0 && waitTime <= this.maxWaitSeconds) {
                        // Will wait — return the original (caller should handle wait)
                        return original;
                    }
                }
            }
            // Bind to new account
            const selected = this.selectLeastUsed(available);
            if (selected) {
                this.sessions.set(sessionId, { sessionId, accountId: selected.id, boundAt: now });
            }
            return selected;
        }
        return this.selectLeastUsed(available);
    }

    /**
     * Balance: Stick to session, but auto-switch if limited
     */
    private selectBalance(available: ProxyAccount[], sessionId?: string, now: number = Date.now()): ProxyAccount | null {
        if (sessionId) {
            const binding = this.sessions.get(sessionId);
            if (binding) {
                const bound = available.find(a => a.id === binding.accountId);
                if (bound) return bound;
            }
            // Re-bind to available account
            const selected = this.selectLeastUsed(available);
            if (selected) {
                this.sessions.set(sessionId, { sessionId, accountId: selected.id, boundAt: now });
            }
            return selected;
        }
        return this.selectLeastUsed(available);
    }

    /**
     * Performance: Pure round-robin
     */
    private selectPerformance(available: ProxyAccount[]): ProxyAccount | null {
        if (available.length === 0) return null;
        this.roundRobinIndex = this.roundRobinIndex % available.length;
        const selected = available[this.roundRobinIndex];
        this.roundRobinIndex++;
        return selected;
    }

    /**
     * Select the least-recently-used account
     */
    private selectLeastUsed(accounts: ProxyAccount[]): ProxyAccount | null {
        if (accounts.length === 0) return null;
        return accounts.reduce((min, acc) => acc.lastUsedAt < min.lastUsedAt ? acc : min);
    }

    /**
     * Find the account that will become available soonest
     */
    private findSoonestAvailable(provider?: string): ProxyAccount | null {
        const now = Date.now();
        let soonest: ProxyAccount | null = null;
        let soonestTime = Infinity;

        for (const acc of this.accounts) {
            if (acc.status === 'disabled') continue;
            if (provider && acc.provider !== provider) continue;

            let resetTime = 0;
            if (this.isCircuitOpen(acc, now)) {
                resetTime = acc.circuitBreakerUntil;
            } else if (acc.status === 'rateLimited') {
                resetTime = acc.rateLimitResetAt;
            }

            if (resetTime > 0 && resetTime < soonestTime) {
                soonestTime = resetTime;
                soonest = acc;
            }
        }

        return soonest;
    }

    /**
     * Report a successful request
     */
    reportSuccess(accountId: string): void {
        const acc = this.accounts.find(a => a.id === accountId);
        if (!acc) return;
        acc.totalRequests++;
        acc.lastUsedAt = Date.now();
        acc.consecutiveFailures = 0;
        acc.status = 'active';
        // Gradually reduce circuit breaker level on success
        if (acc.circuitBreakerLevel > 0) {
            acc.circuitBreakerLevel = Math.max(0, acc.circuitBreakerLevel - 1);
        }
    }

    /**
     * Report a rate-limited response (HTTP 429)
     */
    reportRateLimit(accountId: string, retryAfterMs?: number): void {
        const acc = this.accounts.find(a => a.id === accountId);
        if (!acc) return;
        acc.totalRequests++;
        acc.totalErrors++;
        acc.lastUsedAt = Date.now();
        acc.status = 'rateLimited';
        acc.rateLimitResetAt = Date.now() + (retryAfterMs || 60000);
    }

    /**
     * Report a quota exhaustion or fatal error
     */
    reportError(accountId: string, isQuotaExhaustion: boolean = false): void {
        const acc = this.accounts.find(a => a.id === accountId);
        if (!acc) return;
        acc.totalRequests++;
        acc.totalErrors++;
        acc.consecutiveFailures++;
        acc.lastUsedAt = Date.now();

        if (isQuotaExhaustion && this.circuitBreaker.enabled) {
            // Escalate circuit breaker level
            acc.circuitBreakerLevel = Math.min(4, acc.circuitBreakerLevel + 1);
            const backoffSeconds = this.circuitBreaker.backoffLevels[
                Math.min(acc.circuitBreakerLevel - 1, this.circuitBreaker.backoffLevels.length - 1)
            ];
            acc.circuitBreakerUntil = Date.now() + backoffSeconds * 1000;
            acc.status = 'error';
        } else {
            acc.status = 'error';
        }
    }

    /**
     * Check if circuit breaker is open for an account
     */
    private isCircuitOpen(acc: ProxyAccount, now: number): boolean {
        return this.circuitBreaker.enabled && acc.circuitBreakerLevel > 0 && acc.circuitBreakerUntil > now;
    }

    /**
     * Clear all session bindings
     */
    clearSessions(): void {
        this.sessions.clear();
    }

    /**
     * Add a new account
     */
    addAccount(account: ProxyAccount): void {
        this.accounts.push(account);
    }

    /**
     * Remove an account by ID
     */
    removeAccount(id: string): void {
        this.accounts = this.accounts.filter(a => a.id !== id);
        // Clean up sessions bound to this account
        for (const [sid, binding] of this.sessions) {
            if (binding.accountId === id) {
                this.sessions.delete(sid);
            }
        }
    }
}
