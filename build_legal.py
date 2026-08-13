"""Build styled HTML legal pages from the markdown sources.

Browsers serve .md as plain text, so the in-app Terms/Privacy links showed a
wall of unstyled markdown. This renders them into real pages that match the
Faero UI, keeping the .md files as the single source of truth.

Run after editing either document:

    python build_legal.py
"""

import html
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))

DOCS = [
    ("TERMS_OF_SERVICE.md", "terms.html", "Terms of Service"),
    ("PRIVACY_POLICY.md", "privacy.html", "Privacy Policy"),
]

SHELL = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} · Faero</title>
<meta name="description" content="{title} for Faero, operated by Unitar LLC.">
<meta name="theme-color" content="#1565C0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D1B2A" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="index,follow">
<link rel="icon" type="image/svg+xml" href="icons/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;600;700;800&display=swap" rel="stylesheet">
<style>
:root {{
  --leaf:#1565C0; --leaf2:#1976D2; --leaf3:#64B5F6; --sun:#00BCD4;
  --bg:#E3F2FD; --bg2:#BBDEFB; --paper:#F7FBFF;
  --text:#0D1B2A; --text2:#1A3A5C; --text3:#4A7FA5; --border:#BBDEFB;
}}
@media (prefers-color-scheme: dark) {{
  :root {{
    --bg:#0B1622; --bg2:#122234; --paper:#101E2E;
    --text:#E8F1FA; --text2:#B8CFE4; --text3:#7C9DBC; --border:#1E3A52;
  }}
}}
* {{ box-sizing:border-box; }}
body {{
  margin:0; background:var(--bg); color:var(--text);
  font:400 16px/1.7 'Exo 2', system-ui, sans-serif;
  -webkit-font-smoothing:antialiased;
}}
.topbar {{
  position:sticky; top:0; z-index:10;
  display:flex; align-items:center; gap:12px;
  padding:12px 20px;
  background:linear-gradient(180deg, var(--leaf2), var(--leaf));
  box-shadow:0 2px 14px rgba(13,27,42,.22);
}}
.brand {{
  display:inline-flex; align-items:center; gap:8px;
  color:#fff; font-weight:800; letter-spacing:.06em; font-size:15px;
  text-decoration:none;
}}
.brand img {{ width:26px; height:26px; border-radius:50%; }}
.back {{
  margin-left:auto; color:#fff; text-decoration:none; font-size:13.5px;
  font-weight:600; padding:6px 13px; border-radius:999px;
  border:1px solid rgba(255,255,255,.45); white-space:nowrap;
}}
.back:hover {{ background:rgba(255,255,255,.16); }}

main {{
  max-width:820px; margin:0 auto; padding:30px 22px 90px;
}}
.doc {{
  background:var(--paper); border:1px solid var(--border);
  border-radius:16px; padding:34px 38px 42px;
  box-shadow:0 4px 30px rgba(21,101,192,.09);
}}
h1 {{ font-size:30px; font-weight:800; line-height:1.25; margin:0 0 6px; letter-spacing:-.01em; }}
h2 {{
  font-size:21px; font-weight:700; margin:38px 0 12px; padding-top:14px;
  border-top:1px solid var(--border); scroll-margin-top:70px;
}}
h3 {{ font-size:16.5px; font-weight:700; margin:24px 0 8px; color:var(--text2); scroll-margin-top:70px; }}
p {{ margin:0 0 14px; color:var(--text2); }}
strong {{ color:var(--text); font-weight:700; }}
a {{ color:var(--leaf); }}
a:hover {{ text-decoration:none; }}
ul, ol {{ margin:0 0 16px; padding-left:22px; color:var(--text2); }}
li {{ margin-bottom:7px; }}
hr {{ border:none; border-top:1px solid var(--border); margin:26px 0; }}
blockquote {{
  margin:0 0 18px; padding:13px 18px;
  background:rgba(0,188,212,.09); border-left:4px solid var(--sun);
  border-radius:0 10px 10px 0; color:var(--text2);
}}
blockquote p:last-child {{ margin-bottom:0; }}
code {{
  font-family:ui-monospace, 'Space Mono', monospace; font-size:.88em;
  background:var(--bg2); padding:2px 6px; border-radius:5px; color:var(--text);
}}
.table-wrap {{ overflow-x:auto; margin:0 0 18px; }}
table {{ border-collapse:collapse; width:100%; font-size:14.5px; min-width:440px; }}
th, td {{ text-align:left; padding:9px 12px; border-bottom:1px solid var(--border); vertical-align:top; }}
th {{ background:var(--bg2); font-weight:700; color:var(--text); white-space:nowrap; }}
td {{ color:var(--text2); }}
.meta {{
  display:flex; flex-wrap:wrap; gap:8px; margin:0 0 22px;
}}
.chip {{
  font-size:12px; font-weight:600; padding:4px 11px; border-radius:999px;
  background:var(--bg2); color:var(--text2);
}}
.toc {{
  background:var(--bg); border:1px solid var(--border);
  border-radius:12px; padding:16px 20px; margin:0 0 26px;
}}
.toc-title {{ font-size:12px; font-weight:700; text-transform:uppercase;
  letter-spacing:.07em; color:var(--text3); margin-bottom:8px; }}
