-- ════════════════════════════════════════════════════════════════════
--  09 — Profile spaces (block layouts)
--
--  Adds profiles.space: the owner's block layout, read by faero_space.js.
--  Shape (validated loosely here, strictly on render):
--    { "v": 1,
--      "kind":  "artist" | "listener",
--      "stage": "sky" | "lime" | "peach" | "lilac" | "night",
--      "blocks": [ { "t": <type>, "s": <size>, "y": <style>, "d": {…} }, … ] }
--
--  Who can write it is already settled by 06_base_table_rls.sql: profiles
--  are world-readable and only the owner (or staff) can update their row.
--  This file adds no policy. It only caps the size and shape, so nobody can
--  park megabytes in their profile row for every visitor to download.
--
--  Idempotent. Safe to run twice. Run it in the Supabase SQL editor after
--  the files listed in sql/README.md. Until it runs, the app keeps working:
--  layouts save to the owner's browser and visitors see a default layout.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists space jsonb;

create or replace function public.validate_profile_space()
returns trigger
language plpgsql
as $$
begin
  if new.space is not distinct from old.space or new.space is null then
    return new;
  end if;
  if jsonb_typeof(new.space) <> 'object' then
    raise exception 'Profile layout must be an object.' using errcode = '23514';
  end if;
  if pg_column_size(new.space) > 24000 then
    raise exception 'Profile layout is too big. Remove a few blocks.' using errcode = '23514';
  end if;
  if jsonb_typeof(new.space -> 'blocks') is distinct from 'array'
     or jsonb_array_length(new.space -> 'blocks') > 40 then
    raise exception 'A profile can have up to 40 blocks.' using errcode = '23514';
  end if;
  if coalesce(new.space ->> 'kind', 'listener') not in ('artist', 'listener') then
    raise exception 'Unknown profile kind.' using errcode = '23514';
  end if;
  if coalesce(new.space ->> 'stage', 'sky') not in ('sky', 'lime', 'peach', 'lilac', 'night') then
    raise exception 'Unknown stage colour.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_profile_space on public.profiles;
create trigger trg_validate_profile_space
  before update on public.profiles
  for each row execute function public.validate_profile_space();

-- PostgREST caches the schema; without this the new column 404s for a while.
notify pgrst, 'reload schema';
