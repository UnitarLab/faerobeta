import re

file1 = r"d:\Antigravity Kode\faero beta\faero_glass (2).html"
with open(file1, 'r', encoding='utf-8', errors='ignore') as f:
    content1 = f.read()

# Fix mangled strings (these can happen if UTF-8 was read/written as cp1252)
content1 = content1.replace('<button id="beta-close" onclick="closeBetaPopup()" title="Close">Ã—</button>', '<button id="beta-close" onclick="closeBetaPopup()" title="Close">&times;</button>')
content1 = content1.replace('Request Access â†’', 'Request Access &rarr;')
content1 = content1.replace('Closed beta â€”', 'Closed beta &mdash;')
content1 = content1.replace('Closed beta â€" limited spaces', 'Closed beta &mdash; limited spaces')

# Fallback regex just in case
content1 = re.sub(r'<button id="beta-close"[^>]*>.*?</button>', '<button id="beta-close" onclick="closeBetaPopup()" title="Close">&times;</button>', content1)
content1 = re.sub(r'Request Access .*?</a>', 'Request Access &rarr;</a>', content1)
content1 = re.sub(r'Closed beta .*? limited spaces', 'Closed beta &mdash; limited spaces', content1)

with open(file1, 'w', encoding='utf-8') as f:
    f.write(content1)

file2 = r"d:\Antigravity Kode\faero beta\faero_liquid_metal_v4.html"
with open(file2, 'r', encoding='utf-8', errors='ignore') as f:
    content2 = f.read()

content2 = content2.replace('background: #000;', 'background: transparent;')
content2 = content2.replace('background:#000;', 'background:transparent;')
content2 = content2.replace('background:#000', 'background:transparent')

with open(file2, 'w', encoding='utf-8') as f:
    f.write(content2)

print("Patch 2 applied.")
