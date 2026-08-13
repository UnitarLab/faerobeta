// Faero — web push sender
//
// Invoked by a database webhook on INSERT into public.notifications, so every
// like / follow / reply / mention / repost that already fires a notification
// row also reaches the user's device.
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
//                        VAPID_SUBJECT=mailto:opalcrushsounds@gmail.com \
//                        PUSH_WEBHOOK_SECRET=<a long random string>
//
// Then: Database → Webhooks → new webhook on public.notifications (INSERT)
//   URL:     https://<ref>.functions.supabase.co/send-push
//   Headers: x-webhook-secret: <the same random string>
//
// --no-verify-jwt is required because the webhook has no user JWT; the shared
// secret below is what actually authenticates the caller. Do not omit it.

import webpush from 'https://esm.sh/web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:opalcrushsounds@gmail.com';
const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET')!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

/** Only these reach a device. Likes are deliberately excluded — a like is not
 *  worth interrupting someone's day for, and it's the fastest route to people
 *  disabling push entirely. */
const PUSHABLE = new Set(['reply', 'mention', 'follow', 'repost']);

function copyFor(type: string, actor: string, body: string | null) {
  switch (type) {
    case 'reply':   return { title: `${actor} replied`,           body: body || 'Tap to read the thread.' };
    case 'mention': return { title: `${actor} mentioned you`,     body: body || 'Tap to see the post.' };
    case 'follow':  return { title: `${actor} followed you`,      body: 'Say hello 🌱' };
    case 'repost':  return { title: `${actor} reposted your post`,body: body || '' };
    default:        return { title: 'Faero', body: body || '' };
  }
}

Deno.serve(async (req) => {
  // Timing-safe-ish comparison; the secret is high-entropy so this is fine.
  const provided = req.headers.get('x-webhook-secret') ?? '';
  if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  let payload: any;
  try { payload = await req.json(); }
  catch { return new Response('bad json', { status: 400 }); }

  const row = payload?.record ?? payload;
  if (!row?.user_id || !row?.type) return new Response('ignored', { status: 200 });
  if (!PUSHABLE.has(row.type))     return new Response('skipped', { status: 200 });

  // Never push to someone who is asleep to this actor, or to themselves.
  if (row.actor_id && row.actor_id === row.user_id) {
    return new Response('self', { status: 200 });
  }

  const [{ data: subs }, { data: actor }] = await Promise.all([
    admin.from('push_subscriptions').select('*').eq('user_id', row.user_id),
    row.actor_id
      ? admin.from('profiles').select('display_name,username').eq('id', row.actor_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  if (!subs?.length) return new Response('no subscriptions', { status: 200 });

  const actorName = actor?.display_name || actor?.username || 'Someone';
  const { title, body } = copyFor(row.type, actorName, row.body);

  const url = row.entity_type === 'post'  ? `faero_v1_launch.html#post/${row.entity_id}`
            : row.entity_type === 'reply' ? `faero_v1_launch.html#post/${row.entity_id}`
            : `faero_v1_launch.html#/feed`;

  const message = JSON.stringify({ title, body, url, type: row.type, tag: `faero-${row.type}` });

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message
      )
    )
  );

  // 404/410 means the browser threw the subscription away — stop trying.
  const dead: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const code = (r.reason as any)?.statusCode;
      if (code === 404 || code === 410) dead.push(subs[i].endpoint);
    }
  });
  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', dead);
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return new Response(JSON.stringify({ sent, pruned: dead.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
