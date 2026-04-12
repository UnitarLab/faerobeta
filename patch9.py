import re

file_glass = r"d:\Antigravity Kode\faero beta\faero_glass (2).html"
with open(file_glass, 'r', encoding='utf-8') as f:
    text = f.read()

lines = text.splitlines()
idx = [i for i, l in enumerate(lines) if 'const webamp = new WebampClass' in l]
if idx:
    start = max(0, idx[0] - 15)
    end = min(len(lines), idx[0] + 15)
    print("Webamp code block:\n")
    print('\n'.join(lines[start:end]))
