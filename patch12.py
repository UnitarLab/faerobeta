import re

def inject_seo(file_path, base_url, is_beta=False):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Define tags
    title = "faero OS — Our Promised Future"
    desc = "A real internet social OS. Your desktop, your world. Glass, gradients and a future we all dreamed of. Join the closed beta now."
    image_url = "https://faerobeta.vercel.app/preview.png"
    target_url = base_url + ("beta" if is_beta else "")
    
    seo_tags = f"""
  <meta name="description" content="{desc}">
  <meta name="theme-color" content="#1a88d4">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="{target_url}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{image_url}">

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:url" content="{target_url}">
  <meta property="twitter:title" content="{title}">
  <meta property="twitter:description" content="{desc}">
  <meta property="twitter:image" content="{image_url}">
"""
    
    # Check if head exists
    if "<head>" in content:
        # Check if meta charset exists to put it after
        if '<meta charset="UTF-8">' in content:
            content = content.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">' + seo_tags)
        else:
            content = content.replace("<head>", "<head>" + seo_tags)
            
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

base_url = "https://faerobeta.vercel.app/"
file_index = r"d:\Antigravity Kode\faero beta\index.html"
file_beta = r"d:\Antigravity Kode\faero beta\beta\index.html"

inject_seo(file_index, base_url, is_beta=False)
inject_seo(file_beta, base_url, is_beta=True)

print("SEO Tags injected successfully into index.html and beta/index.html")
