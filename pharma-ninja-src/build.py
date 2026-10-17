"""Build Pharma Ninja into ONE self-contained, offline HTML file.

Usage:  python3 build.py            -> dist/pharma-ninja.html
        python3 build.py OUT.html   -> custom output path

Inlines: Phaser 3.90.0 (vendor/), Barlow and Barlow Condensed WOFF2 (vendor/fonts/,
SIL OFL), the reversed MResult logo (assets/), seed data and app code (src/).
Fails the build if any seed question breaks the capsule rules, or if the output
references any external http(s) URL. Never hand-edit the built HTML: change src/ and rebuild.
"""
import base64, subprocess, sys, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
SRC, VENDOR = ROOT / 'src', ROOT / 'vendor'
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'dist' / 'pharma-ninja.html'

def b64(p): return base64.b64encode(pathlib.Path(p).read_bytes()).decode()

# 1. validate seed questions (needs Node)
r = subprocess.run(['node', str(SRC / 'validate.js')], capture_output=True, text=True)
print(r.stdout.strip() or r.stderr.strip())
if r.returncode: sys.exit('Seed data failed validation')

phaser = (VENDOR / 'phaser-3.90.0-arcade-physics.min.js').read_text()
html = (SRC / 'index.template.html').read_text()
app = (SRC / 'app.js').read_text()
data = (SRC / 'data.js').read_text()
for js in (phaser, app, data): assert '</script' not in js.lower(), 'closing script tag inside inlined JS'

fonts = VENDOR / 'fonts'
subs = {
    '__FONT_B500__': b64(fonts / 'barlow-latin-500-normal.woff2'),
    '__FONT_B600__': b64(fonts / 'barlow-latin-600-normal.woff2'),
    '__FONT_C700__': b64(fonts / 'barlow-condensed-latin-700-normal.woff2'),
    '__FONT_C800__': b64(fonts / 'barlow-condensed-latin-800-normal.woff2'),
    '__FONT_C800I__': b64(fonts / 'barlow-condensed-latin-800-italic.woff2'),
    '__LOGO__': b64(ROOT / 'assets' / 'mresult-logo-reversed.png'),
    '__DATA__': data, '__APP__': app, '__PHASER__': phaser,
}
for k, v in subs.items():
    assert html.count(k) == 1, f'placeholder {k} must appear exactly once'
    html = html.replace(k, v)

# 2. offline check: nothing may be fetched from an external origin at runtime
urls = re.findall(r'(?:src|href)\s*=\s*["\']https?://', html) + re.findall(r'url\(\s*["\']?https?://', html)
assert not urls, f'external references found: {urls}'

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html)
print(f'Wrote {OUT} ({OUT.stat().st_size/1024/1024:.2f} MB)')
