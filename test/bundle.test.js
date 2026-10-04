import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// 模拟 npx skills add：只复制 skill 目录到隔离位置，确认打包版不依赖仓库里的任何文件。
test('bundle: skill 目录单独复制出去后仍能渲染', () => {
  const dir = mkdtempSync(join(tmpdir(), 'am-bundle-'));
  try {
    cpSync(join(ROOT, 'skills/answer-me-with-html'), join(dir, 'answer-me-with-html'), { recursive: true });
    const cli = join(dir, 'answer-me-with-html/scripts/am.mjs');
    const env = { ...process.env, AM_NO_OPEN: '1' };

    const version = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8', env });
    assert.equal(version.stdout.trim(), PKG.version, '打包版版本号应与 package.json 一致（忘了 npm run build？）');

    const out = join(dir, 'out.html');
    const r = spawnSync(process.execPath, [cli, 'render', '-', '-o', out], {
      input: '---\ntitle: 打包测试\n---\n## A\n```flow\nA -> B\n```\n', encoding: 'utf8', env, cwd: dir,
    });
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(out, 'utf8');
    assert.match(html, /<h1>打包测试<\/h1>/);
    assert.match(html, /class="am-node /);
    assert.match(html, /--font-mono/, 'CSS 已内联');

    const patched = spawnSync(process.execPath, [cli, 'patch', out, '--panel', 'A'], {
      input: '## A\n只改这一格。\n', encoding: 'utf8', env, cwd: dir,
    });
    assert.equal(patched.status, 0, patched.stderr);
    assert.match(patched.stdout, new RegExp(out.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const after = readFileSync(out, 'utf8');
    assert.match(after, /只改这一格/);
    assert.doesNotMatch(after, /class="am-node /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
