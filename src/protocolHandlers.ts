/**
 * AG Auto Click & Scroll — Protocol Handlers
 * Handles forwarding requests to upstream APIs via OpenAI, Anthropic, and Gemini protocols.
 */

import * as http from 'http';
import * as https from 'https';
import { ProxyAccount } from './proxyTypes';
import { ProxyRouter } from './proxyRouter';

// ===== Types =====
interface ForwardResult {
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    isRateLimit: boolean;
    isQuotaExhaustion: boolean;
    retryAfterMs?: number;
}

// ===== Helper: Read request body =====
function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

// ===== Helper: Extract model from request body =====
export function extractModelFromBody(body: string, protocol: 'openai' | 'anthropic' | 'gemini'): string {
    try {
        const parsed = JSON.parse(body);
        return parsed.model || '';
    } catch {
        return '';
    }
}

// ===== Helper: Extract model from Gemini URL path =====
export function extractModelFromGeminiPath(path: string): string {
    // /v1beta/models/gemini-2.5-flash:generateContent
    const match = path.match(/\/v1beta\/models\/([^:/?]+)/);
    return match ? match[1] : '';
}

// ===== Detect protocol from request path =====
export function detectProtocol(path: string): 'openai' | 'anthropic' | 'gemini' | null {
    if (path.startsWith('/v1/chat/completions') || path.startsWith('/v1/completions') || path.startsWith('/v1/responses')) {
        return 'openai';
    }
    if (path.startsWith('/v1/messages')) {
        return 'anthropic';
    }
    if (path.startsWith('/v1beta/models/')) {
        return 'gemini';
    }
    return null;
}

// ===== Forward request to upstream =====
export async function forwardRequest(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    account: ProxyAccount,
    resolvedModel: string,
    protocol: 'openai' | 'anthropic' | 'gemini',
    requestTimeout: number,
    userAgentOverride?: string
): Promise<ForwardResult> {
    const body = await readBody(clientReq);
    const baseUrl = ProxyRouter.getUpstreamUrl(account.provider);

    // Determine if streaming
    let isStreaming = false;
    try {
        const parsed = JSON.parse(body);
        isStreaming = !!parsed.stream;
    } catch { }

    // Build upstream request
    const upstreamPath = buildUpstreamRequest(protocol, account, resolvedModel, clientReq.url || '', isStreaming);
    const upstreamHeaders = buildUpstreamHeaders(protocol, account, body, clientReq, userAgentOverride);
    const upstreamBody = transformRequestBody(protocol, account.provider, body, resolvedModel);

    const url = new URL(upstreamPath, baseUrl);

    // Add API key as query param for Gemini
    if (account.provider === 'google') {
        url.searchParams.set('key', account.apiKey);
    }

    return new Promise<ForwardResult>((resolve) => {
        const upstreamReq = https.request(
            url,
            {
                method: clientReq.method || 'POST',
                headers: upstreamHeaders,
                timeout: requestTimeout * 1000,
            },
            (upstreamRes) => {
                const statusCode = upstreamRes.statusCode || 500;
                const isRateLimit = statusCode === 429;
                const isQuotaExhaustion = statusCode === 429 || statusCode === 403;
                const retryAfterHeader = upstreamRes.headers['retry-after'];
                const retryAfterMs = retryAfterHeader
                    ? (parseInt(retryAfterHeader as string) || 60) * 1000
                    : undefined;

                // Set response headers
                const responseHeaders: Record<string, string> = {
                    'Content-Type': upstreamRes.headers['content-type'] || 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                };

                if (isStreaming && statusCode === 200) {
                    responseHeaders['Cache-Control'] = 'no-cache';
                    responseHeaders['Connection'] = 'keep-alive';

                    // Transform streaming response if needed
                    if (account.provider === 'google' && protocol === 'openai') {
                        // Gemini → OpenAI SSE transformation
                        clientRes.writeHead(statusCode, responseHeaders);
                        transformGeminiStreamToOpenAI(upstreamRes, clientRes, resolvedModel);
                    } else if (account.provider === 'anthropic' && protocol === 'openai') {
                        // Anthropic → OpenAI SSE transformation
                        clientRes.writeHead(statusCode, responseHeaders);
                        transformAnthropicStreamToOpenAI(upstreamRes, clientRes, resolvedModel);
                    } else {
                        // Pass through
                        clientRes.writeHead(statusCode, responseHeaders);
                        upstreamRes.pipe(clientRes);
                    }
                } else {
                    // Non-streaming: collect body and transform if needed
                    let responseBody = '';
                    upstreamRes.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });
                    upstreamRes.on('end', () => {
                        let finalBody = responseBody;
                        if (statusCode === 200 && account.provider === 'google' && protocol === 'openai') {
                            finalBody = transformGeminiResponseToOpenAI(responseBody, resolvedModel);
                        } else if (statusCode === 200 && account.provider === 'anthropic' && protocol === 'openai') {
                            finalBody = transformAnthropicResponseToOpenAI(responseBody, resolvedModel);
                        }
                        clientRes.writeHead(statusCode, responseHeaders);
                        clientRes.end(finalBody);
                    });
                }

                resolve({
                    statusCode,
                    headers: upstreamRes.headers,
                    isRateLimit,
                    isQuotaExhaustion,
                    retryAfterMs,
                });
            }
        );

        upstreamReq.on('error', (err) => {
            console.error('[Proxy] Upstream error:', err.message);
            clientRes.writeHead(502, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({
                error: { message: 'Bad Gateway: ' + err.message, type: 'proxy_error', code: 'upstream_error' }
            }));
            resolve({
                statusCode: 502,
                headers: {},
                isRateLimit: false,
                isQuotaExhaustion: false,
            });
        });

        upstreamReq.on('timeout', () => {
            upstreamReq.destroy();
            clientRes.writeHead(504, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({
                error: { message: 'Gateway Timeout', type: 'proxy_error', code: 'timeout' }
            }));
            resolve({
                statusCode: 504,
                headers: {},
                isRateLimit: false,
                isQuotaExhaustion: false,
            });
        });

        upstreamReq.write(upstreamBody);
        upstreamReq.end();
    });
}

