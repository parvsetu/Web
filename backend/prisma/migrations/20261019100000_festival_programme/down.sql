-- Rollback (stored poster / artist images stay in stored_images; delete keys under event/<id>/programme/ if needed)
DROP TABLE IF EXISTS "programme_guests";
DROP TABLE IF EXISTS "programme_items";
DROP TABLE IF EXISTS "programme_days";
