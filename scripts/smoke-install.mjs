#!/usr/bin/env node
// 真实安装冒烟测试（CI 的 install 任务调用，需要联网）：
// 1. npx skills add <仓库> -l 能识别出 skill（YAML 头坏掉时这里会失败，见 PR #2）；
// 2. 用临时 HOME 真正安装一次，再用装好的 am.mjs 出一页；
// 3. claude plugin validate 校验插件市场与高频插件的清单。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const home = mkdtempSync(join(tmpdir(), 'am-smoke-'));
const env = { ...process.env, HOME: home, AM_HOME: join(home, '.answer-me-with-html'), AM_NO_UPDATE_CHECK: '1', NO_COLOR: '1' };
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe'], ...opts });
const step = (name) => process.stdout.write(`\n▶ ${name}\n`);
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

function find(dir, name) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === 'node_modules' || e === '.npm') continue;
    if (e === name) return p;
    if (statSync(p).isDirectory()) {
      const hit = find(p, name);
      if (hit) return hit;
    }
  }
  return null;
}

try {
  step('npx skills add -l');
  const list = strip(sh('npx', ['-y', 'skills@latest', 'add', ROOT, '-l']));
  // 只认关键信号，不依赖完整文案：出现跳过 / 解析错误即失败，且列表里要有 skill 名。
  if (/Skipped|parse error|No (valid )?skills found/i.test(list) || !/answer-me-with-html/.test(list)) {
    throw new Error(`skills CLI 没有识别出 skill：\n${list}`);
  }
  process.stdout.write('✓ skills CLI 识别出 answer-me-with-html\n');

  step('npx skills add -g（临时 HOME）');
  sh('npx', ['-y', 'skills@latest', 'add', ROOT, '-g', '-a', 'claude-code', '-y', '--copy']);
  const installed = find(join(home, '.claude'), 'am.mjs');
  if (!installed) throw new Error('安装后没有找到 am.mjs');
  const out = sh(process.execPath, [installed, 'render', '-', '--no-open'], { input: '## A 标题\n```flow\nA -> B\n```\n' });
  if (!/^✓ /m.test(out)) throw new Error(`装好的 am.mjs 无法出页面：\n${out}`);
  process.stdout.write(`✓ ${installed} 可以出页面\n`);

  step('claude plugin validate');
  for (const target of [ROOT, join(ROOT, 'plugins/answer-me-with-html-always')]) {
    // 校验失败时 claude 以非零退出码结束，execFileSync 会直接抛错；不再匹配输出文案。
    sh('npx', ['-y', '@anthropic-ai/claude-code@latest', 'plugin', 'validate', target]);
  }
  process.stdout.write('✓ 插件市场与插件清单校验通过\n');
} catch (e) {
  process.stderr.write(`✗ ${e.stderr ? strip(String(e.stderr)) : ''}${e.message}\n`);
  process.exitCode = 1;
} finally {
  rmSync(home, { recursive: true, force: true });
}
