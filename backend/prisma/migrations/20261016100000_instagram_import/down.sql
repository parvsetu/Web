-- Rollback (stored image bytes of approved photos are removed with their rows' keys by the app; drop them first if needed)
DROP TABLE IF EXISTS "instagram_media";
DROP TABLE IF EXISTS "instagram_connections";
DROP TYPE IF EXISTS "InstagramMediaStatus";
DROP TYPE IF EXISTS "InstagramConnectionStatus";
