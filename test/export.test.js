// MP4 导出的失败路径：ffmpeg 中途退出时要报出 ExportError，不能让进程崩溃或卡住。
// 用一个假的 ffmpeg（读几块输入后退出码 1）替换 PATH 里的 ffmpeg；需要本机有 Chrome。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportMp4, findChrome, ExportError } from '../src/video/export.js';
import { renderVideo } from '../src/video/render.js';

const chrome = findChrome();
const canRun = Boolean(chrome) && typeof WebSocket !== 'undefined' && process.platform !== 'win32';

test('exportMp4: ffmpeg 中途退出时抛 ExportError，不崩溃也不卡住', { skip: !canRun && '需要 Chrome 与 Node 22+', timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'am-export-fail-'));
  try {
    const fake = join(dir, 'ffmpeg');
    writeFileSync(fake, '#!/bin/sh\nhead -c 200000 >/dev/null\necho "fake ffmpeg: boom" >&2\nexit 1\n');
    chmodSync(fake, 0o755);
    const { html } = await renderVideo('## 场景\n```flow\nA -> B\n```\n> A 连到 B。\n');
    const page = join(dir, 'v.html');
    writeFileSync(page, html);
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}` };
    const prevPath = process.env.PATH;
    process.env.PATH = env.PATH; // hasCommand 与 spawn 都按 PATH 找 ffmpeg
    try {
      await assert.rejects(exportMp4(page, join(dir, 'v.mp4'), { env }), (e) => e instanceof ExportError && /ffmpeg 失败（1）/.test(e.message));
    } finally {
      process.env.PATH = prevPath;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
