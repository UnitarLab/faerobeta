"""Build sql/13_neudiverge_profiles.sql from the profile designs below.

The designs live here, as data, so the SQL and the local preview
(scripts/neudiverge_profiles.json) always match.

    python scripts/build_neudiverge_sql.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')

ND = 'https://www.neudiverge.com/brands/neudiverge/'
KIT = ND + 'brandkit/files/'
YT = 'https://www.youtube.com/watch?v='
FAERO = 'https://www.faero.net/'
AQUA_LINK = 'https://smartlinks.artistcamp.com/9008798788156/'
# Wril's logo lives on Faero itself: save it as assets/artists/wril-logo.png
WRIL_LOGO = FAERO + 'assets/artists/wril-logo.png'


def blk(t, s, y, **d):
    return {'t': t, 's': s, 'y': y, 'd': d}


PROFILES = {
    # ── the label: a CD on Bliss hill, holographic chrome ─────────────
    'neudiverge': {
        'display_name': 'Neudiverge',
        'bio': 'Independent music label. A collective of artists who are architects of new genres. Home of Opal Aura, Wril and Xermes.',
        'status': 'New music from the collective',
        'website': 'https://www.neudiverge.com',
        'tags': ['label', 'new genres', 'frutiger aero'],
        'avatar_color': '#0d3346',
        'avatar_url': KIT + '08-frutiger-aero/bliss-hill/logo-only/neudiverge-bliss-hill-logo-square-2048.jpg',
        'banner_url': KIT + '06-social/neudiverge-x-twitter-header-1500x500.png',
        'profile_bg_url': None,
        'space': {
            'v': 1, 'kind': 'artist', 'stage': 'bliss',
            'look': {'accent': '#6fe3ff', 'font': 'Orbitron', 'corners': 'round', 'title': 'NEUDIVERGE',
                     'bg': KIT + '08-frutiger-aero/bliss-hill/logo-only/neudiverge-bliss-hill-logo-wide-1920x1080-blur.jpg', 'bgMode': 'fixed'},
            'blocks': [
                blk('custom', 'l', 'holo', title='Architects of new genres', layout='picture-full', effect='holo', font='Orbitron',
                    image=KIT + '08-frutiger-aero/bliss-hill/logo-only/neudiverge-bliss-hill-logo-square-2048.jpg',
                    text='An independent label and a collective. New music, visuals, shows and drops from Opal Aura, Wril and Xermes.',
                    link='https://www.neudiverge.com', linkLabel='Enter neudiverge.com'),
                blk('song', 'm', 'holo', url=YT + 'IF6_XK2sOaE'),
                blk('custom', 's', 'holo', title='Opal Aura', layout='picture-top', image=ND + 'media/aquacrush-cover.jpg',
                    link=FAERO + 'opalaura', linkLabel='Visit', font='Comfortaa'),
                blk('custom', 's', 'camo', title='Wril', layout='logo', image=WRIL_LOGO, bg='#ffffff', link=FAERO + 'wril', linkLabel='Visit', font='Silkscreen'),
                blk('tracks', 'w', 'holo', items=[
                    {'title': 'Opal Aura · Aqua Crush', 'url': YT + 'IF6_XK2sOaE'},
                    {'title': 'Opal Aura · Tastemaker', 'url': YT + '-J-qvsScGJ4'},
                    {'title': 'Opal Aura · Love at First Sight', 'url': YT + '7TLVRjtlprQ'},
                    {'title': 'Wril · Ancient Wave', 'url': YT + 'rldF9oYVUB4'}]),
                blk('custom', 's', 'holo', title='Xermes', layout='big-title', effect='scanlines', font='Major Mono Display',
                    bg='#0a0a0a', ink='#e6dcff', text='Coming soon.', link=FAERO + 'xermes', linkLabel='Visit'),
                blk('links', 'm', 'holo', items=[
                    {'label': 'neudiverge.com', 'url': 'https://www.neudiverge.com'},
                    {'label': 'YouTube', 'url': 'https://www.youtube.com/@neudiverge'},
                    {'label': 'Instagram', 'url': 'https://www.instagram.com/neudiverge/'}]),
                blk('top8', 'm', 'holo'),
                blk('guestbook', 'l', 'aero'),
                blk('posts', 'm', 'holo'),
                blk('stats', 's', 'holo'),
            ]},
    },
    # ── Opal Aura: glass marbles, glitter, a pink plasma heart ─────────
    'opalaura': {
        'display_name': 'Opal Aura',
        'bio': 'Neudiverge artist. Ambient, glassy and bright. New single Aqua Crush is out now everywhere.',
        'status': 'Aqua Crush out now 🫧',
        'website': AQUA_LINK,
        'tags': ['ambient', 'neudiverge', 'aqua crush'],
        'avatar_color': '#6fe3ff',
        'avatar_url': ND + 'media/aquacrush-cover.jpg',
        'banner_url': ND + 'media/aquacrush-mv.jpg',
        'profile_bg_url': None,
        'space': {
            'v': 1, 'kind': 'artist', 'stage': 'aqua',
            'look': {'accent': '#00a6c8', 'font': 'Comfortaa', 'corners': 'round', 'title': 'opal aura'},
            'blocks': [
                blk('custom', 'l', 'opal', title='Aqua Crush', layout='picture-full', effect='glitter', font='Comfortaa',
                    image=ND + 'media/aquacrush-cover.jpg', text='Out now on Spotify, Apple Music, Tidal and YouTube.',
                    link=AQUA_LINK, linkLabel='Listen everywhere'),
                blk('song', 'm', 'opal', url=YT + 'IF6_XK2sOaE'),
                blk('custom', 'm', 'opal', title='Love at First Sight', layout='picture-left', effect='glow', font='Pacifico',
                    image=ND + 'media/yt7TLVRjtlprQ.jpg', bg='#ff3fa4', bg2='#6a1b9a', ink='#ffffff',
                    text='Pink lightning. The video plays right here on my space.', link=YT + '7TLVRjtlprQ', linkLabel='Watch'),
                blk('release', 'm', 'aurora', title='Aqua Crush', date='2026-10-09', url=AQUA_LINK, cover=ND + 'media/aquacrush-cover.jpg'),
                blk('tracks', 'w', 'opal', items=[
                    {'title': 'Aqua Crush', 'url': YT + 'IF6_XK2sOaE'},
                    {'title': 'Tastemaker', 'url': YT + '-J-qvsScGJ4'},
                    {'title': 'Love at First Sight', 'url': YT + '7TLVRjtlprQ'}]),
                blk('custom', 's', 'opal', title='Tastemaker', layout='picture-top', effect='holo', font='Comfortaa',
                    image=ND + 'media/yt-J-qvsScGJ4.jpg', link=YT + '-J-qvsScGJ4', linkLabel='Watch'),
                blk('links', 'm', 'aurora', items=[
                    {'label': 'Spotify', 'url': 'https://open.spotify.com/artist/1YvqzzkOpIO60oBJYqAzYU'},
                    {'label': 'Apple Music', 'url': 'https://music.apple.com/us/album/aqua-crush/6824748134?i=6824748321'},
                    {'label': 'Tidal', 'url': 'https://tidal.com/album/571419589'},
                    {'label': 'YouTube Music', 'url': 'https://music.youtube.com/browse/MPREb_v8EH4W2pzCD'},
                    {'label': 'All platforms', 'url': AQUA_LINK}]),
                blk('about', 'm', 'opal'),
                blk('guestbook', 'l', 'opal'),
                blk('top8', 'm', 'opal'),
                blk('stats', 's', 'aurora'),
            ]},
    },
    # ── Wril: black-and-white pixel camo, like the logo ───────────────
    'wril': {
        'display_name': 'Wril',
        'bio': 'Neudiverge artist. Ancient Wave out now, and Jestermaxxing, a rhythm dance-off you can play on neudiverge.com.',
        'status': 'Ancient Wave out now',
        'website': 'https://www.neudiverge.com/games/jestermaxxing/',
        'tags': ['neudiverge', 'ancient wave', 'jestermaxxing'],
        'avatar_color': '#0a0a0a',
        'avatar_url': WRIL_LOGO,
        'banner_url': ND + 'media/ytrldF9oYVUB4.jpg',
        'profile_bg_url': None,
        'space': {
            'v': 1, 'kind': 'artist', 'stage': 'paper',
            'look': {'accent': '#0a0a0a', 'font': 'Silkscreen', 'corners': 'sharp'},
            'blocks': [
                blk('custom', 'l', 'camo', layout='logo', image=WRIL_LOGO, bg='#ffffff'),
                blk('song', 'm', 'camo', url=YT + 'rldF9oYVUB4'),
                blk('custom', 'w', 'camo', title='ANCIENT WAVE  ✦  JESTERMAXXING  ✦  NEUDIVERGE', effect='marquee', font='Silkscreen',
                    bg='#0a0a0a', ink='#ffffff'),
                blk('custom', 'm', 'camo', title='Jestermaxxing', layout='picture-left', font='Silkscreen',
                    image=ND + 'media/jestermaxxing.jpg',
                    text='An arrow-key rhythm dance-off. Play it free and post your score.',
                    link='https://www.neudiverge.com/games/jestermaxxing/', linkLabel='Play'),
                blk('about', 'm', 'camo'),
                blk('links', 'm', 'camo', items=[
                    {'label': 'Play Jestermaxxing', 'url': 'https://www.neudiverge.com/games/jestermaxxing/'},
                    {'label': 'Ancient Wave video', 'url': YT + 'rldF9oYVUB4'},
                    {'label': 'Neudiverge', 'url': 'https://www.neudiverge.com'}]),
                blk('guestbook', 'l', 'camo'),
                blk('top8', 'm', 'camo'),
                blk('posts', 'm', 'camo'),
                blk('stats', 's', 'camo'),
            ]},
    },
    # ── Xermes: black, monospace, a mystery until the art arrives ─────
    'xermes': {
        'display_name': 'Xermes',
        'bio': 'Neudiverge artist. New music is on the way. Follow to hear it first.',
        'status': 'Something is coming',
        'website': 'https://www.neudiverge.com',
        'tags': ['neudiverge'],
        'avatar_color': '#1b1b1b',
        'avatar_url': None,
        'banner_url': None,
        'profile_bg_url': None,
        'space': {
            'v': 1, 'kind': 'artist', 'stage': 'ink',
            'look': {'accent': '#9b7bff', 'font': 'Major Mono Display', 'corners': 'soft', 'title': 'xermes'},
            'blocks': [
                blk('custom', 'l', 'aurora', title='X', layout='big-title', effect='scanlines', font='Major Mono Display', align='center',
                    bg='#05030d', bg2='#241046', ink='#e6dcff', text='new music is on the way.\nfollow and it lands in your feed the day it drops.'),
                blk('custom', 'm', 'aurora', title='SIGNAL INCOMING', effect='marquee', font='Major Mono Display', bg='#0a0a0a', ink='#5ef2d0'),
                blk('about', 'm', 'aurora'),
                blk('links', 'm', 'aurora', items=[{'label': 'Neudiverge', 'url': 'https://www.neudiverge.com'}]),
                blk('guestbook', 'l', 'aurora'),
                blk('top8', 'm', 'aurora'),
                blk('stats', 's', 'aurora'),
            ]},
    },
}

POSTS = [
    ('opalaura', 'Love at First Sight 💗', YT + '7TLVRjtlprQ', 'Love at First Sight', ['opalaura', 'neudiverge'], '9 days'),
    ('opalaura', 'Tastemaker', YT + '-J-qvsScGJ4', 'Tastemaker', ['opalaura', 'neudiverge'], '6 days'),
    ('wril', 'Ancient Wave. Turn it up.', YT + 'rldF9oYVUB4', 'Ancient Wave', ['wril', 'neudiverge'], '4 days'),
    ('opalaura', 'Aqua Crush is out now on Spotify, Apple Music, Tidal and YouTube 🫧', YT + 'IF6_XK2sOaE', 'Aqua Crush', ['aquacrush', 'opalaura', 'neudiverge'], '2 days'),
]


def q(v):
    """A SQL literal."""
    if v is None:
        return 'null'
    if isinstance(v, list):
        return 'array[' + ', '.join(q(x) for x in v) + ']::text[]'
    return "'" + str(v).replace("'", "''") + "'"


def build():
    out = [open(os.path.join(HERE, '_neudiverge_head.sql'), encoding='utf-8').read()]
    for h, p in PROFILES.items():
        space = json.dumps(p['space'], ensure_ascii=False)
        out.append(f"""
  -- {p['display_name']}
  update public.profiles set
    username = {q(h)}, display_name = {q(p['display_name'])}, bio = {q(p['bio'])}, status = {q(p['status'])},
    website = {q(p['website'])}, tags = {q(p['tags'])}, avatar_color = {q(p['avatar_color'])},
    avatar_url = {q(p['avatar_url'])}, banner_url = {q(p['banner_url'])}, profile_bg_url = {q(p['profile_bg_url'])},
    space = $space${space}$space$::jsonb, updated_at = now()
  where id = (ids->>{q(h)})::uuid;
