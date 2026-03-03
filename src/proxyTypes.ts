/**
 * AG Auto Click & Scroll — API Proxy Types
 * All interfaces and types for the local API proxy system.
 */

// ===== Orchestration Modes =====
export type OrchestrationMode = 'cachePriority' | 'balance' | 'performance';

// ===== Auth Modes =====
export type AuthMode = 'off' | 'all' | 'allExceptHealth' | 'auto';

// ===== Thinking Budget Modes =====
export type ThinkingBudgetMode = 'autoLimit' | 'adaptive' | 'passthrough' | 'custom';

// ===== Account Status =====
export type AccountStatus = 'active' | 'rateLimited' | 'error' | 'disabled';

// ===== Proxy Account =====
export interface ProxyAccount {
    id: string;
    name: string;
    provider: 'google' | 'anthropic' | 'openai';
    apiKey: string;
    status: AccountStatus;
    rateLimitResetAt: number;        // timestamp ms
    circuitBreakerLevel: number;     // 0-4 (0 = healthy)
    circuitBreakerUntil: number;     // timestamp ms
    consecutiveFailures: number;
    totalRequests: number;
    totalErrors: number;
    lastUsedAt: number;
}

// ===== Model Route =====
export interface ModelRoute {
    pattern: string;         // e.g. "gpt-4*" or "claude-3-opus"
    targetModel: string;     // e.g. "gemini-2.5-pro"
    targetProvider: 'google' | 'anthropic' | 'openai';
    isWildcard: boolean;
}

// ===== Circuit Breaker Config =====
export interface CircuitBreakerConfig {
    enabled: boolean;
    backoffLevels: [number, number, number, number]; // seconds per level
}

// ===== Session Binding =====
export interface SessionBinding {
    sessionId: string;
    accountId: string;
    boundAt: number;
}

// ===== Proxy Config =====
export interface ProxyConfig {
    // Service
    port: number;
    autoStart: boolean;
    allowLan: boolean;
    requestTimeout: number;         // seconds

    // Authentication
    authEnabled: boolean;
    authMode: AuthMode;
    apiKey: string;
    webUiPassword: string;         // empty = use apiKey

    // Accounts
    accounts: ProxyAccount[];

    // Orchestration
    orchestrationMode: OrchestrationMode;
    maxWaitSeconds: number;         // for cachePriority mode
    fixedAccountId: string | null;  // null = disabled

    // Circuit Breaker
    circuitBreaker: CircuitBreakerConfig;

    // Model Router
    modelRoutes: ModelRoute[];
    backgroundModel: string;        // default "gemini-2.5-flash"

    // Thinking
    thinkingBudgetMode: ThinkingBudgetMode;
    customThinkingBudget: number;

    // User-Agent
    userAgentOverride: string;
}

// ===== Proxy Status =====
export interface ProxyStatus {
    running: boolean;
    port: number;
    uptime: number;                 // seconds
    totalRequests: number;
    activeConnections: number;
    accountsActive: number;
    accountsLimited: number;
}

// ===== Supported Models =====
export interface SupportedModel {
    displayName: string;
    modelId: string;
    description: string;
    provider: 'google' | 'anthropic' | 'openai';
}

// ===== Default Config =====
export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
    port: 8045,
    autoStart: false,
    allowLan: false,
    requestTimeout: 120,

    authEnabled: true,
    authMode: 'auto',
    apiKey: '',
    webUiPassword: '',

    accounts: [],

    orchestrationMode: 'cachePriority',
    maxWaitSeconds: 60,
    fixedAccountId: null,

    circuitBreaker: {
        enabled: true,
        backoffLevels: [60, 300, 1800, 7200],
    },

    modelRoutes: [],
    backgroundModel: 'gemini-2.5-flash',

    thinkingBudgetMode: 'autoLimit',
    customThinkingBudget: 24576,

    userAgentOverride: '',
};

// ===== Built-in Supported Models =====
export const SUPPORTED_MODELS: SupportedModel[] = [
    { displayName: 'Gemini 2.5 Flash', modelId: 'gemini-2.5-flash', description: 'Gemini 2.5 Flash', provider: 'google' },
    { displayName: 'Gemini 2.5 Pro', modelId: 'gemini-2.5-pro', description: 'Gemini 2.5 Pro', provider: 'google' },
    { displayName: 'Gemini 2.5 Flash (Thinking)', modelId: 'gemini-2.5-flash-thinking', description: 'Gemini 2.5 Flash (Thinking)', provider: 'google' },
    { displayName: 'Gemini 2.5 Flash Lite', modelId: 'gemini-2.5-flash-lite', description: 'Gemini 2.5 Flash Lite', provider: 'google' },
    { displayName: 'Gemini 3 Flash', modelId: 'gemini-3-flash', description: 'Gemini 3 Flash', provider: 'google' },
    { displayName: 'Gemini 3 Pro (High)', modelId: 'gemini-3-pro-high', description: 'Gemini 3 Pro (High)', provider: 'google' },
    { displayName: 'Gemini 3 Pro (Low)', modelId: 'gemini-3-pro-low', description: 'Gemini 3 Pro (Low)', provider: 'google' },
    { displayName: 'Gemini 3.1 Pro (High)', modelId: 'gemini-3.1-pro-high', description: 'Gemini 3.1 Pro (High)', provider: 'google' },
    { displayName: 'Gemini 3.1 Pro (Low)', modelId: 'gemini-3.1-pro-low', description: 'Gemini 3.1 Pro (Low)', provider: 'google' },
    { displayName: 'Gemini 3.1 Flash Image', modelId: 'gemini-3.1-flash-image', description: 'Gemini 3.1 Flash Image', provider: 'google' },
    { displayName: 'Claude Sonnet 4.6 (Thinking)', modelId: 'claude-sonnet-4-6', description: 'Claude Sonnet 4.6 (Thinking)', provider: 'anthropic' },
    { displayName: 'Claude Opus 4.6 (Thinking)', modelId: 'claude-opus-4-6-thinking', description: 'Claude Opus 4.6 (Thinking)', provider: 'anthropic' },
    { displayName: 'GPT-OSS 120B (Medium)', modelId: 'gpt-oss-120b-medium', description: 'GPT-OSS 120B (Medium)', provider: 'openai' },
];
