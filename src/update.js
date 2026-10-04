// 新版本提示：每周在后台子进程里读一次 GitHub 上的 package.json，结果写进 state.json；
// 下次渲染时若有新版本，打印一行 "! 更新提示" 给 Agent，由 Agent 询问用户。从不自动更新。
import { spawn } from 'node:child_process';
import { DAY, writeState } from './state.js';

export const UPDATE = Object.freeze({
  checkEveryDays: 7,
  hintEveryDays: 3,
  timeoutMs: 5000,
  url: 'https://raw.githubusercontent.com/QingYunA/answer-me-with-html/main/package.json',
});

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(v) {
  const m = String(v).trim().match(SEMVER);
  return m ? m.slice(1, 4).map(Number) : null;
}

// a 是否比 b 新。任一方不是 x.y.z 格式时返回 false。
export function newer(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return false;
  const i = pa.findIndex((n, k) => n !== pb[k]);
  return i !== -1 && pa[i] > pb[i];
}

// 按安装方式给出更新命令。scriptPath 是正在运行的 am 脚本路径。
export function updateCommand(scriptPath = '') {
  if (/[\\/]\.claude[\\/]plugins[\\/]/.test(scriptPath)) {
    return '终端运行 claude plugin update answer-me-with-html@answer-me-with-html（或在 /plugin 的 Installed 页点 Update now），再 /reload-plugins';
  }
  if (/[\\/]bin[\\/]am\.js$/.test(scriptPath)) {
    return '在 answer-me-with-html 仓库目录运行 git pull && npm install';
  }
  return '运行 npx skills update answer-me-with-html -y';
}

// update_check off、CI、AM_NO_UPDATE_CHECK 同时关掉后台检查和更新提示。
export const updateEnabled = (env, config) => !(config.update_check === false || env.CI || env.AM_NO_UPDATE_CHECK);

export function updateHint(state, current, scriptPath, now = Date.now()) {
  if (!newer(state.latestVersion, current)) return null;
  if (state.lastUpdateHint && now - state.lastUpdateHint < UPDATE.hintEveryDays * DAY) return null;
  return `! 更新提示：Answer me with HTML 有新版本 ${state.latestVersion}（当前 ${current}）。请问用户是否更新：${updateCommand(scriptPath)}。`;
}

export function shouldCheckUpdate(state, env, config, now = Date.now()) {
  if (!updateEnabled(env, config)) return false;
  return !state.lastUpdateCheck || now - state.lastUpdateCheck >= UPDATE.checkEveryDays * DAY;
}

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

// 只接受 x.y.z 格式的版本号，其余一律忽略，避免把远端的任意文本带进 Agent 的上下文。
export async function runUpdateCheck(home, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(UPDATE.url, { signal: AbortSignal.timeout(UPDATE.timeoutMs) });
    if (!res.ok) return null;
    const { version } = await res.json();
    if (!parseVersion(version)) return null;
    writeState(home, { latestVersion: version.trim(), lastUpdateCheck: Date.now() });
    return version.trim();
  } catch {
    return null;
  }
}
