/**
 * Supabase Edge Function: tts-synthesize
 * 代理 Azure Speech TTS，前端不持有密钥。
 *
 * 部署后在 Supabase Dashboard → Settings → Edge Functions Secrets 设置：
 *   AZURE_SPEECH_KEY   = 你的 Azure key
 *   AZURE_SPEECH_REGION = eastasia
 *
 * 请求体（JSON）：
 *   { text: string, voice?: string, outputFormat?: string }
 * 响应：audio/mpeg 二进制流，或 JSON 错误
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const DEFAULT_VOICE = 'en-US-JennyNeural';
const DEFAULT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function escapeForSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const azureKey = Deno.env.get('AZURE_SPEECH_KEY');
  const azureRegion = Deno.env.get('AZURE_SPEECH_REGION');

  if (!azureKey || !azureRegion) {
    return new Response(JSON.stringify({ error: 'Azure credentials not configured' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body: { text?: string; voice?: string; outputFormat?: string };
  try {
    body = await req.json() as { text?: string; voice?: string; outputFormat?: string };
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const text = body.text?.trim();
  if (!text) {
    return new Response(JSON.stringify({ error: 'text is required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const voice = body.voice || DEFAULT_VOICE;
  const outputFormat = body.outputFormat || DEFAULT_FORMAT;
  const safeText = escapeForSsml(text.slice(0, 4096));
  const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${voice}">${safeText}</voice></speak>`;

  const endpoint = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const azureRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': azureKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': outputFormat,
    },
    body: ssml,
  });

  if (!azureRes.ok) {
    const errText = await azureRes.text();
    return new Response(
      JSON.stringify({ error: `Azure TTS ${azureRes.status}`, detail: errText.slice(0, 200) }),
      {
        status: azureRes.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  const audioBuffer = await azureRes.arrayBuffer();
  return new Response(audioBuffer, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audioBuffer.byteLength),
    },
  });
});
