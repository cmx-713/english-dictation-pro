/**
 * Supabase Edge Function: ai-chat
 * 代理 LLM API（默认 DeepSeek），前端不持有密钥。
 *
 * 部署后在 Supabase Dashboard → Settings → Edge Functions Secrets 设置：
 *   AI_API_KEY  = 你的 DeepSeek / OpenAI key（sk-...）
 *   AI_API_URL  = https://api.deepseek.com/v1/chat/completions（可选，不填用默认）
 *   AI_MODEL    = deepseek-chat（可选，不填用默认）
 *
 * 请求体（JSON，与 OpenAI 兼容格式相同）：
 *   { messages: ChatMessage[], stream?: boolean, temperature?: number }
 * 响应：透传上游 LLM 的响应（支持 stream SSE）
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('AI_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI_API_KEY 未配置，请在 Supabase Secrets 中设置' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const apiUrl = Deno.env.get('AI_API_URL') || DEFAULT_API_URL;
  const defaultModel = Deno.env.get('AI_MODEL') || DEFAULT_MODEL;

  let body: { messages?: unknown[]; stream?: boolean; temperature?: number; model?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '请求体不是合法 JSON' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages 不能为空' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: body.model || defaultModel,
      messages: body.messages,
      temperature: body.temperature ?? 0.7,
      stream: body.stream ?? true,
    }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(JSON.stringify({ error: `上游 LLM 错误 ${upstream.status}: ${errText.slice(0, 300)}` }), {
      status: upstream.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // 透传流式响应（SSE）或普通 JSON 响应
  const contentType = upstream.headers.get('content-type') || 'application/json';
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    },
  });
});
