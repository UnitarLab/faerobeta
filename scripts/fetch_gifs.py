"""Bundle a set of old-web GIFs for Studio's sticker picker.

Same source as the gif scraper (D:/Antigravity Kode/gif scraper): GifCities,
the Internet Archive's search over the GeoCities archive. The scraper hits it
live through public CORS proxies; that is fine for a tool, not for the site,
so this runs once and the GIFs ship with Faero under assets/gifs/. Being
same-origin is also what lets Studio paint them onto a canvas and export.

    python scripts/fetch_gifs.py            # fetch what is missing
    python scripts/fetch_gifs.py --fresh    # start over

Writes assets/gifs/<category>/<id>.gif and assets/gifs/manifest.json.
"""
import json, os, re, struct, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'gifs')
PER_CAT = 18
MAX_BYTES = 160_000          # stickers, not wallpapers
MAX_SIDE = 260
MIN_SIDE = 24

# category id -> (label, emoji, search terms)
CATS = {
    'music':    ('Music',     '🎵', ['music notes', 'headphones', 'cd', 'stereo', 'guitar', 'radio']),
    'sparkle':  ('Sparkle',   '✨', ['sparkle', 'glitter', 'twinkle', 'stars']),
    'hearts':   ('Hearts',    '💖', ['heart', 'love', 'hearts']),
    'cute':     ('Cute',      '🐱', ['kitty', 'cat', 'bunny', 'teddy bear', 'puppy']),
    'nature':   ('Nature',    '🌸', ['flower', 'butterfly', 'rainbow', 'sun', 'tree']),
    'water':    ('Water',     '🫧', ['dolphin', 'bubbles', 'fish', 'water', 'wave']),
    'space':    ('Space',     '🪐', ['planet', 'earth', 'moon', 'alien', 'ufo']),
    'faces':    ('Smileys',   '😊', ['smiley', 'smile', 'happy face', 'wink']),
    'tech':     ('Computer',  '💾', ['computer', 'email', 'internet', 'mouse']),
    'words':    ('Words',     '🆕', ['new', 'cool', 'welcome', 'hello', 'wow']),
    'fire':     ('Fire',      '🔥', ['fire', 'flame', 'skull']),
    'deco':     ('Deco',      '🎀', ['bow', 'divider', 'ribbon', 'crown']),
}

UA = {'User-Agent': 'faero-sticker-bundler/1.0 (+https://www.faero.net)'}


def get(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def gif_size(data):
    if data[:6] not in (b'GIF87a', b'GIF89a') or len(data) < 10:
        return None
    return struct.unpack('<HH', data[6:10])


def frames(data):
    # Graphic Control Extension count is a cheap "is it animated" check
    return max(1, data.count(b'\x21\xF9\x04'))


def search(term, n=60):
    q = urllib.parse.urlencode({'q': term, 'offset': 0, 'page_size': n})
    html = get('https://gifcities.org/search?' + q).decode('utf-8', 'replace')
    out = []
    for m in re.finditer(r'<img width="(\d+)" height="(\d+)" src="(https://blob\.gifcities\.org/gifcities/([A-Z0-9]{20,})\.gif)"', html):
        w, h, url, gid = int(m[1]), int(m[2]), m[3], m[4]
        if MIN_SIDE <= w <= MAX_SIDE and MIN_SIDE <= h <= MAX_SIDE:
            out.append((gid, url))
    return out


def main():
    fresh = '--fresh' in sys.argv
    os.makedirs(ROOT, exist_ok=True)
    manifest_path = os.path.join(ROOT, 'manifest.json')
    old = {}
    if not fresh and os.path.exists(manifest_path):
        with open(manifest_path, encoding='utf-8') as f:
            for c in json.load(f)['categories']:
                old[c['id']] = c['gifs']

    seen = set()
    cats_out = []
    for cid, (label, emoji, terms) in CATS.items():
        d = os.path.join(ROOT, cid)
        os.makedirs(d, exist_ok=True)
        gifs = [g for g in old.get(cid, []) if os.path.exists(os.path.join(ROOT, g['f']))]
        seen.update(g['id'] for g in gifs)
        for term in terms:
            if len(gifs) >= PER_CAT:
                break
            try:
                hits = search(term)
            except Exception as e:
                print(f'  ! search {term!r}: {e}')
                continue
            took = 0
            for gid, url in hits:
                if len(gifs) >= PER_CAT or took >= PER_CAT // 2:
                    break
                if gid in seen:
                    continue
                seen.add(gid)
                try:
                    data = get(url)
                except Exception:
                    continue
                size = gif_size(data)
                if not size or len(data) > MAX_BYTES:
                    continue
                if frames(data) < 2:          # stickers here are the animated kind
                    continue
                name = f'{cid}/{gid[:12].lower()}.gif'
                with open(os.path.join(ROOT, name), 'wb') as f:
                    f.write(data)
                gifs.append({'id': gid, 'f': name, 'w': size[0], 'h': size[1], 'q': term})
                took += 1
                time.sleep(0.15)
            print(f'{cid:8} {term:14} -> {len(gifs)}')
        cats_out.append({'id': cid, 'label': label, 'emoji': emoji, 'gifs': gifs})

    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump({'source': 'GifCities (Internet Archive GeoCities collection)',
                   'categories': cats_out}, f, ensure_ascii=False, indent=1)
    total = sum(len(c['gifs']) for c in cats_out)
    print(f'{total} gifs written to {os.path.normpath(ROOT)}')


if __name__ == '__main__':
    main()
