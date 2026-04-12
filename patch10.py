import re

file_glass = r"d:\Antigravity Kode\faero beta\faero_glass (2).html"
with open(file_glass, 'r', encoding='utf-8') as f:
    text = f.read()

# Make double-clicking winamp icon launch webamp directly by sending the message
old_click = "if (id === 'faero') { showBetaPopup(); } else { openApp(id); }"
new_click = "if (id === 'faero') { showBetaPopup(); } else if (id === 'winamp') { window.postMessage({ type: 'LAUNCH_WEBAMP' }, '*'); } else { openApp(id); }"
text = text.replace(old_click, new_click)

with open(file_glass, 'w', encoding='utf-8') as f:
    f.write(text)

print("Patch 10 applied: Winamp icon directly launches Webamp!")
