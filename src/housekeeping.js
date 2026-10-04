// 数据目录维护：用量统计、am clean、清理提示与新版本提示。
// 提示只打印给 Agent 看（以 "! " 开头的一行），由 Agent 询问用户要不要处理；CLI 从不自动删除或自动更新。
import { readdirSync, statSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const DAY = 24 * 60 * 60 * 1000;
export const CLEAN = Object.freeze({
  days: 30,              // am clean 默认删除 30 天前的页面和视频
  bigBytes: 200 * 2 ** 20, // 超过 200 MB 立即提示
  staleDays: 30,         // 距上次清理超过 30 天……
  staleBytes: 20 * 2 ** 20, // ……且超过 20 MB 时提示
  hintEveryDays: 7,      // 同一提示最多每 7 天出现一次
});
export const UPDATE = Object.freeze({
  checkEveryDays: 7,
  hintEveryDays: 3,
  url: 'https://raw.githubusercontent.com/QingYunA/answer-me-with-html/main/package.json',
});
const DIRS = ['pages', 'videos', 'cache'];

const statePath = (home) => join(home, 'state.json');

export function readState(home) {
  try {
    return JSON.parse(readFileSync(statePath(home), 'utf8'));
  } catch {
    return {};
  }
}

export function writeState(home, patch) {
  const next = { ...readState(home), ...patch };
  mkdirSync(home, { recursive: true });
  writeFileSync(statePath(home), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    const s = statSync(p);
    return [{ path: p, bytes: s.size, mtime: s.mtimeMs }];
  });
}

export function usage(home) {
  const out = { total: 0 };
  for (const d of DIRS) {
    const files = walk(join(home, d));
    const bytes = files.reduce((n, f) => n + f.bytes, 0);
    out[d] = { count: files.length, bytes };
    out.total += bytes;
  }
  return out;
}

// 删除 days 天前的页面与视频，以及全部配音缓存（可重新生成）。all：全部删除（配置保留）。
export function clean(home, { days = CLEAN.days, all = false, dryRun = false, now = Date.now() } = {}) {
  const cutoff = now - days * DAY;
  const victims = [
    ...['pages', 'videos'].flatMap((d) => walk(join(home, d)).filter((f) => all || f.mtime < cutoff)),
    ...walk(join(home, 'cache')),
  ];
  if (!dryRun) {
    for (const f of victims) rmSync(f.path, { force: true });
    writeState(home, { lastClean: now, lastCleanHint: null });
  }
  return { files: victims.length, bytes: victims.reduce((n, f) => n + f.bytes, 0) };
}

export const mb = (bytes) => (bytes < 2 ** 20 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 2 ** 20).toFixed(bytes < 10 * 2 ** 20 ? 1 : 0)} MB`);

// 需要提示清理时返回提示文本，否则返回 null。
export function cleanHint(state, use, now = Date.now()) {
  if (state.lastCleanHint && now - state.lastCleanHint < CLEAN.hintEveryDays * DAY) return null;
  const since = state.lastClean ?? state.firstSeen ?? now;
  const days = Math.floor((now - since) / DAY);
  const big = use.total >= CLEAN.bigBytes;
  const stale = days >= CLEAN.staleDays && use.total >= CLEAN.staleBytes;
  if (!big && !stale) return null;
  const parts = `页面 ${use.pages.count} 个 ${mb(use.pages.bytes)}，视频 ${mb(use.videos.bytes)}，配音缓存 ${mb(use.cache.bytes)}`;
  const when = state.lastClean ? `上次清理在 ${days} 天前` : '还没有清理过';
  return `! 清理提示：数据目录已占用 ${mb(use.total)}（${parts}），${when}。请问用户是否运行 am clean（删除 ${CLEAN.days} 天前的页面和视频，并清空配音缓存；全部清掉用 am clean --all）。`;
}

export function newer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

// 按安装方式给出更新命令。
export function updateCommand(scriptPath = '') {
  if (/[\\/]\.claude[\\/]plugins[\\/]/.test(scriptPath)) {
    return 'Claude Code 里运行 /plugin marketplace update answer-me-with-html，再 /reload-plugins';
  }
  return '运行 npx skills update answer-me-with-html -y';
}

export function updateHint(state, current, scriptPath, now = Date.now()) {
  if (!state.latestVersion || !newer(state.latestVersion, current)) return null;
  if (state.lastUpdateHint && now - state.lastUpdateHint < UPDATE.hintEveryDays * DAY) return null;
  return `! 更新提示：Answer me with HTML 有新版本 ${state.latestVersion}（当前 ${current}）。请问用户是否更新：${updateCommand(scriptPath)}。`;
}

// update_check off、CI、AM_NO_UPDATE_CHECK 同时关掉后台检查和更新提示。
export const updateEnabled = (env, config) => !(config.update_check === false || env.CI || env.AM_NO_UPDATE_CHECK);

export function shouldCheckUpdate(state, env, config, now = Date.now()) {
  if (!updateEnabled(env, config)) return false;
  return !state.lastUpdateCheck || now - state.lastUpdateCheck >= UPDATE.checkEveryDays * DAY;
}

// 在后台子进程里查最新版本，结果写进 state.json，下次运行时再提示；当前命令不等待网络。
export function spawnUpdateCheck(home, scriptPath) {
  writeState(home, { lastUpdateCheck: Date.now() });
  try {
    spawn(process.execPath, [scriptPath, '__update-check'], { detached: true, stdio: 'ignore', env: { ...process.env, AM_HOME: home } })
      .on('error', () => {})
      .unref();
  } catch {
    // 后台检查失败不影响正常使用。
  }
}

export async function runUpdateCheck(home, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(UPDATE.url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const { version } = await res.json();
    if (typeof version !== 'string') return null;
    writeState(home, { latestVersion: version, lastUpdateCheck: Date.now() });
    return version;
  } catch {
    return null;
  }
}

// 每次渲染后调用：记录首次使用时间，返回要打印的提示，并按需安排后台版本检查。
export function afterRender({ home, env, config, current, scriptPath, background, now = Date.now() }) {
  let state = readState(home);
  if (!state.firstSeen) state = writeState(home, { firstSeen: now });
  const hints = [];
  const c = cleanHint(state, usage(home), now);
  if (c) {
    hints.push(c);
    state = writeState(home, { lastCleanHint: now });
  }
  const u = updateEnabled(env, config) ? updateHint(state, current, scriptPath, now) : null;
  if (u) {
    hints.push(u);
    writeState(home, { lastUpdateHint: now });
  }
  if (background && scriptPath && shouldCheckUpdate(state, env, config, now)) spawnUpdateCheck(home, scriptPath);
  return hints;
}

