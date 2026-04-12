/* ============================================================
   AERONET OS — WINDOW MANAGER & DESKTOP ENGINE
   ============================================================ */

const OS = (() => {
  /* ── STATE ─────────────────────────────────────────────── */
  let windows = {};
  let iconPositions = {};
  let zCounter = 100;
  let focusedId = null;
  let draggingWin = null, dragOffX = 0, dragOffY = 0;
  let resizingWin = null, resizeStartW = 0, resizeStartH = 0, resizeStartX = 0, resizeStartY = 0;
  let draggingIcon = null, iconDragOffX = 0, iconDragOffY = 0;
  let selectBoxStart = null;
  let selectedIcons = new Set();

  /* ── APP REGISTRY ──────────────────────────────────────── */
  const APPS = {
    faero: { title: 'faero', icon: '&#127760;', file: 'apps/faero.html', w: 1320, h: 840, minW: 700, minH: 500 },
    photobooth: { title: 'Disposable', icon: 'icons/photo.svg', file: 'apps/photobooth.html', w: 1032, h: 768, minW: 640, minH: 480 },
    winamp: { title: 'Winamp', icon: '&#9836;', file: 'apps/winamp.html', w: 528, h: 480, minW: 280, minH: 340 },
    chat: { title: 'Chat', icon: 'icons/chat.svg', file: 'apps/chat.html', w: 864, h: 648, minW: 500, minH: 400 },
    emulator: { title: 'GameBoy', icon: 'icons/gameboy.svg', file: 'apps/emulator.html', w: 600, h: 576, minW: 400, minH: 440 },
    notepad: { title: 'Notepad', icon: 'icons/notepad.svg', file: 'apps/notepad.html', w: 648, h: 528, minW: 340, minH: 300 },
    mydocs: { title: 'Documents', icon: 'icons/docs.svg', file: 'apps/mydocs.html', w: 864, h: 624, minW: 500, minH: 380 },
    settings: { title: 'Settings', icon: 'icons/settings.svg', file: 'apps/settings.html', w: 816, h: 624, minW: 520, minH: 420 },
    painter: { title: 'Painter', icon: 'icons/painter.svg', file: 'apps/painter.html', w: 1056, h: 696, minW: 600, minH: 420 },
    ps1: { title: 'PlayStation', icon: '&#128191;', file: 'apps/ps1.html', w: 960, h: 720, minW: 640, minH: 480 },
    calendar: { title: 'Calendar', icon: '&#128197;', file: 'apps/stampcam.html', w: 860, h: 640, minW: 600, minH: 500 },
    games: { title: 'Games', icon: '&#127918;', file: 'apps/games.html', w: 600, h: 450, minW: 400, minH: 300 },
    calculator: { title: 'Calculator', icon: '&#128159;', file: 'apps/calculator.html', w: 320, h: 460, minW: 280, minH: 400 },
    radio: { title: 'faeroRadio', icon: '&#128251;', file: 'apps/radio.html', w: 800, h: 600, minW: 600, minH: 400 },
    tv: { title: 'TV', icon: '&#128250;', file: 'apps/tv.html', w: 1024, h: 768, minW: 640, minH: 480 },
    game_2048: { title: '2048', icon: '🔢', file: 'apps/games/2048.html', w: 400, h: 600, minW: 300, minH: 400 },
    game_breakout: { title: 'Breakout', icon: '🧱', file: 'apps/games/breakout.html', w: 600, h: 500, minW: 400, minH: 400 },
    game_flappy: { title: 'Flappy Bird', icon: '🐦', file: 'apps/games/flappy.html', w: 400, h: 600, minW: 300, minH: 400 }
  };

  /* ── UTILITY ───────────────────────────────────────────── */
  const genId = () => 'win_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  /* ── WINDOW FACTORY ────────────────────────────────────── */
  const openApp = (appId, extraData = {}) => {
    // If already open, focus it
    const existing = Object.values(windows).find(w => w.appId === appId);
    if (existing) { focusWindow(existing.id); return; }

    const app = APPS[appId];
    if (!app) return;

    // Add cache-buster to force refresh
    const cacheBuster = `cb=${Date.now()}`;
    const fileUrl = app.file.includes('?') ? `${app.file}&${cacheBuster}` : `${app.file}?${cacheBuster}`;

    const id = genId();
    const vw = window.innerWidth, vh = window.innerHeight - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height') || 42);

    // Center + slight offset
    const cnt = Object.keys(windows).length;
    const left = clamp(Math.round((vw - app.w) / 2) + cnt * 24, 0, vw - app.w);
    const top = clamp(Math.round((vh - app.h) / 2) + cnt * 24, 0, vh - app.h);

    const url = new URL(fileUrl, location.href);
    url.searchParams.set('theme', ThemeEngine.get());
    if (extraData.view) url.searchParams.set('view', extraData.view);

    const el = document.createElement('div');
    el.className = 'os-window';
    el.id = id;
    el.style.cssText = `left:${left}px;top:${top}px;width:${app.w}px;height:${app.h}px;z-index:${++zCounter}`;
    el.dataset.appId = appId;
    el.dataset.minW = app.minW || 300;
    el.dataset.minH = app.minH || 200;

    const iconHtml = getDefaultIcon(appId);

    el.innerHTML = `
      <div class="win-titlebar" data-win-drag="${id}">
        <div class="win-icon">${iconHtml}</div>
        <div class="win-title">${app.title}</div>
        <div class="win-controls">
          <button class="win-btn minimize" data-win-min="${id}" title="Minimize">&#8212;</button>
          <button class="win-btn maximize" data-win-max="${id}" title="Maximize">&#9633;</button>
          <button class="win-btn close" data-win-close="${id}" title="Close">&#215;</button>
        </div>
      </div>
      <div class="win-body">
        <iframe class="app-frame" src="${url.toString()}" title="${app.title}" onload="OS.injectCursors(this)" allowfullscreen allow="camera; microphone; gamepad"></iframe>
      </div>
  <div class="win-resize" data-win-resize="${id}"></div>
`;

    document.getElementById('windows-container').appendChild(el);
    const winObj = { id, appId, el, minimized: false, maximized: false, prevRect: { left: left, top: top, width: app.w, height: app.h } };
    windows[id] = winObj;
    addToTaskbar(id, app);

    // Auto-maximize if requested
    if (extraData && extraData.maximized) {
      toggleMaximize(id);
    } else {
      focusWindow(id);
    }
    return id;
  };

  const closeWindow = (id) => {
    const win = windows[id];
    if (!win) return;
    win.el.classList.add('minimizing');
    setTimeout(() => {
      win.el.remove();
      delete windows[id];
      removeFromTaskbar(id);
    }, 160);
  };

  const minimizeWindow = (id) => {
    const win = windows[id];
    if (!win) return;
    win.minimized = true;
    win.el.style.display = 'none';
    updateTaskbarBtn(id, false);
  };

  const restoreWindow = (id) => {
    const win = windows[id];
    if (!win) return;
    win.minimized = false;
    win.el.style.display = 'flex';
    focusWindow(id);
    updateTaskbarBtn(id, true);
  };

  const toggleMaximize = (id) => {
    const win = windows[id];
    if (!win) return;
    if (win.maximized) {
      const r = win.prevRect;
      win.el.classList.remove('maximized');
      win.el.style.left = r.left + 'px';
      win.el.style.top = r.top + 'px';
      win.el.style.width = r.width + 'px';
      win.el.style.height = r.height + 'px';
      win.maximized = false;
    } else {
      const el = win.el;
      win.prevRect = { left: parseInt(el.style.left), top: parseInt(el.style.top), width: parseInt(el.style.width), height: parseInt(el.style.height) };
      win.maximized = true;
      el.classList.add('maximized');
    }
    focusWindow(id);
  };

  const focusWindow = (id) => {
    const win = windows[id];
    if (!win) return;
    Object.values(windows).forEach(w => w.el.classList.remove('focused'));
    win.el.style.zIndex = ++zCounter;
    win.el.classList.add('focused');
    focusedId = id;
    updateTaskbarBtn(id, true);
  };

  /* ── TASKBAR ───────────────────────────────────────────── */
  const addToTaskbar = (id, app) => {
    const container = document.getElementById('taskbar-apps');
    const btn = document.createElement('button');
    btn.className = 'taskbar-app-btn active';
    btn.id = 'tb_' + id;
    btn.innerHTML = `<span style="font-size:12px">${app.title}</span>`;
    btn.addEventListener('click', () => {
      const win = windows[id];
      if (!win) return;
      if (win.minimized) restoreWindow(id);
      else if (focusedId === id) minimizeWindow(id);
      else focusWindow(id);
    });
    container.appendChild(btn);
  };

  const removeFromTaskbar = (id) => {
    const btn = document.getElementById('tb_' + id);
    if (btn) btn.remove();
  };

  const updateTaskbarBtn = (id, active) => {
    const btn = document.getElementById('tb_' + id);
    if (btn) btn.classList.toggle('active', active);
  };

  /* ── DRAG — WINDOWS ────────────────────────────────────── */
  const startWinDrag = (e, id) => {
    if (e.button !== 0) return;
    const win = windows[id];
    if (!win || win.maximized) return;
    draggingWin = id;
    dragOffX = e.clientX - parseInt(win.el.style.left);
    dragOffY = e.clientY - parseInt(win.el.style.top);
    focusWindow(id);
    e.preventDefault();
  };

  /* ── RESIZE ────────────────────────────────────────────── */
  const startResize = (e, id) => {
    if (e.button !== 0) return;
    const win = windows[id];
    if (!win || win.maximized) return;
    resizingWin = id;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartW = parseInt(win.el.style.width);
    resizeStartH = parseInt(win.el.style.height);
    e.preventDefault();
    e.stopPropagation();
  };

  /* ── DRAG — ICONS ──────────────────────────────────────── */
  const startIconDrag = (e, iconEl) => {
    if (e.button !== 0) return;
    if (window.innerWidth <= 767) return; // no drag on mobile
    draggingIcon = iconEl;
    iconDragOffX = e.clientX - iconEl.getBoundingClientRect().left;
    iconDragOffY = e.clientY - iconEl.getBoundingClientRect().top;
    iconEl.style.zIndex = 9;
    e.preventDefault();
  };

  /* ── MOUSE EVENTS ──────────────────────────────────────── */
  const onMouseMove = (e) => {
    if (draggingWin) {
      const win = windows[draggingWin];
      const vw = window.innerWidth, vh = window.innerHeight - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height') || 42);
      win.el.style.left = clamp(e.clientX - dragOffX, 0, vw - 120) + 'px';
      win.el.style.top = clamp(e.clientY - dragOffY, 0, vh - 32) + 'px';
    }
    if (resizingWin) {
      const win = windows[resizingWin];
      const minW = parseInt(win.el.dataset.minW);
      const minH = parseInt(win.el.dataset.minH);
      win.el.style.width = Math.max(minW, resizeStartW + (e.clientX - resizeStartX)) + 'px';
      win.el.style.height = Math.max(minH, resizeStartH + (e.clientY - resizeStartY)) + 'px';
    }
    if (draggingIcon) {
      const cont = document.getElementById('desktop-icons-container');
      const rect = cont.getBoundingClientRect();
      draggingIcon.style.left = (e.clientX - rect.left - iconDragOffX) + 'px';
      draggingIcon.style.top = (e.clientY - rect.top - iconDragOffY) + 'px';
    }
  };

  const onMouseUp = (e) => {
    if (draggingIcon) {
      const appId = draggingIcon.dataset.appId;
      iconPositions[appId] = { left: draggingIcon.style.left, top: draggingIcon.style.top };
      AeroStorage.set('iconPositions', iconPositions);
      draggingIcon.style.zIndex = '';
      draggingIcon = null;
    }
    draggingWin = null;
    resizingWin = null;
  };

  /* ── CONTEXT MENU ──────────────────────────────────────── */
  const showContextMenu = (x, y, items) => {
    const menu = document.getElementById('context-menu');
    menu.innerHTML = '';
    items.forEach(item => {
      if (item === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        menu.appendChild(sep);
        return;
      }
      const el = document.createElement('div');
      el.className = 'ctx-item';
      el.innerHTML = `${item.icon ? `<span>${item.icon}</span>` : ''} <span>${item.label}</span>`;
      el.addEventListener('click', () => { hideContextMenu(); item.action(); });
      menu.appendChild(el);
    });
    const vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = Math.min(x, vw - 200) + 'px';
    menu.style.top = Math.min(y, vh - 50) + 'px';
    menu.classList.add('open', 'context-menu');
  };

  const hideContextMenu = () => {
    document.getElementById('context-menu').classList.remove('open');
  };
  /* ── DESKTOP ICONS ─────────────────────────────────────── */
  const buildDesktopIcons = () => {
    const container = document.getElementById('desktop-icons-container');
    container.innerHTML = '';
    // Force reset to v8_rename_docs
    if (!AeroStorage.get('grid_fixed_v8')) {
      AeroStorage.set('iconPositions', {});
      AeroStorage.set('grid_fixed_v8', true);
    }
    iconPositions = AeroStorage.get('iconPositions', {});

    const isMobile = window.innerWidth <= 767;
    const defaultPositions = [
      // Column 1 - Communication & Main Core
      { id: 'faero', x: 28, y: 28 },
      { id: 'chat', x: 28, y: 128 },
      { id: 'winamp', x: 28, y: 228 },
      { id: 'photobooth', x: 28, y: 328 },
      { id: 'mydocs', x: 28, y: 428 },
      { id: 'notepad', x: 28, y: 528 },
      { id: 'calculator', x: 28, y: 628 },

      // Column 2 - Games, Tools & Media
      { id: 'games', x: 138, y: 28 }, // Games at top of col 2 for visibility
      { id: 'settings', x: 138, y: 128 },
      { id: 'calendar', x: 138, y: 228 },
      { id: 'ps1', x: 138, y: 328 },
      { id: 'painter', x: 138, y: 428 },
      { id: 'radio', x: 138, y: 528 },
      { id: 'tv', x: 138, y: 628 },
    ];

    defaultPositions.forEach(({ id, x, y }, idx) => {
      const app = APPS[id];
      if (!app) return;
      const pos = iconPositions[id] || { left: x + 'px', top: y + 'px' };

      const icon = document.createElement('div');
      icon.className = 'desktop-icon';
      icon.dataset.appId = id;
      if (!isMobile) {
        icon.style.left = pos.left;
        icon.style.top = pos.top;
      }

      icon.innerHTML = `
        <div class="desk-icon-img">
          ${getDefaultIcon(id)}
        </div>
        <div class="desk-icon-label" style="display:block;opacity:1;color:#fff">${app.title}</div>
      `;

      // Double-click to open
      let clickTimer = null;
      icon.addEventListener('click', (e) => {
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
          openApp(id);
        } else {
          clickTimer = setTimeout(() => {
            clickTimer = null;
            // Single click — select
            if (!e.shiftKey) selectedIcons.clear();
            selectedIcons.add(id);
            $$('.desktop-icon').forEach(el => el.classList.toggle('selected', selectedIcons.has(el.dataset.appId)));
          }, 220);
        }
      });

      // Drag
      icon.addEventListener('mousedown', (e) => startIconDrag(e, icon));

      // Right-click
      icon.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, [
          { label: `Open ${app.title} `, icon: '&#9654;', action: () => openApp(id) },
          'sep',
          { label: 'Rename', icon: '&#9998;', action: () => { } },
          { label: 'Delete', icon: '&#128465;', action: () => { } }
        ]);
      });

      container.appendChild(icon);
    });
  };

  /* ── START MENU ────────────────────────────────────────── */
  const toggleStartMenu = () => {
    const menu = document.getElementById('start-menu');
    menu.classList.toggle('open');
  };

  const buildStartMenu = () => {
    const profile = AeroStorage.getProfile();
    const menu = document.getElementById('start-menu');
    menu.innerHTML = `
      <div class="start-menu-header">
        <div class="start-av" style="background:${profile.avatarGrad}">${profile.avatarLetter}</div>
        <div>
          <div class="start-username">${profile.displayName}</div>
          <div class="start-tagline">${profile.handle}</div>
        </div>
      </div>
      <div class="start-menu-apps">
        ${Object.entries(APPS).map(([id, app]) => `
          <div class="sm-app-item" data-sm-open="${id}">
            <span class="sm-app-icon" style="width:20px;height:20px;display:inline-block">${getDefaultIcon(id)}</span>
            <span>${app.title}</span>
          </div>
        `).join('')}
      </div>
      <div class="start-menu-footer">
        <button class="sm-footer-btn" id="sm-settings">Settings</button>
        <button class="sm-footer-btn" id="sm-shutdown">Shut Down</button>
      </div>
`;
    $$('[data-sm-open]', menu).forEach(el => {
      el.addEventListener('click', () => { openApp(el.dataset.smOpen); toggleStartMenu(); });
    });
    $('#sm-settings', menu)?.addEventListener('click', () => { openApp('settings'); toggleStartMenu(); });
    $('#sm-shutdown', menu)?.addEventListener('click', () => { location.reload(); });
  };

  /* ── CLOCK ─────────────────────────────────────────────── */
  const startClock = () => {
    const update = () => {
      const now = new Date();
      const h = now.getHours().toString().padStart(2, '0');
      const m = now.getMinutes().toString().padStart(2, '0');
      const d = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const el = document.getElementById('clock');
      if (el) el.innerHTML = `${h}:${m} <br><small>${d}</small>`;
    };
    update();
    setInterval(update, 10000);
  };

  /* ── TOAST ─────────────────────────────────────────────── */
  const toast = (msg, icon = '&#9993;', duration = 3000) => {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('hiding');
      setTimeout(() => el.remove(), 260);
    }, duration);
  };

  /* ── INTER-APP MESSAGING ───────────────────────────────── */
  const onMessage = (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'OPEN_APP':
        openApp(msg.appId, msg.data || {});
        break;
      case 'TOAST':
        toast(msg.text, msg.icon);
        break;
      case 'SET_THEME':
        ThemeEngine.apply(msg.theme);
        break;
      case 'SET_WALLPAPER':
        AeroStorage.set('wallpaper', msg.url);
        ThemeEngine.init();
        break;
      case 'PROFILE_UPDATE':
        AeroStorage.setProfile(msg.profile);
        buildStartMenu();
        break;
      case 'POST_TO_FEED':
        {
          const aeronetPost = {
            id: Date.now(),
            isOwn: true,
            text: msg.content,
            image: msg.image,
            type: 'image',
            likes: 0,
            liked: false,
            comments: [],
            ts: Date.now()
          };

          let aeronetWin = Object.values(windows).find(w => w.appId === 'aeronet');
          const sendToAeronet = (win) => {
            try {
              win.el.querySelector('iframe').contentWindow.postMessage({
                type: 'INCOMING_POST',
                post: aeronetPost
              }, '*');
            } catch (e) { console.error("Post failed", e); }
          };

          if (aeronetWin) {
            sendToAeronet(aeronetWin);
            focusWindow(aeronetWin.id);
          } else {
            openApp('aeronet');
            setTimeout(() => {
              const newWin = Object.values(windows).find(w => w.appId === 'aeronet');
              if (newWin) sendToAeronet(newWin);
            }, 1000);
          }
        }
        break;
      case 'TOGGLE_CLOCK':
        const clock = document.getElementById('clock');
        if (clock) clock.style.display = msg.show ? 'block' : 'none';
        break;
      case 'SET_TASKBAR_OPACITY':
        const tb = document.getElementById('taskbar');
        if (tb) tb.style.opacity = msg.opacity;
        break;
      case 'SET_TASKBAR_POS':
        document.body.dataset.taskbarPos = msg.pos;
        break;
      case 'SET_WEBAMP_SKIN':
        if (window.__webampInstance && msg.url) {
          window.__webampInstance.setSkinFromUrl(msg.url).catch(err => {
            console.error("Skin Fetch Error:", err);
            toast("CORS Error: Cannot download skin from webamp.org", "&#10060;");
          });
        }
        break;
      case 'LAUNCH_WEBAMP':
        if (window.__webampInstance) {
          toast("Winamp is already active", "&#9836;");
          return;
        }

        const WebampClass = window.Webamp;
        if (!WebampClass) {
          toast("Webamp engine failed to load. Check internet.", "&#10060;");
          return;
        }

        toast("Starting Winamp Engine...", "&#9836;");

        const webamp = new WebampClass({
          initialTracks: [
            {
              metaData: { artist: "Scott Joplin", title: "Maple Leaf Rag" },
              url: "https://upload.wikimedia.org/wikipedia/commons/d/da/Maple_Leaf_Rag.mp3",
              duration: 191
            },
            {
              metaData: { artist: "Beethoven", title: "Moonlight Sonata" },
              url: "https://upload.wikimedia.org/wikipedia/commons/4/44/Moonlight_Sonata.mp3",
              duration: 300
            },
            {
              metaData: { artist: "Mozart", title: "Eine Kleine Nachtmusik" },
              url: "https://upload.wikimedia.org/wikipedia/commons/b/be/Wolfgang_Amadeus_Mozart_-_Eine_Kleine_Nachtmusik_-_1._Allegro.mp3",
              duration: 350
            }
          ],
          availableSkins: [
            { url: "https://webamp.org/skins/m_Winamp_1.5.wsz", name: "Winamp Modern" }
          ],
          __butterchurnOptions: {
            importButterchurn: () => {
              const bc = window.butterchurn || (window.butterchurn && window.butterchurn.default);
              return Promise.resolve(bc);
            },
            getPresets: () => {
              const ps = window.butterchurnPresets ? window.butterchurnPresets.getPresets() : {};
              return Promise.resolve(ps);
            },
            butterchurnOpen: true
          },
          __initialWindowLayout: {
            main: { position: { top: 60, left: 60 } },
            playlist: { position: { top: 180, left: 60 } },
            equalizer: { position: { top: 60, left: 335 } },
            milkdrop: { position: { top: 180, left: 335 } }
          }
        });

        window.__webampInstance = webamp;

        const webRoot = document.getElementById('webamp-os-root');
        if (webRoot) webRoot.innerHTML = '';

        webamp.renderWhenReady(webRoot || document.body).then(() => {
          const launcher = Object.values(windows).find(w => w.appId === 'winamp');
          if (launcher) closeWindow(launcher.id);

          // Force Milkdrop reveal
          try {
            webamp.showWindow('milkdrop');
            // Try everything to wake up Milkdrop
            setTimeout(() => {
              const presets = window.butterchurnPresets ? window.butterchurnPresets.getPresets() : {};
              const names = Object.keys(presets);
              if (names.length) {
                const rand = presets[names[Math.floor(Math.random() * names.length)]];
                webamp.store.dispatch({ type: "SELECT_PRESET", preset: rand });
                webamp.store.dispatch({ type: "SET_MILKDROP_DESKTOP_VISIBILITY", visible: true });
              }
            }, 1500);
          } catch (e) { }

          // Force reveal desktop
          document.body.style.backgroundColor = "transparent";
          document.getElementById('desktop').style.opacity = "1";
          document.getElementById('desktop').style.display = "block";

          toast("Winamp Ready!", "&#9989;");
        }).catch(err => {
          toast("Mount Error: " + err.message, "&#10060;");
        });

        webamp.onClose(() => {
          webamp.dispose();
          window.__webampInstance = null;
        });

        // Ensure it stays on top by forcing z-index on its container
        // Webamp creates a #webamp element
        setTimeout(() => {
          const el = document.getElementById('webamp') || document.querySelector('[id^="webamp"]');
          if (el) {
            el.style.backgroundColor = "transparent";
            el.style.zIndex = "999999";
          }
        }, 800);
        break;
      case 'SET_CURSOR':
        document.body.dataset.cursorSet = msg.css;
        AeroStorage.set('cursorSet', msg.css);
        // Inject into open windows
        Object.values(windows).forEach(w => {
          const iframe = w.el.querySelector('iframe');
          if (iframe) injectCursors(iframe);
        });
        break;
    }
  };

  /* ── INIT ──────────────────────────────────────────────── */
  const init = () => {
    // Force remove boot screen if it's stuck
    setTimeout(() => {
      const boot = document.getElementById('boot-screen');
      if (boot) {
        boot.classList.add('gone');
        setTimeout(() => boot.remove(), 1000);
      }
    }, 500);

    // Event bindings
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    window.addEventListener('message', onMessage);

    // Delegated window control clicks
    document.addEventListener('click', (e) => {
      const minBtn = e.target.closest('[data-win-min]');
      if (minBtn) { minimizeWindow(minBtn.dataset.winMin); return; }
      const maxBtn = e.target.closest('[data-win-max]');
      if (maxBtn) { toggleMaximize(maxBtn.dataset.winMax); return; }
      const closeBtn = e.target.closest('[data-win-close]');
      if (closeBtn) { closeWindow(closeBtn.dataset.winClose); return; }
      const dragBar = e.target.closest('[data-win-drag]');
      if (dragBar) focusWindow(dragBar.dataset.winDrag);
      const smOpen = e.target.closest('[data-sm-open]');
      if (smOpen) { openApp(smOpen.dataset.smOpen); return; }
      // Close context menu
      if (!e.target.closest('#context-menu')) hideContextMenu();
      // Close start menu
      if (!e.target.closest('#start-menu') && !e.target.closest('#start-btn')) {
        document.getElementById('start-menu')?.classList.remove('open');
      }
      // Deselect icons
      if (!e.target.closest('.desktop-icon') && !e.target.closest('#context-menu')) {
        selectedIcons.clear();
        $$('.desktop-icon').forEach(el => el.classList.remove('selected'));
      }
    });

    document.addEventListener('mousedown', (e) => {
      const dragBar = e.target.closest('[data-win-drag]');
      if (dragBar) { startWinDrag(e, dragBar.dataset.winDrag); return; }
      const resizeHandle = e.target.closest('[data-win-resize]');
      if (resizeHandle) { startResize(e, resizeHandle.dataset.winResize); return; }
      const winEl = e.target.closest('.os-window');
      if (winEl) focusWindow(winEl.id);
    });

    // Double-click title bar to maximize
    document.addEventListener('dblclick', (e) => {
      const dragBar = e.target.closest('[data-win-drag]');
      if (dragBar) { toggleMaximize(dragBar.dataset.winDrag); return; }
    });

    // Desktop right-click
    document.addEventListener('contextmenu', (e) => {
      // IF clicking on Webamp, allow native player menu
      if (e.target.closest('#webamp') || e.target.closest('[id^="webamp"]') || e.target.closest('#webamp-os-root')) return;

      if (e.target.closest('.desktop-icon') || e.target.closest('.os-window')) return;
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Open faero', icon: '&#9670;', action: () => openApp('faero') },
        { label: 'Open Settings', icon: '&#9881;', action: () => openApp('settings') },
        'sep',
        { label: 'Change Wallpaper', icon: '&#9728;', action: () => openApp('settings') },
        { label: 'Change Theme', icon: '&#9674;', action: () => openApp('settings') },
      ]);
    });

    // Start button
    document.getElementById('start-btn')?.addEventListener('click', toggleStartMenu);

    buildDesktopIcons();
    buildStartMenu();
    startClock();

    // Init cursor
    const savedCursor = AeroStorage.get('cursorSet', 'default');
    document.body.dataset.cursorSet = savedCursor;

    // Auto-open faero Fullscreen after snappier 2s boot
    setTimeout(() => openApp('faero', { maximized: true }), 2200);
  };

  const injectCursors = (iframe) => {
    try {
      const set = document.body.dataset.cursorSet || 'default';
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.body.dataset.cursorSet = set;
      if (!doc.getElementById('os-cursors')) {
        const link = doc.createElement('link');
        link.id = 'os-cursors';
        link.rel = 'stylesheet';
        link.href = '/css/cursors.css';
        doc.head.appendChild(link);
      }
    } catch (e) { }
  };

  return { init, openApp, closeWindow, minimizeWindow, restoreWindow, toast, APPS, injectCursors };
})();

