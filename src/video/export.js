// --mp4：用本机 Chrome（无头模式，经 Chrome DevTools Protocol）逐帧调用播放页的 render(t) 并截图，
// 再交给 ffmpeg 编码 H.264 并合成旁白音轨。不依赖 Playwright / Puppeteer。
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hasCommand } from '../sys.js';

export class ExportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExportError';
  }
}

const CDP_TIMEOUT_MS = 30000;

const CHROME_PATHS = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'],
};

export function findChrome(env = process.env, platform = process.platform) {
  const custom = env.AM_CHROME || env.CHROME_PATH;
  if (custom) return custom;
  const list = CHROME_PATHS[platform] ?? CHROME_PATHS.linux;
  return list.find((p) => (p.includes('/') || p.includes('\\') ? existsSync(p) : hasCommand(p))) ?? null;
}

export async function exportMp4(htmlFile, mp4File, { wav, env = process.env, onProgress = () => {} } = {}) {
  if (typeof WebSocket === 'undefined') throw new ExportError('导出 MP4 需要 Node.js 22 或更高版本（内置 WebSocket）');
  if (!hasCommand('ffmpeg')) throw new ExportError('导出 MP4 需要 ffmpeg：macOS 用 brew install ffmpeg，Linux 用包管理器安装');
  const chromePath = findChrome(env);
  if (!chromePath) throw new ExportError('没有找到 Chrome / Chromium / Edge。可用环境变量 AM_CHROME 指定浏览器路径');

  const tmp = mkdtempSync(join(tmpdir(), 'am-export-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(tmp, 'profile')}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--force-device-scale-factor=1', '--window-size=1920,1080', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let cdp = null;
  try {
    cdp = await connect(await devtoolsUrl(chrome));
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => cdp.send(method, params, sessionId);
    await page('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await page('Page.enable');
    const loaded = cdp.once('Page.loadEventFired');
    await page('Page.navigate', { url: pathToFileURL(htmlFile).href });
    await loaded;
    const evaluate = async (expression) => {
      const r = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new ExportError(`播放页脚本出错：${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    };
    const info = await evaluate('document.fonts.ready.then(() => { window.__amv.exportMode(); return { duration: window.__amv.duration, fps: window.__amv.fps }; })');

    const wavFile = wav ? join(tmp, 'voice.wav') : null;
    if (wav) writeFileSync(wavFile, wav);
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(info.fps), '-c:v', 'mjpeg', '-i', '-',
      ...(wavFile ? ['-i', wavFile] : []),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium',
      ...(wavFile ? ['-c:a', 'aac', '-b:a', '160k', '-shortest'] : []),
      '-movflags', '+faststart', mp4File,
    ], { stdio: ['pipe', 'ignore', 'pipe'] });
    let ffErr = '';
    let exited = false;
    ffmpeg.stderr.on('data', (d) => { ffErr += d; });
    // ffmpeg 提前退出时，写入 stdin 会触发 EPIPE；这里吞掉，由 done 统一报错。
    ffmpeg.stdin.on('error', () => {});
    const done = new Promise((resolve, reject) => {
      ffmpeg.on('error', (e) => { exited = true; reject(new ExportError(`无法运行 ffmpeg：${e.message}`)); });
      ffmpeg.on('close', (code) => {
        exited = true;
        if (code === 0) resolve();
        else reject(new ExportError(`ffmpeg 失败（${code}）：${ffErr.slice(0, 300)}`));
      });
    });
    done.catch(() => {}); // 先挂上处理器，避免帧循环期间出现未处理的 rejection

    const frames = Math.ceil(info.duration * info.fps);
    for (let i = 0; i < frames && !exited; i++) {
      await evaluate(`render(${i / info.fps})`);
      const { data } = await page('Page.captureScreenshot', { format: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } });
      if (exited) break;
      if (!ffmpeg.stdin.write(Buffer.from(data, 'base64'))) {
        await Promise.race([new Promise((r) => ffmpeg.stdin.once('drain', r)), done.catch(() => {})]);
      }
      if (i % 30 === 0 || i === frames - 1) onProgress(i + 1, frames);
    }
    if (!exited) ffmpeg.stdin.end();
    await done;
    return { frames, duration: info.duration };
  } finally {
    cdp?.close();
    await new Promise((r) => {
      if (chrome.exitCode !== null) return r();
      const timer = setTimeout(r, 3000);
      chrome.once('exit', () => { clearTimeout(timer); r(); });
      chrome.kill();
    });
    try {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      // 临时目录清理失败不影响成片。
    }
  }
}

function devtoolsUrl(chrome) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new ExportError('Chrome 启动超时')), 20000);
    chrome.on('error', (e) => { clearTimeout(timer); reject(new ExportError(`无法启动 Chrome：${e.message}`)); });
    chrome.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
  });
}

// 极简 CDP 客户端：请求/响应按 id 配对，事件按方法名一次性等待。
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const waiters = new Map();
    let id = 0;
    ws.addEventListener('error', () => reject(new ExportError('无法连接 Chrome DevTools')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { ok, fail } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) fail(new ExportError(`CDP ${msg.error.message}`));
        else ok(msg.result);
      } else if (msg.method && waiters.has(msg.method)) {
        waiters.get(msg.method)(msg.params);
        waiters.delete(msg.method);
      }
    });
    ws.addEventListener('open', () => resolve({
      send(method, params = {}, sessionId) {
        return new Promise((ok, fail) => {
          const msgId = ++id;
          const timer = setTimeout(() => {
            pending.delete(msgId);
            fail(new ExportError(`Chrome 无响应（${method} 超过 ${CDP_TIMEOUT_MS / 1000} 秒）`));
          }, CDP_TIMEOUT_MS);
          pending.set(msgId, { ok: (v) => { clearTimeout(timer); ok(v); }, fail: (e) => { clearTimeout(timer); fail(e); } });
          ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
      },
      once: (method) => new Promise((r) => waiters.set(method, r)),
      close: () => ws.close(),
    }));
  });
}