""")
    rows = ',\n    '.join(f"({q(h)}, {q(b)}, {q(u)}, {q(t)}, {q(tags)}, interval {q(ago)})" for h, b, u, t, tags, ago in POSTS)
    out.append(f"""
  -- the label and its artists follow each other
  insert into public.follows (follower_id, following_id)
  select (ids->>a)::uuid, (ids->>b)::uuid
  from unnest(array['neudiverge','opalaura','wril','xermes']) a, unnest(array['neudiverge','opalaura','wril','xermes']) b
  where a <> b
    and not exists (select 1 from public.follows f where f.follower_id = (ids->>a)::uuid and f.following_id = (ids->>b)::uuid);

  -- their real releases, each posted once
  insert into public.posts (user_id, body, post_type, music_url, music_platform, music_title, tags, like_count, created_at)
  select (ids->>p.h)::uuid, p.body, 'music', p.url, 'yt', p.title, p.tags, 0, now() - p.ago
  from (values
    {rows}
  ) as p(h, body, url, title, tags, ago)
  where not exists (select 1 from public.posts x where x.user_id = (ids->>p.h)::uuid and x.music_url = p.url);

  insert into public.posts (user_id, body, post_type, tags, like_count, created_at)
  select (ids->>'neudiverge')::uuid,
    'Neudiverge is on Faero. Opal Aura, Wril and Xermes are here too: follow them, sign their guestbooks, and catch new music the day it lands.',
    'thread', array['neudiverge'], 0, now() - interval '1 day'
  where not exists (select 1 from public.posts x where x.user_id = (ids->>'neudiverge')::uuid and x.body like 'Neudiverge is on Faero.%');

  raise notice 'Done: faero.net/neudiverge, /opalaura, /wril and /xermes are set up.';
end $$;
""")
    with open(os.path.join(ROOT, 'sql', '13_neudiverge_profiles.sql'), 'w', encoding='utf-8') as f:
        f.write(''.join(out))
    preview = {h: dict(p, username=h, id='00000000-0000-0000-0000-00000000000' + str(i + 1)) for i, (h, p) in enumerate(PROFILES.items())}
    with open(os.path.join(HERE, 'neudiverge_profiles.json'), 'w', encoding='utf-8') as f:
        json.dump(preview, f, ensure_ascii=False, indent=1)
    print('wrote sql/13_neudiverge_profiles.sql and scripts/neudiverge_profiles.json')


if __name__ == '__main__':
    build()
