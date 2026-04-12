import re

file1 = r"d:\Antigravity Kode\faero beta\faero_glass (2).html"
with open(file1, 'r', encoding='utf-8', errors='ignore') as f:
    content1 = f.read()

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

content1 = re.sub(r'const defaultPositions = \[.*?\];', new_positions, content1, flags=re.DOTALL)

# Let's force reset the local storage for the icons so that the beautifully packed layout applies
content1 = content1.replace(
    "let savedPositions = AeroStorage.get('desktopIcons', defaultPositions);",
    "AeroStorage.remove('desktopIcons');\n    let savedPositions = defaultPositions;"
)

with open(file1, 'w', encoding='utf-8') as f:
    f.write(content1)

print("Patch 5 applied: Packed 8 icons neatly and forced a layout reset")
