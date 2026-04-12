import re

# 1. Update betainvite.html Discord link
file_beta = r"d:\Antigravity Kode\faero beta\betainvite.html"
with open(file_beta, 'r', encoding='utf-8', errors='ignore') as f:
    content_beta = f.read()

# Try to replace href="#" or similar inside the discord button
# Button might look like: <a href="some_link" class="soc-btn soc-discord">
content_beta = re.sub(
    r'(<a[^>]*class="[^"]*soc-discord[^"]*"[^>]*)href="[^"]*"',
    r'\1href="https://discord.com/invite/gf8yYG7FzZ" target="_blank"',
    content_beta
)
with open(file_beta, 'w', encoding='utf-8') as f:
    f.write(content_beta)

# 2. Update faero_glass (2).html grid and winamp link
file_glass = r"d:\Antigravity Kode\faero beta\faero_glass (2).html"
with open(file_glass, 'r', encoding='utf-8', errors='ignore') as f:
    content_glass = f.read()

# Fix desktop gaps: Replace ANY usage of AeroStorage.get('desktopIcons'... with just defaultPositions
content_glass = re.sub(
    r'(AeroStorage|faeroStorage)\.get\(\'desktopIcons\'[^)]*\)',
    'defaultPositions',
    content_glass
)
content_glass = re.sub(
    r"localStorage\.getItem\('aero_desktopIcons'\)",
    "null",
    content_glass
)

# Force the nicely packed default positions grid
new_positions = """    const defaultPositions = [
      { id: 'faero', x: 38, y: 28 },
      { id: 'chat', x: 38, y: 128 },
      { id: 'winamp', x: 38, y: 228 },
      { id: 'notepad', x: 38, y: 328 },
      { id: 'games', x: 138, y: 28 },
      { id: 'calendar', x: 138, y: 128 },
      { id: 'painter', x: 138, y: 228 },
      { id: 'radio', x: 138, y: 328 }
    ];"""
content_glass = re.sub(r'const defaultPositions = \[.*?\];', new_positions, content_glass, flags=re.DOTALL)

# Winamp direct launch: replace apps/winamplaunchpad.html with apps/winamp.html
content_glass = content_glass.replace("'apps/winamplaunchpad.html'", "'apps/winamp.html'")

# Write changes
with open(file_glass, 'w', encoding='utf-8') as f:
    f.write(content_glass)

print("Patch 6 applied: fixed discord link, desktop gaps forced reset, and winamp direct launch")
