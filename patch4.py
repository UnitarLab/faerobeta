import re

file1 = r"d:\Antigravity Kode\faero beta\faero_glass (2).html"
with open(file1, 'r', encoding='utf-8', errors='ignore') as f:
    content1 = f.read()

new_positions = """    const defaultPositions = [
      { id: 'faero', x: 38, y: 28 },
      { id: 'chat', x: 38, y: 128 },
      { id: 'winamp', x: 38, y: 228 },
      { id: 'disposable', x: 38, y: 328 },
      { id: 'docs', x: 38, y: 428 },
      { id: 'notepad', x: 38, y: 528 },
      { id: 'games', x: 138, y: 28 },
      { id: 'calendar', x: 138, y: 128 },
      { id: 'painter', x: 138, y: 228 },
      { id: 'radio', x: 138, y: 328 },
      { id: 'calc', x: 138, y: 428 }
    ];"""

content1 = re.sub(r'const defaultPositions = \[.*?\];', new_positions, content1, flags=re.DOTALL)

with open(file1, 'w', encoding='utf-8') as f:
    f.write(content1)

print("Patch 4 applied: Reordered icons naturally")
