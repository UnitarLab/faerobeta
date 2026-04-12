import os

file_beta = r"d:\Antigravity Kode\faero beta\betainvite.html"
with open(file_beta, 'r', encoding='utf-8') as f:
    text = f.read()
    
# Replace exact discord string
text = text.replace('https://discord.gg/PBqJDevnt', 'https://discord.com/invite/gf8yYG7FzZ')

with open(file_beta, 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated Discord link!")

# Verify desktop grid script execution
file_glass = r"d:\Antigravity Kode\faero beta\faero_glass (2).html"
with open(file_glass, 'r', encoding='utf-8') as f:
    glass_text = f.read()

# Make sure replacing winamplaunchpad happened
glass_text = glass_text.replace('winamplaunchpad.html', 'winamp.html')
# We need to make absolutely sure the old icon positions don't load from AeroStorage
glass_text = glass_text.replace(
    "let savedPositions = AeroStorage.get('desktopIcons', defaultPositions);",
    "let savedPositions = defaultPositions;"
)

with open(file_glass, 'w', encoding='utf-8') as f:
    f.write(glass_text)

print("Updated faero_glass winamp launch and forced defaultPositions")
