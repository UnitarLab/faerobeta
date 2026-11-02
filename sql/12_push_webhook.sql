-- ════════════════════════════════════════════════════════════════════
--  12 — Send a push when a notification is created
--
--  send-push (supabase/functions/send-push) turns a notifications row into a
--  web push. This trigger calls it on every insert, through pg_net, with the
--  shared secret the function checks. The secret is kept in Supabase Vault
--  under 'push_webhook_secret' (scripts/deploy_functions.sh stores it), so it
--  is never written into this file or the repo.
--
--  pg_net is fire-and-forget: a slow or failing push never blocks or rolls
--  back the insert that created the notification.
--
--  Idempotent. Run after the deploy script has stored the Vault secret.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_push()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if secret is null then return new; end if;     -- push not set up: do nothing
  perform net.http_post(
    url     := 'https://fifnkgpxtnmjycxkkqhz.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    body    := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;

revoke execute on function public.notify_push() from public, anon, authenticated;

drop trigger if exists trg_notify_push on public.notifications;
create trigger trg_notify_push
  after insert on public.notifications
  for each row execute function public.notify_push();
