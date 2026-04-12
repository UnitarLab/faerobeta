import re

file1 = r"d:\Antigravity Kode\faero beta\faero_glass (2).html"
with open(file1, 'r', encoding='utf-8', errors='ignore') as f:
    content1 = f.read()

# Replace all variations of the closed beta text to "Closed beta with limited spaces available"
content1 = re.sub(r'<p id="beta-fine">.*?</p>', '<p id="beta-fine">Closed beta with limited spaces available</p>', content1)

with open(file1, 'w', encoding='utf-8') as f:
    f.write(content1)

print("Patch 3 applied: Fixed beta-fine text")
