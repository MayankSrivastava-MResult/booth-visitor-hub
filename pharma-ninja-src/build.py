"""Build Pharma Ninja into ONE self-contained, offline HTML file.

Usage:  python3 build.py              -> dist/pharma-ninja.html (standalone; runs from a file, no Hub)
        python3 build.py OUT.html     -> custom output path
        python3 build.py --hub DIR    -> DIR/pharma-ninja.html + DIR/play-sw.js, served by the
                                         Booth Visitor Hub at /play (run by the Hub's own build)
Optional: --allow-origin https://hub.example  (see the offline rule below)

Inlines: Phaser 3.90.0 (vendor/), Barlow and Barlow Condensed WOFF2 (vendor/fonts/,
SIL OFL), the reversed MResult logo (assets/), seed data and app code (src/).
Fails the build if any seed question breaks the capsule rules, or if the output
references any external http(s) URL. Never hand-edit the built HTML: change src/ and rebuild.

Offline rule: the page may load nothing from any external origin, and the game's own
code (app.js, the template, the service worker) may contain no absolute http(s) URL
at all, except the --allow-origin value if given. The game talks to the Hub with
relative paths (same origin), so normally no origin needs allowing.
"""
import base64, hashlib, subprocess, sys, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
SRC, VENDOR = ROOT / 'src', ROOT / 'vendor'

args = sys.argv[1:]
def take(flag):
    if flag in args:
        i = args.index(flag); val = args[i + 1]; del args[i:i + 2]; return val
    return None
HUB_DIR = take('--hub')
ALLOW_ORIGIN = take('--allow-origin')
if HUB_DIR: OUT = pathlib.Path(HUB_DIR) / 'pharma-ninja.html'
elif args: OUT = pathlib.Path(args[0])
else: OUT = ROOT / 'dist' / 'pharma-ninja.html'

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
sw = (SRC / 'sw.template.js').read_text()
own = [u for u in re.findall(r'https?://[^\s"\'`<>)]+', app + (SRC / 'index.template.html').read_text() + sw)
       if not (ALLOW_ORIGIN and u.startswith(ALLOW_ORIGIN))]
assert not own, f'absolute URLs in the game code (only same-origin paths are allowed): {own}'

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html)
print(f'Wrote {OUT} ({OUT.stat().st_size/1024/1024:.2f} MB)')

# 3. Hub mode: the service worker that keeps /play working offline. Its cache name
#    carries a hash of this build, so a new build replaces the old cached copy.
if HUB_DIR:
    version = hashlib.sha256(html.encode()).hexdigest()[:16]
    assert sw.count('__VERSION__') == 1, 'sw.template.js must contain __VERSION__ exactly once'
    sw_out = pathlib.Path(HUB_DIR) / 'play-sw.js'
    sw_out.write_text(sw.replace('__VERSION__', version))
    print(f'Wrote {sw_out} (cache version {version})')
