/* ════════════════════════════════════════════════════════════════════
   faero_space.js — profile blocks, Radio, Booth, player dock

   Loaded (defer) after the app's inline scripts, so it uses their globals:
   supabase, FAERO_USER, FAERO_PROFILE, faeroEsc, faeroSafeUrl,
   faeroSafeColor, faeroToast, faeroOpenAuth, resolveAudioEmbed,
   detectMusicPlatform, faeroIsMissingColumn, faeroFriendlyDbError,
   cloudinaryUpload, exTimeAgo.

   The app calls two hooks:
     FaeroSpace.onPage(slug)       from renderPage()
     FaeroSpace.renderProfile(p)   at the end of pfBoot()

   Profiles: a layout of blocks saved in profiles.space (sql/09). Every
   block is { t: type, s: size, y: style, d: owner-entered data }. Owner
   data is untrusted on the way back out: everything is escaped on render,
   links must be http(s), and music links go through resolveAudioEmbed's
   allow-list. Blocks that read live data (posts, follows, guestbook) query
   the same tables the classic profile does, under the same RLS.
═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const esc = s => faeroEsc(s);
  const httpUrl = u => /^https?:\/\//i.test(String(u || '').trim()) ? faeroSafeUrl(String(u).trim()) : '';
  const me = () => (typeof FAERO_USER !== 'undefined' ? FAERO_USER : null);
  const myProfile = () => (typeof FAERO_PROFILE !== 'undefined' ? FAERO_PROFILE : null);
  const toast = (t, a, b) => { if (typeof faeroToast === 'function') faeroToast(t, a, b); };
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const ago = ts => (typeof exTimeAgo === 'function' ? exTimeAgo(ts) : '');
  const clone = o => JSON.parse(JSON.stringify(o));
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  const svg = (d, cls) => `<svg class="fx-svg ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const IC = {
    play:  svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/>', 'fx-fill'),
    pause: svg('<rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/>', 'fx-fill'),
    x:     svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    plus:  svg('<path d="M12 5v14M5 12h14"/>'),
    edit:  svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    full:  svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    stop:  svg('<rect x="6" y="6" width="12" height="12" rx="2"/>', 'fx-fill')
  };
  const ARTS = ['fx-art1', 'fx-art2', 'fx-art3', 'fx-art4', 'fx-art5', 'fx-art6', 'fx-art7', 'fx-art8'];
  const artFor = s => ARTS[[...String(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % ARTS.length];

  /* ═══════════════════════════════════════════════════════════════
     PLAYER DOCK — one audio element for live radio, across pages
  ═══════════════════════════════════════════════════════════════ */
  const P = { audio: null, st: null, playing: false };

  function dock() {
    let d = $('#fx-dock');
    if (d) return d;
    d = document.createElement('div');
    d.id = 'fx-dock'; d.className = 'fx-dock'; d.hidden = true;
    d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Radio player');
    d.innerHTML = `
      <div class="fx-dk-now"><div class="fx-dk-art" id="fx-dk-art"></div>
        <div style="min-width:0"><b id="fx-dk-t"></b><span><span class="fx-eq" aria-hidden="true"><i></i><i></i><i></i></span><span id="fx-dk-s"></span></span></div></div>
      <div class="fx-dk-ctl">
        <button class="fx-play" data-fx-dock="toggle" aria-label="Play">${IC.play}</button>
        <button class="fx-ib" data-fx-dock="stop" aria-label="Stop and close">${IC.x}</button>
      </div>
      <div class="fx-dk-side"><input class="fx-vol" id="fx-vol" type="range" min="0" max="1" step="0.05" value="0.8" aria-label="Volume"></div>`;
    document.body.appendChild(d);
    $('#fx-vol', d).addEventListener('input', e => { if (P.audio) P.audio.volume = +e.target.value; });
    return d;
  }

  function audio() {
    if (P.audio) return P.audio;
    P.audio = new Audio();
    P.audio.preload = 'none';
    P.audio.volume = 0.8;
    P.audio.addEventListener('playing', () => { P.playing = true; paintDock(); });
    P.audio.addEventListener('pause', () => { P.playing = false; paintDock(); });
    P.audio.addEventListener('error', () => {
      if (!P.st) return;
      P.playing = false; paintDock();
      toast('err', 'Station not answering', `${P.st.name} isn't streaming right now. Try another one.`);
    });
    return P.audio;
  }

  function playStation(st) {
    if (!st || !httpUrl(st.url)) return;
    const a = audio();
    if (P.st && P.st.id === st.id) { togglePlay(); return; }
    P.st = st;
    a.src = st.url;
    a.play().catch(() => {});
    // Radio Browser asks clients to report plays; it ranks stations by it.
    if (st.uuid) rb('/url/' + encodeURIComponent(st.uuid)).catch(() => {});
    rememberRecent(st);
    paintDock();
  }
  function togglePlay() {
    if (!P.st) return;
    const a = audio();
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }
  function stopRadio() {
    if (P.audio) { P.audio.pause(); P.audio.removeAttribute('src'); P.audio.load(); }
    P.st = null; P.playing = false; paintDock();
  }
  function paintDock() {
    const d = dock(), st = P.st;
    d.hidden = !st;
    document.body.classList.toggle('fx-docked', !!st);
    document.body.classList.toggle('fx-live', !!st && P.playing);
    if (st) {
      $('#fx-dk-t').textContent = st.name;
      $('#fx-dk-s').textContent = (P.playing ? 'Live' : 'Paused') + (st.country ? ' · ' + st.country : '');
      const art = $('#fx-dk-art');
      art.className = 'fx-dk-art ' + artFor(st.name);
      art.innerHTML = httpUrl(st.fav)
        ? `<img src="${httpUrl(st.fav)}" alt="" onerror="this.remove()">` : esc((st.name || '?')[0]);
      const t = $('[data-fx-dock="toggle"]', d);
      t.innerHTML = P.playing ? IC.pause : IC.play;
      t.setAttribute('aria-label', P.playing ? 'Pause' : 'Play');
    }
    $$('[data-fx-st]').forEach(b => {
      const on = !!st && P.playing && b.dataset.fxSt === st.id;
      if (b.classList.contains('fx-play')) b.innerHTML = on ? IC.pause : IC.play;
      const card = b.closest('.fx-st'); if (card) card.classList.toggle('on', on);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     RADIO — Radio Browser (the same public directory faeroRadio used)
  ═══════════════════════════════════════════════════════════════ */
  const RB = ['de1', 'fr1', 'nl1', 'at1'].map(h => `https://${h}.api.radio-browser.info/json`);
  let rbBase = null;
  async function rb(path) {
    const order = rbBase ? [rbBase, ...RB.filter(m => m !== rbBase)] : RB.slice().sort(() => Math.random() - .5);
    for (const m of order) {
      try {
        const r = await fetch(m + path);
        if (r.ok) { rbBase = m; return await r.json(); }
      } catch (e) { /* next mirror */ }
    }
    throw new Error('Radio directory unreachable');
  }

  const STN = {};   // id → station, so buttons can carry just an id
  // The featured station: the lofi stream the old radio app shipped with. It is
  // a zeno.fm station, not one Faero runs, so it goes by its own name. (The id
  // stays 'faero-fm' so spaces that already pinned it keep working.)
  const FAERO_FM = { id: 'faero-fm', name: 'Lofi Hip Hop', url: 'https://stream.zeno.fm/f37n1cr6308uv', fav: '', country: 'zeno.fm', tags: 'lofi' };
  STN[FAERO_FM.id] = FAERO_FM;

  function normStation(s) {
    const url = s.url_resolved || s.url || '';
    if (!/^https:\/\//i.test(url)) return null;     // http streams are blocked on an https page
    const st = {
      id: 'rb-' + s.stationuuid, uuid: s.stationuuid,
      name: String(s.name || 'Station').trim().slice(0, 80),
      url, fav: /^https:\/\//i.test(s.favicon || '') ? s.favicon : '',
      country: String(s.country || '').slice(0, 40),
      tags: String(s.tags || '').split(',').slice(0, 3).join(' · ')
    };
    STN[st.id] = st;
    return st;
  }

  const GENRES = [['lofi', 'Lofi'], ['dream pop', 'Dream pop'], ['synthwave', 'Synthwave'], ['city pop', 'City pop'], ['chillout', 'Chillout'],
    ['jazz', 'Jazz'], ['drum and bass', 'Drum & bass'], ['indie', 'Indie'], ['hip hop', 'Hip hop'], ['k-pop', 'K-pop'], ['ambient', 'Ambient'], ['house', 'House']];
  const COUNTRIES = [['NL', '🇳🇱', 'Netherlands'], ['GB', '🇬🇧', 'UK'], ['US', '🇺🇸', 'USA'], ['JP', '🇯🇵', 'Japan'], ['KR', '🇰🇷', 'Korea'],
    ['BR', '🇧🇷', 'Brazil'], ['FR', '🇫🇷', 'France'], ['DE', '🇩🇪', 'Germany'], ['NG', '🇳🇬', 'Nigeria'], ['MX', '🇲🇽', 'Mexico']];

  function stationCard(st) {
    const fav = httpUrl(st.fav);
    return `<article class="fx-st">
      <div class="fx-a ${artFor(st.name)}">${fav ? `<img src="${fav}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;fx-ini&quot;>${esc((st.name || '?')[0])}</span>'">` : `<span class="fx-ini">${esc((st.name || '?')[0])}</span>`}
        <button class="fx-play" data-fx-st="${esc(st.id)}" aria-label="Play ${esc(st.name)}">${IC.play}</button></div>
      <div class="fx-t"><b>${esc(st.name)}</b><span>${esc([st.country, st.tags].filter(Boolean).join(' · ') || 'Live radio')}</span></div>
      <button class="fx-btn fx-btn-sm fx-pin" data-fx-pin="${esc(st.id)}">${IC.plus}Put on my space</button>
    </article>`;
  }

  function rememberRecent(st) {
    let r = [];
    try { r = JSON.parse(lsGet('faero-radio-recent') || '[]'); } catch (e) {}
    r = [st, ...r.filter(x => x.id !== st.id)].slice(0, 8);
    lsSet('faero-radio-recent', JSON.stringify(r));
  }
  function recent() {
    try {
      return JSON.parse(lsGet('faero-radio-recent') || '[]')
        .filter(s => s && s.id && /^https:\/\//i.test(s.url || ''))
        .map(s => (STN[s.id] = { id: String(s.id), uuid: s.uuid, name: String(s.name || ''), url: s.url, fav: s.fav || '', country: s.country || '', tags: s.tags || '' }));
    } catch (e) { return []; }
  }

  let radioBuilt = false;
  function ensureRadio() {
    const root = $('#fx-radio');
    if (!root || radioBuilt) { paintDock(); return; }
    radioBuilt = true;
    root.innerHTML = `
      <section class="fx-stage fx-radio-hero">
        <div>
          <span class="fx-onair">LIVE</span>
          <h1>Faero Radio</h1>
          <p>Thousands of live stations from everywhere. It keeps playing while you post and browse.</p>
          <div class="fx-row2">
            <button class="fx-play" data-fx-st="faero-fm" aria-label="Play Lofi Hip Hop">${IC.play}</button>
            <span style="font-size:12px;color:var(--text3)">Featured<br><b style="font-size:16px;font-weight:800;color:var(--text)">Lofi Hip Hop</b></span>
            <button class="fx-btn fx-btn-sm" data-fx-pin="faero-fm">${IC.plus}Put on my space</button>
          </div>
        </div>
        <div class="fx-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      </section>
      <div id="fx-recent"></div>
      <div class="fx-h2"><div><h2>Find a station</h2><p id="fx-rmsg">Pick a sound or a country.</p></div>
        <form class="fx-search fx-r" id="fx-rsearch"><input type="search" placeholder="Search stations by name" aria-label="Search stations" maxlength="60"><button class="fx-btn fx-btn-pri fx-btn-sm">Search</button></form></div>
      <div class="fx-chips" role="group" aria-label="Genres">${GENRES.map(([t, n]) => `<button class="fx-chip" data-fx-tag="${esc(t)}">${n}</button>`).join('')}</div>
      <div class="fx-chips" role="group" aria-label="Countries" style="margin-top:8px">${COUNTRIES.map(([c, f, n]) => `<button class="fx-chip" data-fx-cc="${c}">${f} ${n}</button>`).join('')}</div>
      <div class="fx-stations" id="fx-stations" style="margin-top:18px"></div>`;
    paintRecent();
    $('#fx-rsearch').addEventListener('submit', e => {
      e.preventDefault();
      const q = $('input', e.target).value.trim();
      if (q) loadStations('name=' + encodeURIComponent(q), `“${q}”`, null);
    });
    loadStations('tag=' + encodeURIComponent('lofi'), 'Lofi', $('[data-fx-tag="lofi"]'));
  }
  function paintRecent() {
    const r = recent(), el = $('#fx-recent');
    if (!el) return;
    el.innerHTML = r.length ? `<div class="fx-h2"><div><h2>Recently played</h2></div></div><div class="fx-stations">${r.slice(0, 4).map(stationCard).join('')}</div>` : '';
    paintDock();
  }
  let loadSeq = 0;
  async function loadStations(query, label, chip) {
    const seq = ++loadSeq, box = $('#fx-stations'), msg = $('#fx-rmsg');
    $$('.fx-chips .fx-chip').forEach(c => c.classList.toggle('on', c === chip));
    msg.textContent = `Loading ${label}…`;
    box.innerHTML = '';
    try {
      const data = await rb(`/stations/search?${query}&hidebroken=true&is_https=true&order=clickcount&reverse=true&limit=36`);
      if (seq !== loadSeq) return;
      const list = (data || []).map(normStation).filter(Boolean);
      msg.textContent = list.length ? `${label}: ${list.length} stations` : `Nothing found for ${label}.`;
      box.innerHTML = list.length ? list.map(stationCard).join('') : `<div class="fx-empty" style="grid-column:1/-1">Try another sound or country.</div>`;
      paintDock();
    } catch (e) {
      if (seq !== loadSeq) return;
      msg.textContent = 'The radio directory is not answering.';
      box.innerHTML = `<div class="fx-empty" style="grid-column:1/-1">Couldn't reach the station list. The featured station still works, and you can try again in a moment.</div>`;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     BOOTH
  ═══════════════════════════════════════════════════════════════ */
  function ensureBooth() {
    const root = $('#fx-booth');
    if (!root || root.dataset.built) return;
    root.dataset.built = '1';
    root.innerHTML = `<div class="fx-booth">
      <section class="fx-card"><h3>Booth</h3>
        <p style="margin:0;padding:10px 15px 12px;font-size:13px;color:var(--text2)">A disposable camera in your browser. Nothing leaves your device unless you download it or post it.</p>
      </section>
      <div class="fx-booth-frame"><iframe src="apps/photobooth.html" title="Booth camera" allow="camera; fullscreen"></iframe></div></div>`;
  }

  /* Booth talks to the page with postMessage. Only its own frame, on this
     origin, is listened to; a photo arrives as a JPEG/PNG Blob. */
  window.addEventListener('message', ev => {
    const frame = $('#fx-booth iframe');
    if (!frame || ev.source !== frame.contentWindow || ev.origin !== location.origin || !ev.data) return;
    const m = ev.data;
    if (m.type === 'TOAST' && typeof m.text === 'string') { toast('info', m.text.slice(0, 80)); return; }
    if (m.type !== 'FAERO_BOOTH_POST') return;
    if (!me()) { faeroOpenAuth(); return; }
    const blob = m.blob;
    if (!(blob instanceof Blob) || !/^image\/(jpeg|png)$/.test(blob.type) || blob.size > 10e6) { toast('err', 'Could not use that photo', 'Try taking it again.'); return; }
    const file = new File([blob], `booth-${Date.now()}.${blob.type === 'image/png' ? 'png' : 'jpg'}`, { type: blob.type });
    navigate('feed');
    if (typeof composePickPhoto === 'function') composePickPhoto({ files: [file] });
    const ta = $('.compose-ta');
    if (ta) { if (!ta.value) ta.value = str(m.text, 200) || 'Shot in the Faero booth 📸'; ta.dispatchEvent(new Event('input')); ta.focus(); ta.scrollIntoView({ block: 'center' }); }
    toast('ok', 'Photo added to your post', 'Add a caption and press Post.');
  });
  // Leaving the Booth page switches the camera off; coming back turns it on again.
  let boothShown = false;
  function boothVisible(on) {
    if (on === boothShown) return;
    boothShown = on;
    const f = $('#fx-booth iframe');
    if (f && f.contentWindow) f.contentWindow.postMessage({ type: on ? 'FAERO_BOOTH_SHOW' : 'FAERO_BOOTH_HIDE' }, location.origin);
  }

  /* ═══════════════════════════════════════════════════════════════
     PROFILE SPACE — the block system
  ═══════════════════════════════════════════════════════════════ */
  const TYPES = {
    song:      { n: 'Profile song', e: '🎵', d: 'Your song, front and centre', sz: ['l', 'm', 't', 'w', 's'], a: 1 },
    tracks:    { n: 'Music', e: '💿', d: 'Your music posts plus tracks you add', sz: ['w', 'l', 't', 'm'], a: 1 },
    release:   { n: 'New release', e: '🆕', d: 'Cover, release date, pre-save link', sz: ['m', 'l', 't', 's'], a: 1 },
    shows:     { n: 'Shows', e: '🎟️', d: 'Gigs you play or go to', sz: ['m', 't', 'l', 'w'], a: 1 },
    links:     { n: 'Links', e: '🔗', d: 'Merch, Bandcamp, booking, newsletter', sz: ['m', 'w', 's', 't'], a: 1 },
    countdown: { n: 'Countdown', e: '⏳', d: 'To a drop, a show, anything', sz: ['s', 'm', 'w'] },
    now:       { n: 'Right now', e: '💭', d: 'Status, mood, listening to', sz: ['m', 'l', 's'] },
    about:     { n: 'About', e: '👋', d: 'Bio, location and tags', sz: ['m', 't', 'l', 's'] },
    top8:      { n: 'Top 8', e: '⭐', d: 'People you follow', sz: ['l', 'm', 'w', 's'] },
    guestbook: { n: 'Guestbook', e: '✍️', d: 'Visitors leave you notes', sz: ['l', 't', 'm'] },
    posts:     { n: 'Latest posts', e: '📝', d: 'Your newest posts', sz: ['m', 't', 'l', 'w'] },
    photos:    { n: 'Photos', e: '📸', d: 'Pictures from your posts', sz: ['m', 'l', 's', 't'] },
    stats:     { n: 'Stats', e: '📊', d: 'Followers, following, posts, views', sz: ['s', 'm', 'w'] },
    groups:    { n: 'Groups', e: '🫂', d: 'Groups you are in', sz: ['m', 's', 't'] },
    note:      { n: 'Note', e: '🗒️', d: 'Write anything', sz: ['m', 't', 'l', 's', 'w'] },
    station:   { n: 'My station', e: '📻', d: 'A station visitors can tune into', sz: ['m', 's', 'l'] }
  };
  const STYLES = ['glass', 'paper', 'aero', 'night', 'classic', 'mono'];
  const OLD_STYLE = { sticker: 'glass', clean: 'paper', pixel: 'mono' };   // first-draft names
  const STYLE_N = { glass: 'Glass', paper: 'Paper', aero: 'Aero', night: 'Night', classic: 'Classic', mono: 'Notebook' };
  const SIZE_N = { s: 'Small', m: 'Wide', t: 'Tall', l: 'Big', w: 'Banner' };
  const STAGES = { sky: '#BBDEFB', lime: '#C8E6C9', peach: '#FFE0B2', lilac: '#E1BEE7', night: '#123A63' };
  const STAGE_N = { sky: 'Sky', lime: 'Mint', peach: 'Peach', lilac: 'Lilac', night: 'Night' };
  const DEFAULTS = {
    artist: [['song', 'l', 'glass'], ['about', 'm', 'paper'], ['release', 'm', 'night'], ['tracks', 'w', 'glass'], ['shows', 'm', 'glass'],
      ['top8', 'm', 'classic'], ['guestbook', 'l', 'aero'], ['links', 'm', 'paper'], ['posts', 'm', 'glass'], ['stats', 's', 'mono'], ['countdown', 's', 'glass']],
    listener: [['now', 'l', 'aero'], ['song', 'm', 'mono'], ['top8', 'l', 'glass'], ['about', 'm', 'paper'], ['guestbook', 'm', 'glass'],
      ['posts', 'm', 'paper'], ['photos', 'm', 'aero'], ['shows', 'm', 'mono'], ['station', 'm', 'night'], ['stats', 's', 'glass'], ['groups', 's', 'classic']]
  };
  // What the owner can type into each block. [key, label, kind, max/placeholder]
  const FIELDS = {
    song:      { f: [['url', 'Song link', 'music']], note: 'A SoundCloud, Mixcloud, YouTube or Bandcamp link. Leave it empty to use your newest music post.' },
    tracks:    { rows: 8, cols: [['title', 'Title', 'text', 60], ['url', 'Link', 'music']], note: 'Music you post shows here by itself. Add extra tracks, like older releases, below.' },
    release:   { f: [['title', 'Release title', 'text', 60], ['date', 'Out on', 'date'], ['url', 'Pre-save or listen link', 'url'], ['cover', 'Cover image', 'image']] },
    shows:     { rows: 10, cols: [['date', 'Date', 'date'], ['venue', 'Venue', 'text', 60], ['city', 'City', 'text', 40], ['url', 'Tickets link', 'url']] },
    links:     { rows: 8, cols: [['label', 'Label', 'text', 30], ['url', 'Link', 'url']] },
    countdown: { f: [['label', 'Counting down to', 'text', 50], ['date', 'Date and time', 'datetime-local']] },
    now:       { f: [['mood', 'Mood', 'text', 40], ['listening', 'Listening to', 'text', 60]], note: 'Your status line comes from Edit profile.' },
    note:      { f: [['title', 'Title', 'text', 40], ['text', 'Text', 'textarea', 600]] },
    station:   { f: [], note: 'Open Radio, find a station and press “Put on my space”.' }
  };
  const SPACE_KEY = uid => 'faero-space-' + uid;

  /* ── sanitising: owner data is stored as typed, checked again here ── */
  const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max || 200);
  const okUrl = v => { const s = str(v, 300); return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : ''; };
  // A music link must actually be hosted by one of the players we embed —
  // checked on the hostname, not anywhere in the text.
  const MUSIC_HOSTS = /(^|\.)(soundcloud\.com|mixcloud\.com|youtube\.com|youtu\.be|bandcamp\.com)$/i;
  const okMusic = v => {
    const s = okUrl(v);
    try { return s && MUSIC_HOSTS.test(new URL(s).hostname) ? s : ''; } catch (e) { return ''; }
  };
  const okDate = v => { const s = str(v, 20); return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s) ? s : ''; };
  function cleanField(kind, v, max) {
    if (kind === 'url' || kind === 'image') return okUrl(v);
    if (kind === 'music') return okMusic(v);
    if (kind === 'date' || kind === 'datetime-local') return okDate(v);
    return str(v, max || 200);
  }
  function cleanData(t, d) {
    d = d && typeof d === 'object' ? d : {};
    const spec = FIELDS[t], out = {};
    if (spec && spec.f) for (const [k, , kind, max] of spec.f) { const v = cleanField(kind, d[k], max); if (v) out[k] = v; }
    if (spec && spec.rows && Array.isArray(d.items)) {
      out.items = d.items.slice(0, spec.rows).map(row => {
        const r = {};
        for (const [k, , kind, max] of spec.cols) { const v = cleanField(kind, row && row[k], max); if (v) r[k] = v; }
        return r;
      }).filter(r => r.url || r.title || r.venue || r.label);
    }
    if (t === 'station' && d.url && okUrl(d.url).startsWith('https://')) {
      out.id = str(d.id, 60); out.uuid = str(d.uuid, 60); out.name = str(d.name, 80); out.url = okUrl(d.url);
      out.fav = okUrl(d.fav).startsWith('https://') ? okUrl(d.fav) : ''; out.country = str(d.country, 40);
    }
    return out;
  }
  function normSpace(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.blocks)) return null;
    return {
      v: 1,
      kind: s.kind === 'artist' ? 'artist' : 'listener',
      stage: STAGES[s.stage] ? s.stage : 'sky',
      blocks: s.blocks.slice(0, 40).filter(b => b && TYPES[b.t]).map(b => ({
        t: b.t,
        s: TYPES[b.t].sz.includes(b.s) ? b.s : TYPES[b.t].sz[0],
        y: STYLES.includes(b.y) ? b.y : (OLD_STYLE[b.y] || 'glass'),
        d: cleanData(b.t, b.d)
      }))
    };
  }
  const defaultSpace = kind => ({ v: 1, kind, stage: kind === 'artist' ? 'sky' : 'lilac', blocks: DEFAULTS[kind].map(([t, s, y]) => ({ t, s, y, d: {} })) });

  /* ── state ── */
  const S = { p: null, space: null, saved: null, own: false, editing: false, token: 0, cache: {}, dbMissing: false };

  async function renderProfile(p) {
    const page = $('#page-profile');
    if (!page || !p || !p.id) return;
    hideGuestProfile();
    const token = ++S.token;
    S.p = p; S.own = !!me() && me().id === p.id; S.editing = false; S.cache = {};
    let space = normSpace(p.space);
    if (!space && S.own) { try { space = normSpace(JSON.parse(lsGet(SPACE_KEY(p.id)) || 'null')); } catch (e) {} }
    if (!space) {
      // No layout yet: artists (anyone who has posted music) get the artist set.
      let kind = 'listener';
      try {
        const { count } = await supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', p.id).not('music_url', 'is', null);
        if (count > 0) kind = 'artist';
      } catch (e) {}
      if (token !== S.token) return;
      space = defaultSpace(kind);
    }
    S.space = space; S.saved = clone(space);
    draw();
  }
  function clear() {
    S.token++; S.p = null;
    $('#fx-space')?.remove();
    $('#page-profile')?.classList.remove('fx-spaced');
    if (guest) showGuestProfile();
  }

  /* ── signed out ──────────────────────────────────────────────
     body.fx-guest hides everything that only means something once you
     have an account (your profile card, the post box, your groups), so a
     visitor sees a finished site instead of empty boxes and dashes. The
     Profile tab gets an invitation in place of a blank profile. Visiting
     someone else's profile (#profile/<name>) still works signed out. */
  let guest = false;
  function setGuest(on) {
    guest = on;
    document.body.classList.toggle('fx-guest', on);
    if (on && $('#page-profile.active') && !/^#profile\//.test(location.hash)) showGuestProfile();
    if (!on) hideGuestProfile();
  }
  function showGuestProfile() {
    const page = $('#page-profile');
    if (!page || $('#fx-guest-profile')) return;
    page.classList.add('fx-guestpage');
    const el = document.createElement('section');
    el.id = 'fx-guest-profile'; el.className = 'fx-card fx-guest-profile';
    el.innerHTML = `<h3>Your space</h3>
      <div class="fx-gp-body">
        <div class="fx-gp-art" aria-hidden="true">${IC.play}</div>
        <div><b>This is where your Faero space lives.</b>
        <p>Your profile song, your Top 8, your music, a guestbook people sign. Build it from blocks once you're in.</p>
        <div class="fx-gp-cta"><button class="fx-btn fx-btn-pri" onclick="faeroOpenAuth()">Join Faero</button>
        <button class="fx-btn" onclick="faeroOpenAuth()">Sign in</button></div></div>
      </div>`;
    page.prepend(el);
  }
  function hideGuestProfile() {
    $('#fx-guest-profile')?.remove();
    $('#page-profile')?.classList.remove('fx-guestpage');
  }
  if (typeof supabase !== 'undefined' && supabase && supabase.auth) {
    supabase.auth.getSession().then(({ data }) => setGuest(!(data && data.session))).catch(() => {});
    supabase.auth.onAuthStateChange((_e, session) => setGuest(!session));
  }

  function root() {
    const page = $('#page-profile');
    let r = $('#fx-space');
    if (!r) {
      r = document.createElement('section');
      r.id = 'fx-space'; r.className = 'fx-space'; r.setAttribute('aria-label', 'Profile space');
      const banner = $('.pf-banner-section', page);
      if (banner) banner.after(r); else page.prepend(r);
      wireSpace(r);
    }
    page.classList.add('fx-spaced');
    return r;
  }

  function draw() {
    if (!S.p) return;
    const r = root(), sp = S.space, p = S.p, ed = S.editing;
    r.dataset.stage = sp.stage;
    r.classList.toggle('fx-editing', ed);
    const handle = p.username ? '@' + p.username : (p.display_name || 'this person');
    r.innerHTML = `
      <div class="fx-sbar">
        <span class="fx-kind">${sp.kind === 'artist' ? '✔ ARTIST' : '♥ LISTENER'}</span>
        <span class="fx-hint">${S.own ? (ed ? '' : 'Your space. This is what visitors see.') : `${esc(handle)}'s space`}</span>
        ${S.own && !ed ? `<span class="fx-r"><button class="fx-btn fx-btn-pri fx-btn-sm" data-fx-do="edit">${IC.edit}Edit my space</button></span>` : ''}
        ${!S.own ? `<span class="fx-r"><button class="fx-btn fx-btn-sm" data-fx-report title="Report something in this space">Report</button></span>` : ''}
      </div>
      ${ed ? `<div class="fx-editbar">
        <p><b>Building your space.</b> Drag blocks to move them, or use ◀ ▶. Tap 🎨 for a style, ⤢ for a size, ✎ to fill it in.</p>
        <div class="fx-seg" role="group" aria-label="Profile kind">
          <button data-fx-kind="artist" class="${sp.kind === 'artist' ? 'on' : ''}">I make music</button>
          <button data-fx-kind="listener" class="${sp.kind === 'listener' ? 'on' : ''}">I listen</button></div>
        <div class="fx-sws" role="group" aria-label="Stage colour">${Object.entries(STAGES).map(([k, c]) =>
          `<button class="fx-sw ${sp.stage === k ? 'on' : ''}" data-fx-stage="${k}" style="background:${c}" aria-label="${STAGE_N[k]}" title="${STAGE_N[k]}"></button>`).join('')}</div>
        <button class="fx-btn fx-btn-sm" data-fx-do="add">${IC.plus}Add block</button>
        <button class="fx-btn fx-btn-sm" data-fx-do="reset">Start over</button>
        <button class="fx-btn fx-btn-sm" data-fx-do="cancel">Cancel</button>
        <button class="fx-btn fx-btn-pri fx-btn-sm" data-fx-do="save">Save</button>
      </div>` : ''}
      <div class="fx-grid">${sp.blocks.map(blockHTML).join('')}${ed ? `<button class="fx-addtile" data-fx-do="add">${IC.plus}<span>Add a block</span></button>` : ''}</div>`;
    hydrate(r);
    tickCountdowns();
  }

  function blockHTML(b, i) {
    const ed = S.editing;
    const tools = ed ? `<div class="fx-tools">
      <button class="fx-bt" data-fx-bt="left" aria-label="Move earlier">◀</button><button class="fx-bt" data-fx-bt="right" aria-label="Move later">▶</button>
      <button class="fx-bt" data-fx-bt="style" title="Style">🎨 ${STYLE_N[b.y]}</button>
      <button class="fx-bt" data-fx-bt="size" title="Size">⤢ ${SIZE_N[b.s]}</button>
      ${FIELDS[b.t] && (FIELDS[b.t].f || []).length + (FIELDS[b.t].rows ? 1 : 0) ? `<button class="fx-bt" data-fx-bt="fill" aria-label="Fill in">✎</button>` : ''}
      <button class="fx-bt fx-del" data-fx-bt="del" aria-label="Remove block">✕</button></div>` : '';
    return `<article class="fx-blk fx-${b.s}" data-y="${b.y}" data-i="${i}" ${ed ? 'draggable="true"' : ''} aria-label="${esc(TYPES[b.t].n)}">
      <div class="fx-bin">${body(b, i)}</div>${tools}</article>`;
  }

  const head = (b, extra) => `<div class="fx-bh"><span class="fx-dot" aria-hidden="true"></span>${esc(b.d.title && b.t === 'note' ? b.d.title : TYPES[b.t].n)}${extra ? `<span class="fx-r">${extra}</span>` : ''}</div>`;
  // Owner sees an invitation to fill an empty block; visitors never see it.
  const blank = (b, i, msg) => S.own ? `<div class="fx-blank">${esc(msg)}</div>` : '<!--fx-empty-->';

  function body(b, i) {
    const p = S.p, d = b.d;
    switch (b.t) {
      case 'song': case 'tracks': case 'posts': case 'photos': case 'top8': case 'guestbook': case 'groups':
        return head(b) + `<div class="fx-load" data-fx-load="${b.t}" data-i="${i}" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:8px"></div>`;
      case 'about': {
        const meta = [p.location, p.website ? p.website.replace(/^https?:\/\//, '') : ''].filter(Boolean);
        if (!p.bio && !(p.tags || []).length && !meta.length) return head(b) + blank(b, i, 'Add a bio in Edit profile.');
        return head(b) + `<p class="fx-ab">${esc(p.bio || '')}</p>
          ${meta.length ? `<div class="fx-mut">${meta.map(esc).join(' · ')}</div>` : ''}
          <div class="fx-tags">${(Array.isArray(p.tags) ? p.tags : []).slice(0, 6).map(t => `<span>${esc(t)}</span>`).join('')}</div>`;
      }
      case 'now': {
        const rows = [['Status', p.status], ['Mood', d.mood], ['Listening', d.listening]].filter(r => r[1]);
        if (!rows.length) return head(b) + blank(b, i, 'Tap ✎ to add a mood and what you\'re listening to.');
        const [first, ...rest] = rows;
        return head(b) + `<div class="fx-rows"><div class="fx-rw"><div class="fx-mv"></div><div style="min-width:0"><b>${esc(first[1])}</b><div class="fx-mut">${first[0]}</div></div></div>
          ${rest.map(([k, v]) => `<div class="fx-rw"><span class="fx-k">${k}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
      }
      case 'stats':
        return head(b) + `<div class="fx-stats">${[['followers', p.follower_count], ['following', p.following_count], ['posts', p.post_count], ['views', p.profile_views]]
          .map(([l, v]) => `<div><b>${(+v || 0).toLocaleString()}</b>${l}</div>`).join('')}</div>`;
      case 'release': {
        if (!d.title) return head(b) + blank(b, i, 'Tap ✎ to add your next release.');
        const when = d.date ? new Date(d.date + 'T00:00') : null;
        const out = when && when > new Date() ? 'Out ' + when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : (when ? 'Out now' : '');
        return head(b, out ? esc(out) : '') + `<div class="fx-rel">
          <div class="fx-cover ${artFor(d.title)}">${httpUrl(d.cover) ? `<img src="${httpUrl(d.cover)}" alt="" loading="lazy">` : ''}</div>
          <div style="min-width:0;display:flex;flex-direction:column;gap:8px"><div class="fx-ttl">${esc(d.title)}</div>
          ${httpUrl(d.url) ? `<a class="fx-btn fx-btn-pri fx-btn-sm" style="align-self:flex-start" href="${httpUrl(d.url)}" target="_blank" rel="noopener nofollow">${when && when > new Date() ? 'Pre-save' : 'Listen'} ↗</a>` : ''}</div></div>`;
      }
      case 'shows': {
        const today = new Date().toISOString().slice(0, 10);
        const up = (d.items || []).filter(s => !s.date || s.date >= today).sort((a, b2) => String(a.date).localeCompare(String(b2.date)));
        if (!up.length) return head(b) + blank(b, i, 'Tap ✎ to add your shows.');
        return head(b, up.length > 3 ? up.length + ' dates' : '') + `<ul class="fx-lst">${up.map(s => {
          const dt = s.date ? new Date(s.date + 'T00:00') : null;
          return `<li class="fx-li"><div class="fx-date"><small>${dt ? dt.toLocaleDateString('en', { month: 'short' }).toUpperCase() : 'TBA'}</small><b>${dt ? String(dt.getDate()).padStart(2, '0') : '–'}</b></div>
            <div class="fx-w"><b>${esc(s.venue || 'Venue TBA')}</b><span>${esc(s.city || '')}</span></div>
            ${httpUrl(s.url) ? `<a class="fx-btn fx-btn-pri fx-btn-sm" href="${httpUrl(s.url)}" target="_blank" rel="noopener nofollow">Tickets</a>` : ''}</li>`;
        }).join('')}</ul>`;
      }
      case 'links': {
        const items = (d.items || []).filter(l => httpUrl(l.url));
        if (!items.length) return head(b) + blank(b, i, 'Tap ✎ to add links: merch, Bandcamp, booking…');
        return head(b) + `<div class="fx-lk">${items.map(l => `<a href="${httpUrl(l.url)}" target="_blank" rel="noopener nofollow">${esc(l.label || l.url.replace(/^https?:\/\//, '').split('/')[0])} ↗</a>`).join('')}</div>`;
      }
      case 'countdown':
        if (!d.date) return head(b) + blank(b, i, 'Tap ✎ to count down to something.');
        return head(b) + `<div class="fx-cd"><div class="fx-big" data-fx-cd="${esc(d.date)}">–</div><div class="fx-mut">until ${esc(d.label || 'the big day')}</div></div>`;
      case 'note':
        if (!d.text) return head(b) + blank(b, i, 'Tap ✎ to write something.');
        return head(b) + `<p class="fx-txt">${esc(d.text)}</p>`;
      case 'station': {
        if (!d.url) return head(b) + blank(b, i, 'Open Radio and press “Put on my space” on a station.');
        STN[d.id || 'sp-' + S.p.id] = { id: d.id || 'sp-' + S.p.id, uuid: d.uuid, name: d.name, url: d.url, fav: d.fav, country: d.country };
        const id = d.id || 'sp-' + S.p.id;
        return head(b, '<span class="fx-onair">LIVE</span>') + `<div class="fx-stn">
          <div class="fx-cover ${artFor(d.name)}">${httpUrl(d.fav) ? `<img src="${httpUrl(d.fav)}" alt="" loading="lazy" style="object-fit:contain;background:#fff">` : esc((d.name || '?')[0])}</div>
          <div style="min-width:0"><div class="fx-ttl">${esc(d.name)}</div><div class="fx-mut">${esc(d.country || 'Live radio')}</div>
          <button class="fx-btn fx-btn-pri fx-btn-sm" style="margin-top:8px" data-fx-st="${esc(id)}">${IC.play}Tune in</button></div></div>`;
      }
    }
    return '';
  }

  /* ── live data ── */
  function cached(key, fn) {
    const k = S.p.id + ':' + key;
    if (!S.cache[k]) S.cache[k] = fn().catch(e => { console.warn('space', key, e); return []; });
    return S.cache[k];
  }
  const q = {
    music: () => cached('music', async () => (await supabase.from('posts').select('id,music_url,music_platform,music_title,created_at')
      .eq('user_id', S.p.id).not('music_url', 'is', null).order('created_at', { ascending: false }).limit(12)).data || []),
    posts: () => cached('posts', async () => (await supabase.from('posts').select('id,body,image_url,music_title,created_at')
      .eq('user_id', S.p.id).order('created_at', { ascending: false }).limit(8)).data || []),
    photos: () => cached('photos', async () => (await supabase.from('posts').select('id,image_url,created_at')
      .eq('user_id', S.p.id).not('image_url', 'is', null).order('created_at', { ascending: false }).limit(3)).data || []),
    top8: () => cached('top8', async () => ((await supabase.from('follows')
      .select('following:following_id(id, display_name, username, avatar_url, avatar_color)').eq('follower_id', S.p.id).limit(8)).data || [])
      .map(r => r.following).filter(Boolean)),
    guestbook: () => cached('guestbook', async () => (await supabase.from('guestbook')
      .select('id, body, created_at, author:author_id(id, display_name, username, avatar_url, avatar_color)')
      .eq('profile_id', S.p.id).order('created_at', { ascending: false }).limit(6)).data || []),
    groups: () => cached('groups', async () => ((await supabase.from('group_members')
      .select('group:group_id(id, name)').eq('user_id', S.p.id).limit(8)).data || []).map(r => r.group).filter(Boolean))
  };

  const avatar = (u, cls) => {
    const name = u.display_name || u.username || '?';
    const color = faeroSafeColor(u.avatar_color);
    return `<span class="${cls}" style="background:linear-gradient(135deg,${color},${color}88)">${httpUrl(u.avatar_url)
      ? `<img src="${httpUrl(u.avatar_url)}" alt="" loading="lazy" onerror="this.remove()">` : esc(name[0].toUpperCase())}</span>`;
  };
  const profHref = u => '#profile/' + encodeURIComponent(u.username || u.id);
  const embedOf = url => { try { return (typeof resolveAudioEmbed === 'function' && resolveAudioEmbed(url)) || ''; } catch (e) { return ''; } };
  const trackTitle = m => m.music_title || ({ sc: 'SoundCloud', mc: 'Mixcloud', bc: 'Bandcamp', yt: 'YouTube' }[m.music_platform] || 'Track') + ' · ' + ago(m.created_at);

  const LOADERS = {
    async song(b) {
      let url = b.d.url, title = '';
      if (!url) { const m = (await q.music())[0]; if (m) { url = m.music_url; title = m.music_title || ''; } }
      if (!url) return '';
      const em = embedOf(url);
      if (!em) return '';
      if (b.s === 's') return `<div class="fx-ttl" style="font-size:14px">${esc(title || 'Profile song')}</div>
        <button class="fx-btn fx-btn-pri fx-btn-sm" style="margin-top:auto;align-self:flex-start" data-fx-listen="${esc(url)}">${IC.play}Listen</button>`;
      return `<div class="fx-embed">${em}</div>`;
    },
    async tracks(b) {
      const own = (b.d.items || []).filter(t => okMusic(t.url)).map(t => ({ title: t.title || 'Track', url: t.url, sub: 'Added by hand' }));
      const posted = (await q.music()).map(m => ({ title: trackTitle(m), url: m.music_url, sub: m.music_title ? ago(m.created_at) : '' }));
      const all = [...own, ...posted.filter(m => !own.some(o => o.url === m.url))].slice(0, 12);
      if (!all.length) return '';
      return `<ol class="fx-lst">${all.map((t, n) => `<li class="fx-li"><span class="fx-n">${n + 1}</span>
        <div class="fx-w"><b>${esc(t.title)}</b>${t.sub ? `<span>${esc(t.sub)}</span>` : ''}</div>
        <button class="fx-pb" data-fx-listen="${esc(t.url)}" aria-label="Play ${esc(t.title)}">${IC.play}</button></li>`).join('')}</ol>`;
    },
    async posts() {
      const posts = (await q.posts()).filter(x => x.body || x.music_title);
      if (!posts.length) return '';
      return `<ol class="fx-lst">${posts.map(x => `<li class="fx-li"><div class="fx-w"><a href="#post/${encodeURIComponent(x.id)}">
        <b>${esc(String(x.body || x.music_title).slice(0, 120))}</b><span>${esc(ago(x.created_at))}</span></a></div></li>`).join('')}</ol>`;
    },
    async photos() {
      const ph = (await q.photos()).filter(x => httpUrl(x.image_url));
      if (!ph.length) return '';
      return `<div class="fx-mos ${ph.length === 1 ? 'n1' : ''}">${ph.map(x => `<a href="#post/${encodeURIComponent(x.id)}"><img src="${httpUrl(x.image_url)}" alt="" loading="lazy"></a>`).join('')}</div>`;
    },
    async top8() {
      const f = await q.top8();
      if (!f.length) return '';
      return `<div class="fx-t8">${f.map(u => `<a href="${profHref(u)}">${avatar(u, 'fx-sq')}<span>${esc(u.display_name || u.username || '')}</span></a>`).join('')}</div>`;
    },
    async guestbook(b) {
      const notes = await q.guestbook();
      const canSign = !!me() && !S.own;
      const form = canSign ? `<form class="fx-gbf" data-fx-gb><input maxlength="500" placeholder="Leave a note…" aria-label="Leave a note"><button class="fx-btn fx-btn-pri fx-btn-sm">Sign</button></form>` : '';
      if (!notes.length) return form + (S.own ? '<div class="fx-blank">No notes yet. They show up here when people sign.</div>' : `<div class="fx-blank">${me() ? 'Be the first to sign.' : 'Sign in to leave a note.'}</div>`);
      return form + `<div class="fx-lst">${notes.map(n => { const a = n.author || {}; return `<div class="fx-note">${avatar(a, 'fx-av')}
        <div style="min-width:0"><b>${esc(a.display_name || a.username || 'Faero member')}</b><time>${esc(ago(n.created_at))}</time><p>${esc(n.body)}</p></div></div>`; }).join('')}</div>`;
    },
    async groups() {
      const g = await q.groups();
      if (!g.length) return '';
      return `<div class="fx-lk">${g.map(x => `<a href="#/groups">${esc(x.name)}</a>`).join('')}</div>`;
    }
  };

  async function hydrate(r) {
    const token = S.token;
    await Promise.all($$('[data-fx-load]', r).map(async el => {
      const b = S.space.blocks[+el.dataset.i];
      if (!b || !LOADERS[b.t]) return;
      el.innerHTML = '<div class="fx-mut">Loading…</div>';
      const html = await LOADERS[b.t](b);
      if (token !== S.token || !el.isConnected) return;
      if (html) { el.innerHTML = html; return; }
      if (S.own) el.innerHTML = `<div class="fx-blank">${esc({
        song: 'Tap ✎ to pick your song, or post some music.', tracks: 'Post music, or tap ✎ to add tracks.', posts: 'Your posts land here.',
        photos: 'Post a photo and it shows here.', top8: 'Follow people and your Top 8 fills up.', groups: 'Join a group and it shows here.'
      }[b.t] || 'Nothing here yet.')}</div>`;
      else el.closest('.fx-blk').style.display = 'none';
    }));
    if (!S.own) $$('.fx-blk', r).forEach(a => { if (a.querySelector('.fx-bin').innerHTML.includes('<!--fx-empty-->')) a.style.display = 'none'; });
  }

  function tickCountdowns() {
    $$('[data-fx-cd]').forEach(el => {
      const t = new Date(el.dataset.fxCd.length === 10 ? el.dataset.fxCd + 'T00:00' : el.dataset.fxCd);
      const s = Math.max(0, (t - Date.now()) / 1000);
      if (!Number.isFinite(s)) return;
      const dd = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
      el.textContent = s ? `${dd}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m` : 'Now!';
    });
  }
  setInterval(tickCountdowns, 30000);

  /* ── editing ── */
  function wireSpace(r) {
    r.addEventListener('click', onSpaceClick);
    r.addEventListener('submit', onGuestbook);
    let drag = null;
    r.addEventListener('dragstart', e => { const a = e.target.closest('.fx-blk'); if (!a || !S.editing) return; drag = +a.dataset.i; a.classList.add('fx-drag');
      e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(drag)); } catch (_) {} });
    r.addEventListener('dragend', () => { drag = null; $$('.fx-blk', r).forEach(a => a.classList.remove('fx-drag', 'fx-over')); });
    r.addEventListener('dragover', e => { const a = e.target.closest('.fx-blk'); if (!a || drag === null) return; e.preventDefault();
      $$('.fx-over', r).forEach(x => x !== a && x.classList.remove('fx-over')); a.classList.add('fx-over'); });
    r.addEventListener('drop', e => { const a = e.target.closest('.fx-blk'); if (!a || drag === null) return; e.preventDefault();
      const to = +a.dataset.i, L = S.space.blocks; if (to === drag) return;
      const [m] = L.splice(drag, 1); L.splice(to, 0, m); draw(); });
  }

  function onSpaceClick(e) {
    if (e.target.closest('[data-fx-report]')) {
      if (typeof faeroReportPost === 'function' && S.p) faeroReportPost(S.p.id, S.p.id, 'profile');
      return;
    }
    const t = e.target.closest('[data-fx-bt],[data-fx-do],[data-fx-kind],[data-fx-stage]');
    if (!t || !S.own) return;
    const L = S.space.blocks;
    if (t.dataset.fxBt) {
      const i = +t.closest('.fx-blk').dataset.i, b = L[i];
      switch (t.dataset.fxBt) {
        case 'style': b.y = STYLES[(STYLES.indexOf(b.y) + 1) % STYLES.length]; break;
        case 'size': { const z = TYPES[b.t].sz; b.s = z[(z.indexOf(b.s) + 1) % z.length]; break; }
        case 'del': L.splice(i, 1); break;
        case 'left': if (i > 0) [L[i - 1], L[i]] = [L[i], L[i - 1]]; break;
        case 'right': if (i < L.length - 1) [L[i + 1], L[i]] = [L[i], L[i + 1]]; break;
        case 'fill': openFill(i); return;
      }
      draw(); return;
    }
    if (t.dataset.fxKind) { S.space.kind = t.dataset.fxKind; draw(); return; }
    if (t.dataset.fxStage) { S.space.stage = t.dataset.fxStage; draw(); return; }
    switch (t.dataset.fxDo) {
      case 'edit': S.editing = true; draw(); break;
      case 'cancel': S.space = clone(S.saved); S.editing = false; draw(); break;
      case 'reset': if (confirm('Start over with the default blocks? Your text in blocks will be cleared.')) { S.space = defaultSpace(S.space.kind); draw(); } break;
      case 'add': openAdd(); break;
      case 'save': saveSpace(); break;
    }
  }

  async function onGuestbook(e) {
    const f = e.target.closest('[data-fx-gb]');
    if (!f) return;
    e.preventDefault();
    if (!me()) { faeroOpenAuth(); return; }
    const inp = $('input', f), body = inp.value.trim(), btn = $('button', f);
    if (!body) return;
    btn.disabled = true;
    const { error } = await supabase.from('guestbook').insert({ profile_id: S.p.id, author_id: me().id, body });
    btn.disabled = false;
    if (error) { toast('err', 'Could not sign', typeof faeroFriendlyDbError === 'function' ? faeroFriendlyDbError(error) : error.message); return; }
    toast('ok', 'Signed!', 'Your note is up ✉️');
    delete S.cache[S.p.id + ':guestbook'];
    draw();
  }

  /* Writes the signed-in user's layout. Without the sql/09 column it keeps
     the layout on this device and says so; any other error is shown. */
  async function persist(space) {
    const clean = normSpace(clone(space));
    const { error } = await supabase.from('profiles').update({ space: clean }).eq('id', me().id);
    if (error) {
      const missing = (typeof faeroIsMissingColumn === 'function' && faeroIsMissingColumn(error)) || error.code === 'PGRST204' || /\bspace\b/.test(error.message || '');
      if (!missing) { toast('err', 'Could not save', typeof faeroFriendlyDbError === 'function' ? faeroFriendlyDbError(error) : error.message); return null; }
      lsSet(SPACE_KEY(me().id), JSON.stringify(clean));
      return { clean, local: true };
    }
    lsSet(SPACE_KEY(me().id), JSON.stringify(clean));
    if (myProfile()) myProfile().space = clean;
    return { clean, local: false };
  }
  const LOCAL_NOTE = 'Visitors see it once the profile-space database update (sql/09) is live.';

  async function saveSpace() {
    if (!S.own || !me()) return;
    const btn = $('[data-fx-do="save"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const res = await persist(S.space);
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    if (!res) return;
    toast(res.local ? 'info' : 'ok', res.local ? 'Saved on this device' : 'Saved', res.local ? LOCAL_NOTE : 'Your space is live.');
    S.p.space = res.clean; S.space = clone(res.clean); S.saved = clone(res.clean); S.editing = false;
    draw();
  }

  /* Radio adds a station block to your own space from anywhere. */
  function ownSpace() {
    if (S.own && S.saved) return clone(S.saved);
    const p = myProfile();
    let sp = normSpace(p && p.space);
    if (!sp) { try { sp = normSpace(JSON.parse(lsGet(SPACE_KEY(me().id)) || 'null')); } catch (e) {} }
    return sp || defaultSpace('listener');
  }
  async function pinToSpace(t, d, msg) {
    if (!me()) { faeroOpenAuth(); return; }
    const sp = ownSpace();
    const b = sp.blocks.find(x => x.t === t);
    if (b) b.d = Object.assign({}, b.d, d); else sp.blocks.unshift({ t, s: TYPES[t].sz[0], y: 'night', d });
    const res = await persist(sp);
    if (!res) return;
    // Only touch what's on screen if it is the owner's own space.
    if (S.own && S.p) { S.p.space = res.clean; S.saved = clone(res.clean); if (!S.editing) { S.space = clone(res.clean); draw(); } }
    toast('ok', msg, res.local ? LOCAL_NOTE : 'Open your profile to see it.');
  }
  /* ── modals ── */
  function modal(title, inner, foot) {
    closeModal();
    const s = document.createElement('div');
    s.className = 'fx-scrim'; s.id = 'fx-scrim';
    s.innerHTML = `<div class="fx-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header><h3>${esc(title)}</h3><button class="fx-x" data-fx-close aria-label="Close">${IC.x}</button></header>
      <div class="fx-mbody">${inner}</div>${foot ? `<div class="fx-mfoot">${foot}</div>` : ''}</div>`;
    s.addEventListener('click', e => { if (e.target === s || e.target.closest('[data-fx-close]')) closeModal(); });
    document.body.appendChild(s);
    const first = $('input,textarea,button.fx-opt', s); if (first) first.focus();
    return s;
  }
  function closeModal() { $('#fx-scrim')?.remove(); }

  function openAdd() {
    const kind = S.space.kind;
    const order = Object.entries(TYPES).sort((a, b) => (kind === 'artist' ? (b[1].a || 0) - (a[1].a || 0) : 0));
    const s = modal('Add a block', `<div class="fx-opts">${order.map(([k, v]) => `<button class="fx-opt" data-fx-add="${k}"><span class="fx-e">${v.e}</span>
      <span><b>${v.n}${v.a ? '<span class="fx-tag">ARTIST</span>' : ''}</b><span>${v.d}</span></span></button>`).join('')}</div>`);
    s.addEventListener('click', e => {
      const o = e.target.closest('[data-fx-add]');
      if (!o) return;
      const t = o.dataset.fxAdd;
      if (S.space.blocks.length >= 40) { toast('info', 'That\'s a lot of blocks', 'A space holds up to 40.'); return; }
      S.space.blocks.push({ t, s: TYPES[t].sz[0], y: 'glass', d: {} });
      closeModal(); draw();
      const last = $$('#fx-space .fx-blk').pop(); if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (FIELDS[t] && (FIELDS[t].f || []).length + (FIELDS[t].rows ? 1 : 0)) openFill(S.space.blocks.length - 1);
    });
  }

  const inputFor = (kind, k, label, v, max, rowI) => {
    const name = rowI == null ? k : `${k}.${rowI}`;
    if (kind === 'textarea') return `<label class="fx-field">${label}<textarea name="${name}" maxlength="${max}">${esc(v || '')}</textarea></label>`;
    if (kind === 'image') return `<label class="fx-field">${label}${httpUrl(v) ? `<img src="${httpUrl(v)}" alt="" style="width:90px;height:90px;object-fit:cover;border-radius:10px;border:2px solid #081B36">` : ''}
      <input type="file" name="${name}" accept="image/*"><input type="hidden" name="${name}.keep" value="${esc(v || '')}"></label>`;
    const type = kind === 'music' || kind === 'url' ? 'url' : kind === 'date' ? 'date' : kind === 'datetime-local' ? 'datetime-local' : 'text';
    const ph = kind === 'music' ? 'https://soundcloud.com/…' : kind === 'url' ? 'https://…' : '';
    return `<label class="fx-field">${label}<input type="${type}" name="${name}" value="${esc(v || '')}" ${max ? `maxlength="${max}"` : ''} placeholder="${ph}"></label>`;
  };

  function openFill(i) {
    const b = S.space.blocks[i], spec = FIELDS[b.t];
    if (!spec) return;
    let rows = (b.d.items || []).slice();
    const rowsHTML = () => rows.map((r, n) => `<div class="fx-row" style="grid-template-columns:${spec.cols.map(() => 'minmax(0,1fr)').join(' ')} auto">
      ${spec.cols.map(([k, l, kind, max]) => inputFor(kind, k, l, r[k], max, n)).join('')}
      <button type="button" class="fx-x" data-fx-rmrow="${n}" aria-label="Remove row">${IC.x}</button></div>`).join('');
    const inner = () => `${spec.note ? `<p class="fx-note-p">${esc(spec.note)}</p>` : ''}
      <form id="fx-fill" style="display:flex;flex-direction:column;gap:12px">
        ${(spec.f || []).map(([k, l, kind, max]) => inputFor(kind, k, l, b.d[k], max)).join('')}
        ${spec.rows ? `<div id="fx-rows" style="display:flex;flex-direction:column;gap:8px">${rowsHTML()}</div>
          <button type="button" class="fx-btn fx-btn-sm" style="align-self:flex-start" data-fx-addrow>${IC.plus}Add a row</button>` : ''}
      </form>`;
    const s = modal(TYPES[b.t].n, inner(), `<button class="fx-btn" data-fx-close>Cancel</button><button class="fx-btn fx-btn-pri" data-fx-apply>Done</button>`);
    const readRows = () => {
      const f = $('#fx-fill', s);
      rows = rows.map((r, n) => Object.fromEntries(spec.cols.map(([k]) => [k, (f.elements[`${k}.${n}`] || {}).value || ''])));
    };
    s.addEventListener('click', async e => {
      if (e.target.closest('[data-fx-addrow]')) { readRows(); if (rows.length < spec.rows) rows.push({}); $('#fx-rows', s).innerHTML = rowsHTML(); return; }
      const rm = e.target.closest('[data-fx-rmrow]');
      if (rm) { readRows(); rows.splice(+rm.dataset.fxRmrow, 1); $('#fx-rows', s).innerHTML = rowsHTML(); return; }
      if (!e.target.closest('[data-fx-apply]')) return;
      const f = $('#fx-fill', s), d = {};
      const bad = [];
      for (const [k, l, kind] of spec.f || []) {
        if (kind === 'image') {
          const file = f.elements[k].files[0];
          d[k] = f.elements[k + '.keep'].value;
          if (file) {
            try { e.target.disabled = true; e.target.textContent = 'Uploading…'; d[k] = await cloudinaryUpload(file, 'faero/space'); }
            catch (err) { toast('err', 'Upload failed', err.message || 'Try a smaller image.'); e.target.disabled = false; e.target.textContent = 'Done'; return; }
          }
          continue;
        }
        d[k] = f.elements[k].value;
        if (d[k] && !cleanField(kind, d[k])) bad.push(l);
      }
      if (spec.rows) {
        readRows();
        rows.forEach(r => spec.cols.forEach(([k, l, kind]) => { if (r[k] && !cleanField(kind, r[k])) bad.push(l); }));
        d.items = rows;
      }
      if (bad.length) {
        toast('err', 'Check the links', `${[...new Set(bad)].join(', ')}: links must start with https://${spec.f && spec.f.some(x => x[2] === 'music') || (spec.cols || []).some(x => x[2] === 'music') ? ' and music links must be SoundCloud, Mixcloud, YouTube or Bandcamp' : ''}.`);
        return;
      }
      b.d = Object.assign({}, b.d, cleanData(b.t, d));
      if (spec.rows && !b.d.items) b.d.items = [];
      closeModal(); draw();
    });
  }

  function openListen(url) {
    const em = embedOf(url);
    if (!em) { window.open(url, '_blank', 'noopener'); return; }
    modal('Listen', `<div class="fx-embed" style="height:200px;flex:none">${em}</div>`);
  }

  /* ═══════════════════════════════════════════════════════════════
     GLOBAL WIRING
  ═══════════════════════════════════════════════════════════════ */
  document.addEventListener('click', e => {
    let el;
    if ((el = e.target.closest('[data-fx-st]'))) { if (S.editing && el.closest('#fx-space')) return; playStation(STN[el.dataset.fxSt]); return; }
    if ((el = e.target.closest('[data-fx-dock]'))) { el.dataset.fxDock === 'stop' ? stopRadio() : togglePlay(); return; }
    if ((el = e.target.closest('[data-fx-listen]'))) {
      if (S.editing) return;
      const blk = el.closest('.fx-blk');
      const em = embedOf(el.dataset.fxListen);
      // In a big enough block, play inside it; otherwise in a small window.
      if (blk && em && !blk.classList.contains('fx-s')) {
        blk.querySelector('.fx-player')?.remove();
        blk.insertAdjacentHTML('beforeend', `<div class="fx-player"><div class="fx-bh"><span class="fx-dot"></span>Now playing<span class="fx-r"><button class="fx-ib" style="color:inherit;width:28px;height:28px" data-fx-unplay aria-label="Close player">${IC.x}</button></span></div><div class="fx-embed">${em}</div></div>`);
      } else openListen(el.dataset.fxListen);
      return;
    }
    if ((el = e.target.closest('[data-fx-unplay]'))) { el.closest('.fx-player')?.remove(); return; }
    if ((el = e.target.closest('[data-fx-pin]'))) { const st = STN[el.dataset.fxPin]; if (st) pinToSpace('station', { id: st.id, uuid: st.uuid, name: st.name, url: st.url, fav: st.fav, country: st.country }, `${st.name} is on your space`); return; }
    if ((el = e.target.closest('[data-fx-tag]'))) { loadStations('tag=' + encodeURIComponent(el.dataset.fxTag), el.textContent.trim(), el); return; }
    if ((el = e.target.closest('[data-fx-cc]'))) { loadStations('countrycode=' + encodeURIComponent(el.dataset.fxCc), el.textContent.trim(), el); return; }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('#fx-scrim')) closeModal();
  });

  function onPage(slug) {
    boothVisible(slug === 'booth');
    if (slug === 'profile' && guest && !/^#profile\//.test(location.hash)) showGuestProfile();
    if (slug === 'radio') ensureRadio();
    else if (slug === 'booth') ensureBooth();
  }

  /* Moderators: wipe a reported profile space. The existing "staff updates"
     policy on profiles is what allows it; for anyone else RLS refuses. */
  async function adminClearSpace(uid, reportId) {
    if (!uid || !confirm("Clear this person's profile space? Their blocks and everything typed into them are removed.")) return;
    const { error } = await supabase.from('profiles').update({ space: null }).eq('id', uid);
    if (error) { toast('err', 'Could not clear it', typeof faeroFriendlyDbError === 'function' ? faeroFriendlyDbError(error) : error.message); return; }
    toast('ok', 'Profile space cleared', 'They see the default layout now.');
    if (reportId && typeof admResolveReport === 'function') admResolveReport(reportId, 'actioned');
  }

  window.FaeroSpace = { onPage, renderProfile, clear, adminClearSpace };

  // The router may already have shown one of these pages before this file ran.
  const active = $('.page.active');
  if (active) onPage(active.id.replace('page-', ''));
  if (typeof PF_PROFILE !== 'undefined' && PF_PROFILE && $('#page-profile.active')) renderProfile(PF_PROFILE);
})();
