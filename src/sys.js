// 与操作系统打交道的小工具。
import { spawnSync } from 'node:child_process';

export function hasCommand(cmd) {
  return spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;
}
