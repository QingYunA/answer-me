import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configPath, readConfig, setConfig, resetConfig, CONFIG_KEYS, ConfigError } from '../src/config.js';
import { renderDoc } from '../src/render.js';

let home;
let env;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'am-config-'));
  env = { AM_HOME: home };
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

test('configPath: 位于 AM_HOME/config.json', () => {
  assert.equal(configPath(env), join(home, 'config.json'));
});

test('readConfig: 文件不存在时返回默认值', () => {
  assert.deepEqual(readConfig(env).values, { open: true, always: true, theme: 'blueprint', mode: 'auto', style: '80', voice: 'auto' });
});

test('setConfig: 布尔值接受 on/off/true/false/开/关，写入文件', () => {
  setConfig('open', 'off', env);
  assert.equal(readConfig(env).values.open, false);
  setConfig('open', '开', env);
  assert.equal(readConfig(env).values.open, true);
  assert.deepEqual(JSON.parse(readFileSync(configPath(env), 'utf8')), { open: true });
});

test('setConfig: 枚举值校验，非法值给出可选项', () => {
  setConfig('theme', 'shadcn', env);
  assert.equal(readConfig(env).values.theme, 'shadcn');
  assert.throws(() => setConfig('theme', 'neon', env), (e) => e instanceof ConfigError && /blueprint \| shadcn/.test(e.message));
  assert.throws(() => setConfig('nope', '1', env), (e) => e instanceof ConfigError && /open/.test(e.message));
  assert.throws(() => setConfig('open', 'maybe', env), ConfigError);
});

test('resetConfig: 单个键或全部恢复默认', () => {
  setConfig('open', 'off', env);
  setConfig('theme', 'shadcn', env);
  resetConfig('open', env);
  assert.deepEqual(readConfig(env).values, { open: true, always: true, theme: 'shadcn', mode: 'auto', style: '80', voice: 'auto' });
  resetConfig(undefined, env);
  assert.equal(existsSync(configPath(env)), false);
});

test('readConfig: 文件损坏时回退默认值并给出警告', () => {
  writeFileSync(configPath(env), '{ not json');
  const { values, warning } = readConfig(env);
  assert.equal(values.open, true);
  assert.match(warning, /config\.json/);
});

test('readConfig: 忽略未知键和非法值', () => {
  writeFileSync(configPath(env), JSON.stringify({ open: 'yes-ish', theme: 'shadcn', extra: 1 }));
  assert.deepEqual(readConfig(env).values, { open: true, always: true, theme: 'shadcn', mode: 'auto', style: '80', voice: 'auto' });
});

test('CONFIG_KEYS 每项都有中文说明', () => {
  for (const [key, spec] of Object.entries(CONFIG_KEYS)) assert.ok(spec.label, key);
});

test('render: 配置作为默认值，稿件 frontmatter 显式设置优先', () => {
  const defaults = { theme: 'shadcn', mode: 'dark', style: 'off' };
  const plain = renderDoc('## A\nUtilize it.', {}, defaults);
  assert.match(plain.html, /data-theme="shadcn" data-mode="dark"/);
  assert.equal(plain.warnings.length, 0, 'style: off 来自配置');
  const explicit = renderDoc('---\ntheme: blueprint\n---\n## A\nx', {}, defaults);
  assert.match(explicit.html, /data-theme="blueprint"/);
  const flag = renderDoc('---\ntheme: blueprint\n---\n## A\nx', { theme: 'shadcn' }, defaults);
  assert.match(flag.html, /data-theme="shadcn"/, '命令行参数优先级最高');
});
