import os
import shutil

# 1. Update index.html to remove localhost link
file_index = r"d:\Antigravity Kode\faero beta\index.html"
with open(file_index, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("http://localhost:5500/faero_liquid_metal_v4.html", "faero_liquid_metal_v4.html")

with open(file_index, 'w', encoding='utf-8') as f:
    f.write(text)

# 2. Make the /beta slug bulletproof
beta_dir = r"d:\Antigravity Kode\faero beta\beta"
os.makedirs(beta_dir, exist_ok=True)
if os.path.exists(r"d:\Antigravity Kode\faero beta\betainvite.html"):
    shutil.move(r"d:\Antigravity Kode\faero beta\betainvite.html", os.path.join(beta_dir, "index.html"))

# 3. Simplify vercel.json so it doesn't conflict
vercel_json = r"d:\Antigravity Kode\faero beta\vercel.json"
vercel_content = """{
  "cleanUrls": true,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "max-age=0, s-maxage=86400, stale-while-revalidate"
        }
      ]
    }
  ]
}"""
with open(vercel_json, 'w', encoding='utf-8') as f:
    f.write(vercel_content)

print("Patch 11 applied.")
