-- ═══════════════════════════════════════════════════════════════════════
--  FAERO — PRE-FLIGHT CHECK
--
--  RUN THIS FIRST. It changes nothing — it only reports whether your
--  database has what beta_launch_migration.sql expects.
--
--  Every row must say OK. If any row says MISSING, fix that before
--  running the migration, or the migration will abort (harmlessly — it's
--  wrapped in a transaction, so a failure rolls everything back).
-- ═══════════════════════════════════════════════════════════════════════

with required (tbl, col) as (
  values
    -- table            column the migration depends on
    ('profiles',      'id'),
    ('profiles',      'username'),
    ('profiles',      'display_name'),
    ('profiles',      'role'),
    ('profiles',      'created_at'),
    ('posts',         'id'),
    ('posts',         'user_id'),
    ('posts',         'body'),
    ('posts',         'like_count'),
    ('posts',         'created_at'),
    ('likes',         'post_id'),
    ('likes',         'user_id'),
    ('follows',       'follower_id'),
    ('follows',       'following_id'),
    ('messages',      'sender_id'),
    ('messages',      'created_at'),
    ('guestbook',     'author_id'),
    ('guestbook',     'profile_id'),
    ('guestbook',     'created_at'),
    ('groups',        'name'),
    ('group_members', 'group_id'),
    ('group_members', 'user_id'),
    ('group_members', 'role'),
    ('bans',          'user_id'),
    ('bans',          'expires_at')
)
select
  r.tbl        as table_name,
  r.col        as column_name,
  case
    when c.column_name is not null then 'OK'
    when t.table_name  is null     then 'MISSING TABLE'
    else                                'MISSING COLUMN'
  end          as status
from required r
left join information_schema.tables t
       on t.table_schema = 'public' and t.table_name = r.tbl
left join information_schema.columns c
       on c.table_schema = 'public' and c.table_name = r.tbl and c.column_name = r.col
order by
  case when c.column_name is null then 0 else 1 end,   -- problems first
  r.tbl, r.col;
