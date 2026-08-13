// Faero — hard account deletion (GDPR / CCPA erasure)
//
// Deploy:  supabase functions deploy delete-account --no-verify-jwt=false
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// The client calls public.request_account_deletion() first (anonymises and
// tombstones the profile in one transaction), then calls this function to
// remove the auth.users row so the email is freed and the login dies.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'not signed in' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const url     = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identify the caller from their own JWT — never trust a user id in the body.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: whoErr } = await asUser.auth.getUser();
  if (whoErr || !user) {
    return new Response(JSON.stringify({ error: 'invalid session' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(url, service);

  // Scrub content + tombstone the profile (idempotent — the client may have
  // already called this RPC).
  const { error: rpcErr } = await admin.rpc('request_account_deletion_for', { p_uid: user.id })
    .then((r) => r, () => ({ error: null }));       // optional helper; ignore if absent

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    return new Response(JSON.stringify({ error: delErr.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, scrubbed: !rpcErr }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
