-- Difficulty labels transcribed from three photos and confirmed by the user.
BEGIN;
CREATE TEMP TABLE confirmed_difficulties (
  puzzle_id text PRIMARY KEY, title text NOT NULL, difficulty text NOT NULL
) ON COMMIT DROP;
INSERT INTO confirmed_difficulties VALUES
  ('260916_01', '260916 Mini Rectangles', '쉬움'),
  ('260917_01', '260917 온도계 스도쿠 - 하', '쉬움'),
  ('260917_02', '260917 온도계 스도쿠 - 중', '중간'),
  ('260917_03', '260917 온도계 스도쿠 - 상', '어려움'),
  ('260918_01', '260918 온도계 스도쿠 - A', '중간'),
  ('260918_02', '260918 온도계 스도쿠 - B', '어려움'),
  ('260919_01', '260919 사풍(四風) - 1', '쉬움'),
  ('260919_02', '260919 사풍(四風) - 2', '중간'),
  ('260920_01', '260920 스카이스크레이퍼', '중간'),
  ('260921_01', '260921 같은 합 스도쿠', '중간'),
  ('260923_01', '260923 밸런스 루프 1', '중간'),
  ('260923_02', '260923 밸런스 루프 2', '어려움'),
  ('260925_01', '260925 한가위 스도쿠', '쉬움'),
  ('260928_01', '260928 콰트로 스도쿠', '중간'),
  ('260928_02', '260928 산수 스도쿠', '중간'),
  ('260928_03', '260928 란영 스도쿠', '쉬움'),
  ('260929_01', '260929 펜토미너스', '어려움'),
  ('261001_01', '261001 빙판길 1', '쉬움'),
  ('261001_02', '261001 침수된 길 1', '쉬움'),
  ('261001_03', '261001 펜토미너스(침수)', '중간');
DO $$
BEGIN
  PERFORM 1 FROM public.puzzle_catalog
  WHERE season_id='2026-2' AND puzzle_id IN (SELECT puzzle_id FROM confirmed_difficulties)
  FOR UPDATE;
  IF (SELECT count(*) FROM public.puzzle_catalog p JOIN confirmed_difficulties c
      ON p.puzzle_id=c.puzzle_id AND p.title=c.title
      WHERE p.season_id='2026-2' AND (p.difficulty IS NULL OR p.difficulty=c.difficulty)) <> 20 THEN
    RAISE EXCEPTION 'Confirmed difficulty catalog entries missing or changed';
  END IF;
  UPDATE public.puzzle_catalog p SET difficulty=c.difficulty
  FROM confirmed_difficulties c
  WHERE p.season_id='2026-2' AND p.puzzle_id=c.puzzle_id
    AND p.difficulty IS DISTINCT FROM c.difficulty;
END $$;
COMMIT;
