/* ============================================================
   AERONET OS — THEME ENGINE
   ============================================================ */

const ThemeEngine = (() => {
    const THEMES = ['frutiger-aero', 'xp-luna', 'y2k', 'dark-matter', 'geocities'];

    const WALLPAPERS = {
        'frutiger-aero': 'aero',
        'xp-luna': 'xp',
        'y2k': 'y2k',
        'dark-matter': 'dark',
        'geocities': 'geocities'
    };

    let current = AeroStorage.get('theme', 'frutiger-aero');

    const apply = (themeName) => {
        if (!THEMES.includes(themeName)) return;
        current = themeName;
        document.body.dataset.theme = themeName;
        AeroStorage.set('theme', themeName);

        // Wallpaper
        const wp = AeroStorage.get('wallpaper', null);
        const wallLayer = document.getElementById('wallpaper-layer');
        if (wallLayer) {
            if (wp && wp.startsWith('data:')) {
                wallLayer.style.backgroundImage = `url('${wp}')`;
            } else {
                wallLayer.style.backgroundImage = `none`;
                // Inline SVG wallpapers rendered via JS
                renderWallpaper(themeName, wallLayer);
            }
        }

        // Cursor reset
        document.body.style.cursor = 'auto';

        // Notify iframes
        document.querySelectorAll('iframe.app-frame').forEach(iframe => {
            try {
                iframe.contentWindow.postMessage({ type: 'THEME_CHANGE', theme: themeName }, '*');
            } catch (e) { }
        });
    };

    const renderWallpaper = (theme, el) => {
        const configs = {
            'frutiger-aero': {
                bg: 'linear-gradient(160deg, #7ec8e3 0%, #a8dcf0 30%, #c5eeff 60%, #a0d8ec 100%)',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
          <defs>
            <radialGradient id="g1" cx="30%" cy="0%" r="60%"><stop offset="0%" stop-color="#a0d8f0" stop-opacity="0.6"/><stop offset="100%" stop-color="transparent"/></radialGradient>
            <radialGradient id="g2" cx="80%" cy="100%" r="50%"><stop offset="0%" stop-color="#80c8e8" stop-opacity="0.5"/><stop offset="100%" stop-color="transparent"/></radialGradient>
            <filter id="blur1"><feGaussianBlur stdDeviation="40"/></filter>
          </defs>
          <rect width="1920" height="1080" fill="url(#g1)"/>
          <rect width="1920" height="1080" fill="url(#g2)"/>
          <!-- Hills -->
          <ellipse cx="400" cy="1200" rx="900" ry="500" fill="#5ab882" opacity="0.7"/>
          <ellipse cx="1200" cy="1300" rx="1100" ry="600" fill="#3da068" opacity="0.6"/>
          <ellipse cx="960" cy="1400" rx="1400" ry="700" fill="#2a9050" opacity="0.5"/>
          <!-- Sky orbs -->
          <circle cx="300" cy="200" r="200" fill="#a0d0f8" opacity="0.25" filter="url(#blur1)"/>
          <circle cx="1600" cy="300" r="160" fill="#80e0ff" opacity="0.2" filter="url(#blur1)"/>
          <circle cx="960" cy="100" r="300" fill="#c8f0ff" opacity="0.2" filter="url(#blur1)"/>
        </svg>`
            },
            'xp-luna': {
                bg: '#3a72c8',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
          <defs>
            <radialGradient id="sky" cx="50%" cy="40%" r="70%"><stop offset="0%" stop-color="#78c4f8"/><stop offset="100%" stop-color="#3a72c8"/></radialGradient>
          </defs>
          <rect width="1920" height="1080" fill="url(#sky)"/>
          <ellipse cx="300" cy="1000" rx="700" ry="400" fill="#5ab83c" opacity="0.9"/>
          <ellipse cx="1200" cy="1100" rx="900" ry="500" fill="#48a028" opacity="0.85"/>
          <ellipse cx="960" cy="1180" rx="1400" ry="600" fill="#3a8a1c" opacity="0.9"/>
          <ellipse cx="1700" cy="980" rx="600" ry="350" fill="#5ab83c" opacity="0.8"/>
          <circle cx="960" cy="300" r="180" fill="#fff8c8" opacity="0.12"/>
        </svg>`
            },
            'y2k': {
                bg: '#0a0010',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
          <defs>
            <radialGradient id="gy" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#2a0050"/><stop offset="100%" stop-color="#050010"/></radialGradient>
          </defs>
          <rect width="1920" height="1080" fill="url(#gy)"/>
          <!-- Grid lines -->
          <g stroke="#ff00ff" stroke-width="0.5" opacity="0.15">
            ${Array.from({ length: 30 }, (_, i) => `<line x1="${i * 64}" y1="0" x2="${i * 64}" y2="1080"/>`).join('')}
            ${Array.from({ length: 17 }, (_, i) => `<line x1="0" y1="${i * 64}" x2="1920" y2="${i * 64}"/>`).join('')}
          </g>
          <!-- Star bursts -->
          <circle cx="400" cy="200" r="3" fill="#ff88ff" opacity="0.8"/>
          <circle cx="1500" cy="150" r="2" fill="#88ffff" opacity="0.7"/>
          <circle cx="960" cy="400" r="4" fill="#ff44ff" opacity="0.6"/>
          <circle cx="200" cy="600" r="2" fill="#ff00ff" opacity="0.9"/>
          <circle cx="1700" cy="700" r="3" fill="#44ffff" opacity="0.7"/>
          <!-- Chrome orbs -->
          <circle cx="960" cy="540" r="300" fill="none" stroke="#ff00ff" stroke-width="1" opacity="0.1"/>
          <circle cx="960" cy="540" r="450" fill="none" stroke="#8800ff" stroke-width="0.5" opacity="0.08"/>
        </svg>`
            },
            'dark-matter': {
                bg: '#060610',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
          <defs>
            <radialGradient id="gd" cx="40%" cy="30%" r="60%"><stop offset="0%" stop-color="#1a1a4a"/><stop offset="100%" stop-color="#030308"/></radialGradient>
          </defs>
          <rect width="1920" height="1080" fill="url(#gd)"/>
          ${Array.from({ length: 80 }, () => {
                    const x = Math.random() * 1920, y = Math.random() * 1080, r = Math.random() * 1.5 + 0.5;
                    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="#8080ff" opacity="${(Math.random() * 0.6 + 0.2).toFixed(2)}"/>`;
                }).join('')}
          <circle cx="400" cy="300" r="200" fill="#3030aa" opacity="0.15" filter="url(#b)"/>
          <defs><filter id="b"><feGaussianBlur stdDeviation="60"/></filter></defs>
          <circle cx="1500" cy="700" r="250" fill="#2020aa" opacity="0.12" filter="url(#b)"/>
        </svg>`
            },
            'geocities': {
                bg: '#000080',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
          <rect width="1920" height="1080" fill="#000080"/>
          <g opacity="0.08">
            ${Array.from({ length: 20 }, (_, i) => Array.from({ length: 12 }, (_, j) =>
                    `<rect x="${i * 96 + 8}" y="${j * 90 + 8}" width="80" height="74" fill="none" stroke="#ffff00" stroke-width="1"/>`
                ).join('')).join('')}
          </g>
          <!-- Stars -->
          ${Array.from({ length: 50 }, () => {
                    const x = Math.random() * 1920, y = Math.random() * 1080;
                    return `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" font-size="12" fill="#ffff00" opacity="0.4">*</text>`;
                }).join('')}
        </svg>`
            }
        };

        const cfg = configs[theme];
        if (!cfg) return;
        el.style.backgroundColor = cfg.bg;
        const blob = new Blob([cfg.svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        el.style.backgroundImage = `url('${url}')`;
    };

    const init = () => {
        apply(current);
    };

    const get = () => current;
    const list = () => THEMES;

    return { init, apply, get, list };
})();

window.ThemeEngine = ThemeEngine;
