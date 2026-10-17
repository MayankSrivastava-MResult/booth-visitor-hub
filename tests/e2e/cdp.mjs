// Minimal Chrome DevTools Protocol harness for the end-to-end tests (no extra
// dependencies). Uses a persistent browser profile, so the game's service worker
// and saved data survive between steps, exactly like a real game screen.
// Chrome location: CHROME_PATH, or the standard macOS install.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch(profile, { width = 1920, height = 1080, port = 9334 } = {}) {
  fs.mkdirSync(profile, { recursive: true });
  const chrome = spawn(CHROME,
    ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars',
     '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let target;
  for (let i = 0; i < 80 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!target) await sleep(200);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const events = [];
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else events.push(d); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const api = {
    sleep, events, send,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
      return r.result?.result?.value;
    },
    async waitFor(expr, ms = 15000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await api.eval(expr)) return true; } catch {} await sleep(150); }
      throw new Error('timed out waiting for: ' + expr);
    },
    async goto(url) {
      events.length = 0;
      await send('Page.navigate', { url });
      for (let i = 0; i < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); i++) await sleep(100);
    },
    async shot(file, w = width, h = height) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await sleep(400);
      const s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(s.result.data, 'base64'));
    },
    errors() {
      return events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
        || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
        .map((e) => e.params.exceptionDetails?.exception?.description ?? e.params.exceptionDetails?.text ?? e.params.entry?.text
          ?? e.params.args?.map((a) => a.value ?? a.description).join(' '));
    },
    requests() { return events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url); },
    async close() { ws.close(); chrome.kill(); await sleep(500); },
  };
  return api;
}
