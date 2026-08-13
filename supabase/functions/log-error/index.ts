// Faero — client error collector
//
// Receives the records produced by faeroLogError() in faero_v1_launch.html.
// Without this, a crash in a user's browser is invisible: the errors buffer
// in memory and die with the tab.
//
// Deploy:
//   supabase functions deploy log-error --no-verify-jwt
//
// --no-verify-jwt is required. The client ships these with
// navigator.sendBeacon(), which cannot set an Authorization header, and the
// most valuable reports are precisely the ones from users who never got as
// far as signing in.
//
// That means this endpoint is unauthenticated, so it is treated as hostile
// input: the body is size-capped before parsing, every field is truncated to
// a fixed length, and only the known keys are persisted. Nothing here is ever
// rendered as HTML.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const MAX_BODY_BYTES = 8 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Coerce to a string of at most `max` characters, or null. */
function str(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).slice(0, max);
  return s.length ? s : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }

  // Cap before reading. An unauthenticated endpoint should never let a caller
  // decide how much memory it allocates.
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) {
    return new Response('too large', { status: 413, headers: cors });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return new Response('unreadable', { status: 400, headers: cors });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return new Response('too large', { status: 413, headers: cors });
  }

  let rec: Record<string, unknown>;
  try {
    rec = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400, headers: cors });
  }
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
    return new Response('bad shape', { status: 400, headers: cors });
  }

  // user_id is claimed by the client and therefore untrusted — it is a hint
  // for grouping reports, never an authorisation signal. Anything that isn't
  // a plausible uuid is dropped rather than stored.
  const claimed = str(rec.user, 64);
  const userId = claimed && /^[0-9a-f-]{36}$/i.test(claimed) ? claimed : null;

  const { error } = await admin.from('client_errors').insert({
    kind:       str(rec.kind, 80) ?? 'unknown',
    detail:     str(rec.detail, 2000),
    build:      str(rec.build, 40),
    page:       str(rec.url, 300),
    user_agent: str(rec.ua, 400),
    user_id:    userId,
  });

  if (error) {
    console.error('client_errors insert failed:', error.message);
    // Still 204 — the client cannot do anything useful with a failure here,
    // and sendBeacon ignores the response anyway.
  }

  return new Response(null, { status: 204, headers: cors });
});
