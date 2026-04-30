-- TTS 音频低存储缓存（按句子内容 hash 去重，全库共用同一 mp3）
-- 1) 在 Supabase Dashboard → Storage → New bucket：
--    Name: tts-audio
--    Public bucket: ON（学生端需直接播放 URL；若关闭请改用签名 URL）
--
-- 2) 在 SQL Editor 执行本文件剩余部分

CREATE TABLE IF NOT EXISTS tts_audio_cache (
  content_hash    text PRIMARY KEY,
  storage_path    text        NOT NULL,
  public_url      text        NOT NULL,
  byte_length     integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_played_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tts_audio_cache_last_played
  ON tts_audio_cache (last_played_at DESC NULLS LAST);

ALTER TABLE tts_audio_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tts_audio_cache_select" ON tts_audio_cache;
DROP POLICY IF EXISTS "tts_audio_cache_insert" ON tts_audio_cache;
DROP POLICY IF EXISTS "tts_audio_cache_update" ON tts_audio_cache;

CREATE POLICY "tts_audio_cache_select" ON tts_audio_cache FOR SELECT USING (true);
CREATE POLICY "tts_audio_cache_insert" ON tts_audio_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "tts_audio_cache_update" ON tts_audio_cache FOR UPDATE USING (true);

-- Storage：公开读 + 匿名写（课堂产品简化版；生产环境建议改为 Edge Function + service_role）
-- 若 bucket 尚未创建，以下语句可能报错，创建 bucket 后再执行。
INSERT INTO storage.buckets (id, name, public)
VALUES ('tts-audio', 'tts-audio', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "tts_audio_public_read" ON storage.objects;
CREATE POLICY "tts_audio_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'tts-audio');

DROP POLICY IF EXISTS "tts_audio_anon_insert" ON storage.objects;
CREATE POLICY "tts_audio_anon_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tts-audio');

DROP POLICY IF EXISTS "tts_audio_anon_update" ON storage.objects;
CREATE POLICY "tts_audio_anon_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'tts-audio');