// ===== Build upstream request path =====
function buildUpstreamRequest(
    protocol: 'openai' | 'anthropic' | 'gemini',
    account: ProxyAccount,
    model: string,
    originalPath: string,
    isStreaming: boolean
): string {
    if (account.provider === 'google') {
        const action = isStreaming ? 'streamGenerateContent?alt=sse' : 'generateContent';
        return `/v1beta/models/${model}:${action}`;
    }
    if (account.provider === 'anthropic') {
        return '/v1/messages';
    }
    // OpenAI — keep original path
    return originalPath;
}

// ===== Build upstream headers =====
function buildUpstreamHeaders(
    protocol: 'openai' | 'anthropic' | 'gemini',
    account: ProxyAccount,
    body: string,
    clientReq: http.IncomingMessage,
    userAgentOverride?: string
): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
    };

    if (userAgentOverride) {
        headers['User-Agent'] = userAgentOverride;
    }

    switch (account.provider) {
        case 'google':
            // API key is passed as query param
            break;
        case 'anthropic':
            headers['x-api-key'] = account.apiKey;
            headers['anthropic-version'] = '2023-06-01';
            break;
        case 'openai':
            headers['Authorization'] = `Bearer ${account.apiKey}`;
            break;
    }

    return headers;
}

// ===== Transform request body between protocols =====
function transformRequestBody(
    sourceProtocol: 'openai' | 'anthropic' | 'gemini',
    targetProvider: 'google' | 'anthropic' | 'openai',
    body: string,
    resolvedModel: string
): string {
    try {
        const parsed = JSON.parse(body);

        // OpenAI → Gemini
        if (sourceProtocol === 'openai' && targetProvider === 'google') {
            return JSON.stringify(convertOpenAIToGemini(parsed));
        }

        // OpenAI → Anthropic
        if (sourceProtocol === 'openai' && targetProvider === 'anthropic') {
            return JSON.stringify(convertOpenAIToAnthropic(parsed, resolvedModel));
        }

        // Same protocol — just update model
        parsed.model = resolvedModel;
        return JSON.stringify(parsed);
    } catch {
        return body;
    }
}

// ===== OpenAI → Gemini conversion =====
function convertOpenAIToGemini(openaiReq: any): any {
    const contents: any[] = [];
    const systemParts: string[] = [];

    if (openaiReq.messages) {
        for (const msg of openaiReq.messages) {
            if (msg.role === 'system') {
                systemParts.push(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
            } else {
                const role = msg.role === 'assistant' ? 'model' : 'user';
                contents.push({
                    role,
                    parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
                });
            }
        }
    }

    const geminiReq: any = { contents };

    if (systemParts.length > 0) {
        geminiReq.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
    }

    // Map generation config
    const genConfig: any = {};
    if (openaiReq.max_tokens) genConfig.maxOutputTokens = openaiReq.max_tokens;
    if (openaiReq.temperature !== undefined) genConfig.temperature = openaiReq.temperature;
    if (openaiReq.top_p !== undefined) genConfig.topP = openaiReq.top_p;
    if (openaiReq.stop) genConfig.stopSequences = Array.isArray(openaiReq.stop) ? openaiReq.stop : [openaiReq.stop];

    if (Object.keys(genConfig).length > 0) {
        geminiReq.generationConfig = genConfig;
    }

    return geminiReq;
}

// ===== OpenAI → Anthropic conversion =====
function convertOpenAIToAnthropic(openaiReq: any, model: string): any {
    const messages: any[] = [];
    let systemPrompt = '';

    if (openaiReq.messages) {
        for (const msg of openaiReq.messages) {
            if (msg.role === 'system') {
                systemPrompt += (systemPrompt ? '\n\n' : '') + (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
            } else {
                messages.push({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                });
            }
        }
    }

    const anthropicReq: any = {
        model,
        messages,
        max_tokens: openaiReq.max_tokens || 4096,
    };

    if (systemPrompt) {
        anthropicReq.system = systemPrompt;
    }

    if (openaiReq.temperature !== undefined) anthropicReq.temperature = openaiReq.temperature;
    if (openaiReq.top_p !== undefined) anthropicReq.top_p = openaiReq.top_p;
    if (openaiReq.stream) anthropicReq.stream = true;

    return anthropicReq;
}

// ===== Gemini → OpenAI response transformation =====
function transformGeminiResponseToOpenAI(body: string, model: string): string {
    try {
        const geminiRes = JSON.parse(body);
        const candidate = geminiRes.candidates?.[0];
        const content = candidate?.content?.parts?.[0]?.text || '';

        return JSON.stringify({
            id: 'chatcmpl-' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
                index: 0,
                message: { role: 'assistant', content },
                finish_reason: mapGeminiFinishReason(candidate?.finishReason),
            }],
            usage: {
                prompt_tokens: geminiRes.usageMetadata?.promptTokenCount || 0,
                completion_tokens: geminiRes.usageMetadata?.candidatesTokenCount || 0,
                total_tokens: geminiRes.usageMetadata?.totalTokenCount || 0,
            },
        });
    } catch {
        return body;
    }
}

