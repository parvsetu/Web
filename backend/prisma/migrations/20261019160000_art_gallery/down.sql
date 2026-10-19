-- Rollback (artwork images stay in stored_images under event/<id>/art/ — delete those keys if needed)
DROP TABLE IF EXISTS "artwork_enquiries";
DROP TABLE IF EXISTS "artworks";
