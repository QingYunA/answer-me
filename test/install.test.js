// 安装形态的回归测试：清单之间版本一致、引用的文件真实存在、打包后的 skill 目录脱离仓库也能独立运行。
// 真实的 npx skills / claude plugin validate 安装检查在 CI 的 install 任务里跑（scripts/smoke-install.mjs）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const VERSION = json('package.json').version;

test('install: package.json、两个 plugin.json、marketplace.json 的版本一致', () => {
  assert.equal(json('.claude-plugin/plugin.json').version, VERSION);
  assert.equal(json('plugins/answer-me-with-html-always/.claude-plugin/plugin.json').version, VERSION);
  for (const p of json('.claude-plugin/marketplace.json').plugins) assert.equal(p.version, VERSION, p.name);
});

test('install: marketplace 里的插件都能找到，名字与 plugin.json 一致', () => {
  for (const p of json('.claude-plugin/marketplace.json').plugins) {
    const manifest = join(p.source, '.claude-plugin/plugin.json');
    assert.ok(existsSync(join(ROOT, manifest)), `${p.name}: 缺少 ${manifest}`);
    assert.equal(json(manifest).name, p.name);
  }
});

test('install: hook、命令、SKILL.md 引用的脚本路径都存在', () => {
  const hooks = json('plugins/answer-me-with-html-always/hooks/hooks.json');
  const args = hooks.hooks.UserPromptSubmit.flatMap((h) => h.hooks).flatMap((h) => h.args ?? []);
  for (const a of args) {
    assert.ok(existsSync(join(ROOT, 'plugins/answer-me-with-html-always', a.replace('${CLAUDE_PLUGIN_ROOT}/', ''))), a);
  }
  for (const f of readdirSync(join(ROOT, 'commands'))) {
    for (const [, rel] of readFileSync(join(ROOT, 'commands', f), 'utf8').matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g)) {
      assert.ok(existsSync(join(ROOT, rel)), `${f}: ${rel}`);
    }
  }
  const skill = readFileSync(join(ROOT, 'skills/answer-me-with-html/SKILL.md'), 'utf8');
  for (const [, rel] of skill.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([\w./-]+)/g)) {
    assert.ok(existsSync(join(ROOT, 'skills/answer-me-with-html', rel)), rel);
  }
});

test('install: skill 目录拷到别处后，不依赖 node_modules 也能出页面', () => {
  const dir = mkdtempSync(join(tmpdir(), 'am-install-'));
  try {
    cpSync(join(ROOT, 'skills/answer-me-with-html'), join(dir, 'skill'), { recursive: true });
    const out = execFileSync(process.execPath, [join(dir, 'skill/scripts/am.mjs'), 'render', '-', '--no-open', '-o', join(dir, 'p.html')], {
      input: '## A 标题\n```flow\nA -> B\n```\n',
      env: { ...process.env, AM_HOME: join(dir, 'home'), AM_NO_UPDATE_CHECK: '1' },
      encoding: 'utf8',
    });
    assert.match(out, /✓ .*p\.html/);
    assert.match(readFileSync(join(dir, 'p.html'), 'utf8'), /<svg/);
    assert.match(execFileSync(process.execPath, [join(dir, 'skill/scripts/am.mjs'), '--version'], { encoding: 'utf8' }), new RegExp(VERSION.replace(/\./g, '\\.')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
