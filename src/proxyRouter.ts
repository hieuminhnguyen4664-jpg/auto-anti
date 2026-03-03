/**
 * AG Auto Click & Scroll — Model Router
 * Maps model names (with wildcard support) to upstream targets.
 */

import { ModelRoute } from './proxyTypes';

export class ProxyRouter {
    private routes: ModelRoute[] = [];
    private backgroundModel: string = 'gemini-2.5-flash';

    /**
     * Update routing configuration
     */
    configure(routes: ModelRoute[], backgroundModel: string): void {
        this.routes = routes;
        this.backgroundModel = backgroundModel;
    }

    /**
     * Resolve a model name through routing rules
     * Returns the target model and provider, or the original if no route matches
     */
    resolve(requestedModel: string): { model: string; provider: 'google' | 'anthropic' | 'openai' } {
        // Check custom routes (exact match first, then wildcards)
        for (const route of this.routes) {
            if (route.isWildcard) {
                if (this.matchWildcard(requestedModel, route.pattern)) {
                    return { model: route.targetModel, provider: route.targetProvider };
                }
            } else {
                if (requestedModel === route.pattern) {
                    return { model: route.targetModel, provider: route.targetProvider };
                }
            }
        }

        // Auto-detect provider from model name
        const provider = this.detectProvider(requestedModel);
        return { model: requestedModel, provider };
    }

    /**
     * Get background task model
     */
    getBackgroundModel(): string {
        return this.backgroundModel;
    }

    /**
     * Detect provider from model name patterns
     */
    private detectProvider(model: string): 'google' | 'anthropic' | 'openai' {
        const lower = model.toLowerCase();
        if (lower.startsWith('gemini-') || lower.startsWith('gemma-')) {
            return 'google';
        }
        if (lower.startsWith('claude-')) {
            return 'anthropic';
        }
        if (lower.startsWith('gpt-') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) {
            return 'openai';
        }
        // Default to google for unknown models
        return 'google';
    }

    /**
     * Match a model name against a wildcard pattern
     * Supports * for any sequence of characters
     */
    private matchWildcard(text: string, pattern: string): boolean {
        // Convert wildcard pattern to regex
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
        const regex = new RegExp(regexStr, 'i');
        return regex.test(text);
    }

    /**
     * Get the upstream API base URL for a provider
     */
    static getUpstreamUrl(provider: 'google' | 'anthropic' | 'openai'): string {
        switch (provider) {
            case 'google':
                return 'https://generativelanguage.googleapis.com';
            case 'anthropic':
                return 'https://api.anthropic.com';
            case 'openai':
                return 'https://api.openai.com';
        }
    }

    /**
     * Build the upstream request URL for a specific protocol and model
     */
    static buildUpstreamPath(
        provider: 'google' | 'anthropic' | 'openai',
        model: string,
        originalPath: string,
        isStreaming: boolean = false
    ): string {
        switch (provider) {
            case 'google': {
                const action = isStreaming ? 'streamGenerateContent?alt=sse' : 'generateContent';
                return `/v1beta/models/${model}:${action}`;
            }
            case 'anthropic':
                return '/v1/messages';
            case 'openai':
                return originalPath; // Keep the original path
        }
    }

    /**
     * Get all configured routes
     */
    getRoutes(): ModelRoute[] {
        return [...this.routes];
    }

    /**
     * Add a new route
     */
    addRoute(route: ModelRoute): void {
        this.routes.push(route);
    }

    /**
     * Remove a route by index
     */
    removeRoute(index: number): void {
        if (index >= 0 && index < this.routes.length) {
            this.routes.splice(index, 1);
        }
    }
}
