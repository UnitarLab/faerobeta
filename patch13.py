import re

file_path = r"d:\Antigravity Kode\faero beta\index.html"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the grid version to force a reset
content = content.replace("grid_fixed_v8", "grid_fixed_v12_final")

# 2. Ensure defaultPositions is correct and forced
# We want: 
# Col 1 (x=38): faero, chat, winamp, notepad
# Col 2 (x=138): games, calendar, painter, radio
new_positions = """        const defaultPositions = [
      { id: 'faero', x: 38, y: 28 },
      { id: 'chat', x: 38, y: 128 },
      { id: 'winamp', x: 38, y: 228 },
      { id: 'notepad', x: 38, y: 328 },
      { id: 'games', x: 138, y: 28 },
      { id: 'calendar', x: 138, y: 128 },
      { id: 'painter', x: 138, y: 228 },
      { id: 'radio', x: 138, y: 328 }
    ];"""

# Replace the block
content = re.sub(r"const defaultPositions = \[\s*\{ id: 'faero', x: 38, y: 28 \},.*?\s*\];", new_positions, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Icon grid reset and positions forced.")
