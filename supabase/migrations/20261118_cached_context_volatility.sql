BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
-- PostgREST uses function volatility to choose the RPC transaction access mode.
-- These contexts may populate derived caches, so POST must run read-write.
ALTER FUNCTION public.achievement_context() VOLATILE;
ALTER FUNCTION public.cosmetic_context() VOLATILE;
NOTIFY pgrst,'reload schema';
COMMIT;
