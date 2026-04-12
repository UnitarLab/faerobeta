import re

file_glass = r"d:\Antigravity Kode\faero beta\faero_glass (2).html"
with open(file_glass, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. We must find the Webamp trigger. It's inside a message event listener: `if (e.data.type === 'LAUNCH_WEBAMP')`
m = re.search(r"if\s*\(\w+\.data(\.type)?\s*===\s*['\"]LAUNCH_WEBAMP['\"]\)\s*\{([^}]+)\}", text)
if m:
    print("Found LAUNCH_WEBAMP handler:", m.group(2).strip())
else:
    print("Could not find LAUNCH_WEBAMP handler")
    # Maybe it just calls a function... let's search for "Webamp"
    print("Occurrences of Webamp:")
    [print(l.strip()) for l in text.splitlines() if 'Webamp' in l]

# 2. Fix the 4x2 grid of desktop icons!
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
text = re.sub(r'const defaultPositions = \[.*?\];', new_positions, text, flags=re.DOTALL)

with open(file_glass, 'w', encoding='utf-8') as f:
    f.write(text)
