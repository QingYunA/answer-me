#!/usr/bin/env node
import { main } from '../src/cli.js';

// background：允许在后台检查新版本（测试里直接调用 main 时不会触发）。
main(process.argv.slice(2), { background: true, scriptPath: process.argv[1] }).then(
  (code) => { process.exitCode = code; },
  (err) => {
    process.stderr.write(`✗ 内部错误：${err.stack || err}\n`);
    process.exitCode = 1;
  },
);