// ===== Anthropic → OpenAI response transformation =====
function transformAnthropicResponseToOpenAI(body: string, model: string): string {
    try {
        const anthropicRes = JSON.parse(body);
        const content = anthropicRes.content?.map((c: any) => c.text).join('') || '';

        return JSON.stringify({
            id: 'chatcmpl-' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
                index: 0,
                message: { role: 'assistant', content },
                finish_reason: anthropicRes.stop_reason === 'end_turn' ? 'stop' : anthropicRes.stop_reason || 'stop',
            }],
            usage: {
                prompt_tokens: anthropicRes.usage?.input_tokens || 0,
                completion_tokens: anthropicRes.usage?.output_tokens || 0,
                total_tokens: (anthropicRes.usage?.input_tokens || 0) + (anthropicRes.usage?.output_tokens || 0),
            },
        });
    } catch {
        return body;
    }
}

// ===== Gemini streaming → OpenAI SSE =====
function transformGeminiStreamToOpenAI(
    upstream: http.IncomingMessage,
    client: http.ServerResponse,
    model: string
): void {
    let buffer = '';
    upstream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (!data || data === '[DONE]') {
                    client.write('data: [DONE]\n\n');
                    continue;
                }
                try {
                    const gemini = JSON.parse(data);
                    const text = gemini.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (text) {
                        const openaiChunk = {
                            id: 'chatcmpl-' + Date.now(),
                            object: 'chat.completion.chunk',
                            created: Math.floor(Date.now() / 1000),
                            model,
                            choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
                        };
                        client.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
                    }
                    if (gemini.candidates?.[0]?.finishReason) {
                        const doneChunk = {
                            id: 'chatcmpl-' + Date.now(),
                            object: 'chat.completion.chunk',
                            created: Math.floor(Date.now() / 1000),
                            model,
                            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                        };
                        client.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
                        client.write('data: [DONE]\n\n');
                    }
                } catch { }
            }
        }
    });

    upstream.on('end', () => {
        client.write('data: [DONE]\n\n');
        client.end();
    });

    upstream.on('error', () => {
        client.end();
    });
}

// ===== Anthropic streaming → OpenAI SSE =====
function transformAnthropicStreamToOpenAI(
    upstream: http.IncomingMessage,
    client: http.ServerResponse,
    model: string
): void {
    let buffer = '';
    upstream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (!data) continue;
                try {
                    const event = JSON.parse(data);
                    if (event.type === 'content_block_delta' && event.delta?.text) {
                        const openaiChunk = {
                            id: 'chatcmpl-' + Date.now(),
                            object: 'chat.completion.chunk',
                            created: Math.floor(Date.now() / 1000),
                            model,
                            choices: [{ index: 0, delta: { content: event.delta.text }, finish_reason: null }],
                        };
                        client.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
                    } else if (event.type === 'message_stop') {
                        const doneChunk = {
                            id: 'chatcmpl-' + Date.now(),
                            object: 'chat.completion.chunk',
                            created: Math.floor(Date.now() / 1000),
                            model,
                            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                        };
                        client.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
                        client.write('data: [DONE]\n\n');
                    }
                } catch { }
            }
        }
    });

    upstream.on('end', () => {
        client.write('data: [DONE]\n\n');
        client.end();
    });

    upstream.on('error', () => {
        client.end();
    });
}

// ===== Map Gemini finish reason to OpenAI =====
function mapGeminiFinishReason(reason?: string): string {
    switch (reason) {
        case 'STOP': return 'stop';
        case 'MAX_TOKENS': return 'length';
        case 'SAFETY': return 'content_filter';
        case 'RECITATION': return 'content_filter';
        default: return 'stop';
    }
}