.toc ol {{ margin:0; padding-left:20px; }}
.toc li {{ margin-bottom:4px; }}
footer {{
  max-width:820px; margin:0 auto; padding:0 22px 50px;
  color:var(--text3); font-size:13px; text-align:center;
}}
footer a {{ color:var(--text3); }}
@media (max-width:620px) {{
  body {{ font-size:15.5px; }}
  .doc {{ padding:24px 20px 30px; border-radius:14px; }}
  main {{ padding:18px 12px 70px; }}
  h1 {{ font-size:25px; }}
  h2 {{ font-size:19px; }}
}}
@media print {{
  .topbar, .back, footer {{ display:none; }}
  body {{ background:#fff; }}
  .doc {{ border:none; box-shadow:none; padding:0; }}
}}
</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="faero_v1_launch.html">
    <img src="icons/icon.svg" alt="">FAERO
  </a>
  <a class="back" href="faero_v1_launch.html">&larr; Back to Faero</a>
</header>
<main>
  <article class="doc">
{body}
  </article>
</main>
<footer>
  Faero is operated by <strong>Unitar LLC</strong> &middot;
  <a href="terms.html">Terms</a> &middot;
  <a href="privacy.html">Privacy</a> &middot;
  <a href="mailto:contact@unitar.app">Contact</a>
</footer>
</body>
</html>
"""


def slug(text):
    s = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_]+", "-", s).strip("-")


# The markdown sources link to each other as .md, which is correct for the
# markdown but serves as unstyled plain text in a browser. Rewrite those two
# links to the pages we generate here.
MD_TO_HTML = {
    "TERMS_OF_SERVICE.md": "terms.html",
    "PRIVACY_POLICY.md":   "privacy.html",
}


def inline(text):
    """Escape, then re-apply the inline markdown we allow."""
    out = html.escape(text, quote=False)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\[([^\]]+)\]\(([^)]+)\)",
                 lambda m: '<a href="%s">%s</a>' % (
                     html.escape(MD_TO_HTML.get(m.group(2), m.group(2)), quote=True),
                     m.group(1)),
                 out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<em>\1</em>", out)
    return out


def convert(md):
    lines = md.split("\n")
    out, i = [], 0
    in_ul = in_ol = False

    def close_lists():
        nonlocal in_ul, in_ol
        if in_ul:
            out.append("</ul>"); in_ul = False
        if in_ol:
            out.append("</ol>"); in_ol = False

    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()

        # table
        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            close_lists()
            headers = [c.strip() for c in line.strip("|").split("|")]
            out.append('<div class="table-wrap"><table><thead><tr>')
            out.extend("<th>%s</th>" % inline(h) for h in headers)
            out.append("</tr></thead><tbody>")
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                out.append("<tr>" + "".join("<td>%s</td>" % inline(c) for c in cells) + "</tr>")
                i += 1
            out.append("</tbody></table></div>")
            continue

        if not line.strip():
            close_lists()
            i += 1
            continue

        if re.match(r"^---+$", line.strip()):
            close_lists(); out.append("<hr>"); i += 1; continue

        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            close_lists()
            lvl, txt = len(m.group(1)), m.group(2).strip()
            out.append('<h%d id="%s">%s</h%d>' % (lvl, slug(txt), inline(txt), lvl))
            i += 1
            continue

        if line.lstrip().startswith("> "):
            close_lists()
            buf = []
            while i < len(lines) and lines[i].lstrip().startswith(">"):
                buf.append(lines[i].lstrip().lstrip(">").strip())
                i += 1
            out.append("<blockquote><p>%s</p></blockquote>" % inline(" ".join(buf).strip()))
            continue

        m = re.match(r"^\s*[-*]\s+(.*)$", line)
        if m:
            if in_ol:
                out.append("</ol>"); in_ol = False
            if not in_ul:
                out.append("<ul>"); in_ul = True
            out.append("<li>%s</li>" % inline(m.group(1)))
            i += 1
            continue

        m = re.match(r"^\s*\d+\.\s+(.*)$", line)
        if m:
            if in_ul:
                out.append("</ul>"); in_ul = False
            if not in_ol:
                out.append("<ol>"); in_ol = True
            out.append("<li>%s</li>" % inline(m.group(1)))
            i += 1
            continue

        # paragraph: gather until blank
        close_lists()
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(
                r"^(#{1,4}\s|\s*[-*]\s|\s*\d+\.\s|>|\||---+$)", lines[i].strip()):
            buf.append(lines[i].strip())
            i += 1
        if buf:
            out.append("<p>%s</p>" % inline(" ".join(buf)))

    close_lists()
    return "\n".join(out)


def main():
    for src, dest, title in DOCS:
        path = os.path.join(HERE, src)
        if not os.path.exists(path):
            print("skip (missing): %s" % src)
            continue

        md = open(path, encoding="utf-8").read()
        body = convert(md)

        # Wrap the leading table-of-contents list in its own styled box.
        body = re.sub(
            r'(<h2 id="table-of-contents">Table of Contents</h2>)\s*(<ol>.*?</ol>)',
            r'\1<div class="toc"><div class="toc-title">Contents</div>\2</div>',
            body, count=1, flags=re.S)

        out_path = os.path.join(HERE, dest)
        open(out_path, "w", encoding="utf-8").write(
            SHELL.format(title=title, body=body))
        print("wrote %s (%d KB)" % (dest, len(open(out_path, encoding='utf-8').read()) // 1024))


if __name__ == "__main__":
    main()
