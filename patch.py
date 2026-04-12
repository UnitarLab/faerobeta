import re

filepath = r"d:\Antigravity Kode\faero beta\faero_glass (2).html"
with open(filepath, encoding='utf-8') as f:
    content = f.read()

print(f"File loaded: {len(content)} chars")

# ── 1. Remove TV, PlayStation, Settings from APPS registry ──
# Remove the lines that define tv, ps1, settings in APPS
content = re.sub(r"\s*settings:.*?'settings'\s*\},", "", content, flags=re.DOTALL)
content = content.replace(
    "    ps1: { title: 'PlayStation', icon: '&#128191;', file: 'apps/ps1.html', w: 960, h: 720, minW: 640, minH: 480 },",
    ""
)
content = content.replace(
    "    tv: { title: 'TV', icon: '&#128250;', file: 'apps/tv.html', w: 1024, h: 768, minW: 640, minH: 480 },",
    ""
)
# Be safe with regex fallback
for appId in ['settings', 'ps1', 'tv']:
    content = re.sub(
        r"\s*" + appId + r"\s*:\s*\{[^}]+\},?",
        "",
        content
    )

# ── 2. Remove TV, PlayStation, Settings from defaultPositions ──
content = content.replace("      { id: 'ps1', x: 138, y: 328 },", "")
content = content.replace("      { id: 'settings', x: 138, y: 128 },", "")
content = content.replace("      { id: 'tv', x: 138, y: 628 },", "")

# ── 3. Make 'faero' icon open the beta popup instead of the app ──
old_openapp = "openApp(id);"
# We need to make just the faero icon special. We'll patch the icon-building loop to check for 'faero'
old_click = "        openApp(id);"
new_click = """        if (id === 'faero') { showBetaPopup(); } else { openApp(id); }"""
content = content.replace(old_click, new_click)

# ── 4. Replace popup orb with iframe pointing to liquid metal logo ──
old_orb = '''      <div id="beta-orb">
        <div id="beta-orb-shine"></div>
        <span id="beta-orb-letter">f</span>
      </div>'''
new_orb = '''      <div id="beta-logo-wrap">
        <iframe id="beta-logo-frame" src="http://localhost:5500/faero_liquid_metal_v4.html" scrolling="no" frameborder="0" allowtransparency="true"></iframe>
      </div>'''
content = content.replace(old_orb, new_orb)

# ── 5. Fix description text formatting (no line break before "Glass") ──
old_desc = 'A real internet social OS. Your desktop, your world.<br>Glass, gradients and a future we all dreamed of.'
new_desc = 'A real internet social OS.<br>Your desktop, your world.<br>Glass, gradients and a future we all dreamed of.'
content = content.replace(old_desc, new_desc)

# ── 6. Fix × symbol (HTML entity) ──
content = content.replace('&#215;', '&times;')
# Also fix the × that may be raw (encoding issue from earlier)
content = content.replace('\u00d7</button>', '&times;</button>')

# ── 7. Fix → arrow in the link ──
# The 'â†'' is broken UTF-8 for →
content = content.replace('\u00e2\u0086\u0092', '&rarr;')
# Fix if it shows as â†'
content = content.replace('â†\u0092', '&rarr;')
# Fix literal 
content = content.replace('Request Access \u2192', 'Request Access &rarr;')
content = content.replace('>Request Access \u00e2\u0086\u0092<', '>Request Access &rarr;<')
# The raw arrow from the file
content = content.replace('>Request Access →<', '>Request Access &rarr;<')

# ── 8. Update popup orb CSS - remove orb styles, add logo frame styles ──
old_orb_css = '''    #beta-orb {
      width: 76px; height: 76px;
      border-radius: 50%;
      background: radial-gradient(circle at 38% 28%,
        rgba(255,255,255,0.96) 0%,
        rgba(155,215,255,0.72) 22%,
        rgba(65,150,240,0.56) 52%,
        rgba(22,86,210,0.46) 78%,
        rgba(7,34,128,0.36) 100%);
      border: 1.5px solid rgba(255,255,255,0.82);
      box-shadow:
        0 0 35px rgba(95,175,255,0.68),
        0 0 80px rgba(45,125,240,0.38),
        inset 0 7px 20px rgba(255,255,255,0.20);
      display: flex; align-items: center; justify-content: center;
      position: relative;
      margin-bottom: 22px;
      animation: betaOrbPulse 3s ease-in-out infinite;
    }
    @keyframes betaOrbPulse {
      0%,100% { box-shadow: 0 0 35px rgba(95,175,255,0.68), 0 0 80px rgba(45,125,240,0.38); }
      50%      { box-shadow: 0 0 55px rgba(120,200,255,0.92), 0 0 110px rgba(70,150,255,0.52); }
    }
    #beta-orb-shine {
      position: absolute;
      top: 10%; left: 16%;
      width: 52%; height: 28%;
      background: radial-gradient(ellipse, rgba(255,255,255,0.88), rgba(255,255,255,0.04));
      border-radius: 50%;
      transform: rotate(-18deg);
      filter: blur(1.5px);
    }
    #beta-orb-letter {
      font-family: 'Raleway','Nunito',sans-serif;
      font-weight: 300; font-size: 32px;
      color: rgba(7,34,118,0.93);
      position: relative; z-index: 1;
      text-shadow: 0 1px 7px rgba(255,255,255,0.65);
    }'''
new_orb_css = '''    #beta-logo-wrap {
      width: 200px;
      height: 140px;
      margin-bottom: 18px;
      position: relative;
      overflow: hidden;
      border-radius: 12px;
    }
    #beta-logo-frame {
      width: 800px;
      height: 600px;
      border: none;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.28);
      transform-origin: center center;
      pointer-events: none;
      background: transparent;
    }'''
if old_orb_css in content:
    content = content.replace(old_orb_css, new_orb_css)
    print("Orb CSS replaced OK")
else:
    print("WARNING: orb CSS not found exactly - trying partial match")
    # Try to add after #beta-close styles
    content = content.replace(
        '    #beta-close:hover { background: rgba(255,255,255,0.15); color: #fff; }',
        '    #beta-close:hover { background: rgba(255,255,255,0.15); color: #fff; }\n' + new_orb_css
    )

print(f"File patched: {len(content)} chars")
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done!")
