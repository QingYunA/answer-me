// 数据目录里的 state.json：记录首次使用、上次清理、版本检查等时间点。
// 写入先写临时文件再改名，避免并发或中断时留下半截文件；读到坏文件时当作空状态。
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const DAY = 24 * 60 * 60 * 1000;

const statePath = (home) => join(home, 'state.json');

export function readState(home) {
  try {
    const data = JSON.parse(readFileSync(statePath(home), 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function writeState(home, patch) {
  const next = { ...readState(home), ...patch };
  mkdirSync(home, { recursive: true });
  const tmp = `${statePath(home)}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(tmp, statePath(home));
  return next;
}
