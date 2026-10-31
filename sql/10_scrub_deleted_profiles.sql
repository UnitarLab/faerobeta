-- ════════════════════════════════════════════════════════════════════
--  10 — Finish scrubbing deleted accounts
--
--  request_account_deletion() (01) erases name, bio, avatar, banner,
--  location, website and tags, then sets deleted_at. Columns added later
--  were never added to that list, so a deleted person's status line,
--  pronouns, links, profile background, pinned post and profile space
--  (sql/09: notes, links, shows) stayed public.
--
--  Rather than copy both deletion functions here and risk them drifting,
--  this trigger clears those columns at the moment deleted_at is first set,
--  whichever path did it. Any column added to profiles from now on that
--  holds something the person wrote belongs in this list too.
--
--  Idempotent. Run after 09_profile_space.sql.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.scrub_deleted_profile()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.status         := null;
    new.pronouns       := null;
    new.links          := '{}'::jsonb;
    new.profile_bg_url := null;
    new.pinned_post_id := null;
    new.space          := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_scrub_deleted_profile on public.profiles;
create trigger trg_scrub_deleted_profile
  before update on public.profiles
  for each row execute function public.scrub_deleted_profile();

-- Accounts already deleted before this ran.
update public.profiles
   set status = null, pronouns = null, links = '{}'::jsonb,
       profile_bg_url = null, pinned_post_id = null, space = null
 where deleted_at is not null;
