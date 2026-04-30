/**
 * 低存储 TTS 缓存：仅「素材库 / 作业绑定的 material」写入 Supabase Storage。
 * 自由粘贴练习不入库（节省空间）。
 * 依赖：TTS provider 凭证（当前支持 OpenAI / Azure）
 */
import { supabase } from '../lib/supabase';

const BUCKET = 'tts-audio';
export const TTS_CACHE_VERSION = 'v2';
export type TtsProvider = 'openai' | 'azure' | 'none';
const TTS_PROVIDER_RAW = String(import.meta.env.VITE_TTS_PROVIDER || 'openai').toLowerCase();
const providerMap: Record<string, TtsProvider> = {
  openai: 'openai',
  azure: 'azure',
  none: 'none',
};
export const TTS_PROVIDER: TtsProvider = providerMap[TTS_PROVIDER_RAW] || 'openai';
export const OPENAI_TTS_MODEL = import.meta.env.VITE_OPENAI_TTS_MODEL || 'tts-1';
export const OPENAI_TTS_VOICE = import.meta.env.VITE_OPENAI_TTS_VOICE || 'alloy';
export const AZURE_TTS_VOICE = import.meta.env.VITE_AZURE_TTS_VOICE || 'en-US-JennyNeural';
const AZURE_TTS_OUTPUT_FORMAT =
  import.meta.env.VITE_AZURE_TTS_OUTPUT_FORMAT || 'audio-24khz-48kbitrate-mono-mp3';
const TTS_REQUEST_TIMEOUT_MS = 10000;

async function sha256Hex(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeSentenceForTts(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export async function computeTtsContentHash(sentenceText: string): Promise<string> {
  const normalized = normalizeSentenceForTts(sentenceText);
  const providerFingerprint =
    TTS_PROVIDER === 'openai'
      ? `${OPENAI_TTS_MODEL}|${OPENAI_TTS_VOICE}`
      : TTS_PROVIDER === 'azure'
        ? `${AZURE_TTS_VOICE}|${AZURE_TTS_OUTPUT_FORMAT}`
        : 'none';
  const payload = `${TTS_CACHE_VERSION}|${TTS_PROVIDER}|${providerFingerprint}|${normalized}`;
  return sha256Hex(payload);
}

function getOpenAiKey(): string | null {
  return localStorage.getItem('user_ai_api_key')?.trim() || null;
}

async function openAiSpeechMp3(text: string, apiKey: string): Promise<Blob> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TTS_REQUEST_TIMEOUT_MS);
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      input: text.slice(0, 4096),
      response_format: 'mp3',
      speed: 1,
    }),
  }).finally(() => {
    window.clearTimeout(timer);
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI TTS ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.blob();
}

async function azureEdgeFunctionMp3(text: string): Promise<Blob> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase 未配置');

  const endpoint = `${supabaseUrl}/functions/v1/tts-synthesize`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TTS_REQUEST_TIMEOUT_MS);
  const res = await fetch(endpoint, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      text: text.slice(0, 4096),
      voice: AZURE_TTS_VOICE,
      outputFormat: AZURE_TTS_OUTPUT_FORMAT,
    }),
  }).finally(() => {
    window.clearTimeout(timer);
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`tts-synthesize ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.blob();
}

async function synthesizeMp3ByProvider(text: string): Promise<Blob | null> {
  if (TTS_PROVIDER === 'none') return null;
  if (TTS_PROVIDER === 'openai') {
    const apiKey = getOpenAiKey();
    if (!apiKey) {
      console.warn('[TTS cache] 未配置 user_ai_api_key，跳过 OpenAI TTS');
      return null;
    }
    return openAiSpeechMp3(text, apiKey);
  }
  if (TTS_PROVIDER === 'azure') {
    return azureEdgeFunctionMp3(text);
  }
  return null;
}

export interface EnsureTtsAudioOptions {
  sentenceText: string;
  /** 非空时才写入缓存（素材库 id 或作业 material_id） */
  libraryMaterialId: string;
}

/**
 * 返回可播放的公开 URL；失败返回 null（调用方降级 Web Speech）
 */
export async function ensureTtsAudioUrl(opts: EnsureTtsAudioOptions): Promise<string | null> {
  const { sentenceText, libraryMaterialId } = opts;
  if (!libraryMaterialId?.trim()) {
    console.info('[TTS debug] ensure skip: no libraryMaterialId');
    return null;
  }

  const urlEnv = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!urlEnv) {
    console.warn('[TTS cache] 无 Supabase 配置');
    return null;
  }

  if (TTS_PROVIDER === 'none') {
    console.warn('[TTS cache] VITE_TTS_PROVIDER=none，跳过云端 TTS');
    return null;
  }

  const normalized = normalizeSentenceForTts(sentenceText);
  if (!normalized) return null;

  const hash = await computeTtsContentHash(sentenceText);
  console.info('[TTS debug] ensure start', {
    provider: TTS_PROVIDER,
    hashPrefix: hash.slice(0, 8),
    libraryMaterialId: libraryMaterialId.trim(),
  });

  try {
    const { data: row, error: selErr } = await supabase
      .from('tts_audio_cache')
      .select('public_url, storage_path')
      .eq('content_hash', hash)
      .maybeSingle();

    if (!selErr && row?.public_url) {
      console.info('[TTS debug] cache hit', { hashPrefix: hash.slice(0, 8) });
      void supabase
        .from('tts_audio_cache')
        .update({ last_played_at: new Date().toISOString() })
        .eq('content_hash', hash);
      return row.public_url;
    }

    const mp3 = await synthesizeMp3ByProvider(normalized);
    if (!mp3) return null;
    console.info('[TTS debug] synthesize ok', {
      hashPrefix: hash.slice(0, 8),
      bytes: mp3.size,
    });
    const path = `${hash.slice(0, 2)}/${hash}.mp3`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, mp3, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

    if (upErr) {
      console.warn('[TTS cache] Storage 上传失败:', upErr.message);
      return null;
    }
    console.info('[TTS debug] storage upload ok', { path });

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) return null;

    const { error: insErr } = await supabase.from('tts_audio_cache').upsert(
      {
        content_hash: hash,
        storage_path: path,
        public_url: publicUrl,
        byte_length: mp3.size,
        last_played_at: new Date().toISOString(),
      },
      { onConflict: 'content_hash' }
    );

    if (insErr && !String(insErr.message || '').includes('duplicate')) {
      console.warn('[TTS cache] 元数据写入失败:', insErr.message);
    } else {
      console.info('[TTS debug] metadata upsert ok', { hashPrefix: hash.slice(0, 8) });
    }

    return publicUrl;
  } catch (e) {
    console.warn('[TTS cache] ensureTtsAudioUrl:', e);
    return null;
  }
}