/* ── DEFAULT ICON FALLBACKS (SVG inline) ─────────────────── */
function getDefaultIcon(id) {
  const icons = {
    faero: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="22" fill="url(#ia)" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" /><defs><linearGradient id="ia" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#4ab8f4" /><stop offset="100%" stop-color="#1a88d4" /></linearGradient></defs><text x="12" y="32" font-size="22" font-family="Nunito,sans-serif" font-weight="900" fill="white">f</text></svg>`,
    photobooth: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="10" width="40" height="30" rx="6" fill="url(#ip)" /><circle cx="24" cy="25" r="9" fill="rgba(255,255,255,0.25)" stroke="white" stroke-width="2" /><circle cx="24" cy="25" r="5" fill="rgba(255,255,255,0.5)" /><defs><linearGradient id="ip" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#e84393" /><stop offset="100%" stop-color="#a020c0" /></linearGradient></defs></svg>`,
    winamp: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="44" height="44" rx="8" fill="#1a1a1a" /><path d="M18 14l18 10-18 10V14z" fill="#54e050" /></svg>`,
    chat: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="8" width="40" height="28" rx="8" fill="url(#ic)" /><path d="M12 36l4-8h20" stroke="none" /><polygon points="10,40 16,34 22,40" fill="url(#ic)" /><defs><linearGradient id="ic" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#f04060" /><stop offset="100%" stop-color="#c02040" /></linearGradient></defs></svg>`,
    emulator: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="6" width="28" height="38" rx="6" fill="url(#ig)" /><rect x="14" y="10" width="20" height="14" rx="2" fill="#90f090" /><circle cx="34" cy="32" r="3" fill="#f04040" /><circle cx="28" cy="32" r="3" fill="#40f040" /><defs><linearGradient id="ig" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#8040d0" /><stop offset="100%" stop-color="#4020a0" /></linearGradient></defs></svg>`,
    notepad: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="4" width="32" height="40" rx="4" fill="white" stroke="#ccc" stroke-width="1" /><line x1="14" y1="16" x2="34" y2="16" stroke="#aad4f5" stroke-width="2" /><line x1="14" y1="22" x2="34" y2="22" stroke="#aad4f5" stroke-width="2" /><line x1="14" y1="28" x2="28" y2="28" stroke="#aad4f5" stroke-width="2" /></svg>`,
    mydocs: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 38V10h20l8 8v20H8z" fill="url(#id)" /><path d="M28 10l8 8h-8V10z" fill="rgba(255,255,255,0.3)" /><defs><linearGradient id="id" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#f8c840" /><stop offset="100%" stop-color="#e09820" /></linearGradient></defs></svg>`,
    settings: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="8" fill="white" stroke="url(#is)" stroke-width="3" /><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11 11l3.5 3.5M33.5 33.5l3.5 3.5M11 37l3.5-3.5M33.5 14.5l3.5-3.5" stroke="url(#is)" stroke-width="3" stroke-linecap="round" /><defs><linearGradient id="is" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#78c0f8" /><stop offset="100%" stop-color="#1a88d4" /></linearGradient></defs></svg>`,
    painter: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="40" height="40" rx="8" fill="white" stroke="#ddd" stroke-width="1" /><circle cx="14" cy="14" r="5" fill="#f04040" /><circle cx="24" cy="14" r="5" fill="#f0c020" /><circle cx="34" cy="14" r="5" fill="#40a0f0" /><rect x="8" y="24" width="32" height="16" rx="4" fill="#f8f8f8" stroke="#ddd" stroke-width="1" /></svg>`,
    ps1: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="20" fill="url(#ip1)" /><path d="M24 12v24M12 24h24" stroke="rgba(255,255,255,0.3)" stroke-width="2" /><circle cx="24" cy="24" r="8" fill="rgba(255,255,255,0.2)" stroke="white" stroke-width="1.5" /><defs><linearGradient id="ip1" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#444" /><stop offset="100%" stop-color="#111" /></linearGradient></defs></svg>`,
    calendar: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="8" width="36" height="34" rx="4" fill="white" stroke="#1a88d4" stroke-width="2" /><rect x="6" y="8" width="36" height="8" rx="0" fill="#1a88d4" /><line x1="14" y1="6" x2="14" y2="12" stroke="#4ab8f4" stroke-width="3" stroke-linecap="round" /><line x1="34" y1="6" x2="34" y2="12" stroke="#4ab8f4" stroke-width="3" stroke-linecap="round" /><text x="12" y="32" font-size="16" font-family="Arial" fill="#1a88d4" font-weight="900">31</text></svg>`,
    games: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 10a4 4 0 0 1 4-4h10l4 4h22a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V10z" fill="url(#ig1)" /><path d="M7 22l6-6-6-6" stroke="white" stroke-width="2" opacity="0.4" /><circle cx="36" cy="14" r="4" fill="#ffd700" opacity="0.8" /><rect x="24" y="24" width="12" height="8" rx="2" fill="white" opacity="0.3" /><defs><linearGradient id="ig1" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#78c0f8" /><stop offset="100%" stop-color="#1a88d4" /></linearGradient></defs></svg>`,
    calculator: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="36" height="36" rx="4" fill="white" stroke="#adb9c5" stroke-width="1.5" /><rect x="10" y="10" width="28" height="8" rx="1" fill="#f8f8f8" stroke="#adb9c5" stroke-width="1" /><rect x="10" y="22" width="6" height="6" rx="1" fill="#e5e5e5" /><rect x="18" y="22" width="6" height="6" rx="1" fill="#e5e5e5" /><rect x="26" y="22" width="6" height="6" rx="1" fill="#e5e5e5" /><rect x="34" y="22" width="6" height="6" rx="1" fill="#d6e9f5" /><rect x="10" y="30" width="6" height="6" rx="1" fill="#e5e5e5" /><rect x="18" y="30" width="6" height="6" rx="1" fill="#e5e5e5" /><rect x="26" y="30" width="6" height="6" rx="1" fill="#e5e5e5" /><rect x="34" y="30" width="6" height="6" rx="1" fill="#1a88d4" /></svg>`,
    radio: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="14" width="40" height="24" rx="4" fill="#1a1b3e" stroke="white" stroke-width="1" /><circle cx="12" cy="26" r="6" fill="#1a88d4" opacity="0.3" /><circle cx="12" cy="26" r="3" fill="#1a88d4" /><rect x="22" y="20" width="18" height="4" rx="2" fill="white" opacity="0.2" /><rect x="22" y="28" width="12" height="4" rx="2" fill="white" opacity="0.2" /><path d="M12 14v-6h24v6" stroke="white" stroke-width="2" stroke-linecap="round" /></svg>`,
    tv: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="10" width="40" height="28" rx="4" fill="#333" stroke="#555" stroke-width="2" /><rect x="8" y="14" width="24" height="20" rx="2" fill="#111" /><rect x="36" y="14" width="4" height="4" rx="2" fill="#444" /><rect x="36" y="20" width="4" height="4" rx="2" fill="#444" /><rect x="36" y="26" width="4" height="8" rx="2" fill="#1a88d4" /><path d="M16 10l-4-6M32 10l4-6" stroke="#555" stroke-width="2" stroke-linecap="round" /></svg>`
  };
  return icons[id] || `<svg viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#1a88d4" /></svg>`;
}

window.OS = OS;
