import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS, ComponentError } from '../src/components/index.js';
import { niceScale } from '../src/components/limits.js';

const ctx = (args = '') => ({ args, uid: () => 'u1' });
const render = (name, text, args) => COMPONENTS.get(name).render(text, ctx(args));
const throwsAt = (fn, line) =>
  assert.throws(fn, (e) => e instanceof ComponentError && e.line === line);

const STE_TREE = `ASD-STE100 | Simplified Technical English
  Part 1: Writing rules
    \`Section 1\` Words
    \`Section 2\` Noun clusters
  *Part 2: Dictionary
    Approved words | 大写关键词，一词一义
      子项`;

// ── tree ──
test('tree: 单根 + 2~4 个子节点 → 组织图模式（根框 + 分栏 + 子列表）', () => {
  const html = render('tree', STE_TREE);
  assert.match(html, /am-tree-box am-tree-box--root"[^>]*>ASD-STE100<small>Simplified Technical English<\/small>/);
  assert.match(html, /am-tree-cols" style="--n: 2"/);
  assert.match(html, /<span class="am-tree-tag">Section 1<\/span> Words/);
  assert.match(html, /am-tree-sub">大写关键词，一词一义/);
  assert.match(html, /<li[^>]*><span class="am-tree-label">子项<\/span><\/li>/, '第三层嵌套为子列表');
});

test('tree: * 前缀高亮节点', () => {
  assert.match(render('tree', STE_TREE), /am-tree-box am-tree-box--hi"[^>]*>Part 2: Dictionary/);
});

test('tree: 参数 list 或子节点 >4 时用纯列表模式', () => {
  assert.match(render('tree', STE_TREE, 'list'), /am-tree-root--solo/);
  const wide = `根\n${['a', 'b', 'c', 'd', 'e'].map((x) => `  ${x}`).join('\n')}`;
  const html = render('tree', wide);
  assert.doesNotMatch(html, /am-tree-cols/);
  assert.match(html, /am-tree-list/);
});

test('tree: 多个根节点时并排显示、无根框', () => {
  const html = render('tree', '甲\n  a\n乙\n  b');
  assert.match(html, /am-tree-cols am-tree-cols--free" style="--n: 2"/);
  assert.doesNotMatch(html, /am-tree-box--root/);
});

test('tree: 制表符缩进等同两个空格', () => {
  const html = render('tree', '根\n\t子1\n\t子2');
  assert.match(html, /--n: 2/);
});

test('tree: 空内容报错', () => {
  throwsAt(() => render('tree', '\n  \n'), 1);
});

// ── limits ──
test('niceScale: 刻度上限取整且留余量，刻度数 ≤ 7', () => {
  assert.deepEqual(niceScale(20), { max: 30, step: 5 });
  assert.deepEqual(niceScale(6), { max: 10, step: 2 });
  assert.deepEqual(niceScale(3), { max: 5, step: 1 });
  for (const v of [1, 7, 13, 99, 1234]) {
    const { max, step } = niceScale(v);
    assert.ok(max >= v * 1.2 && max / step <= 7, `v=${v} → ${max}/${step}`);
  }
});

test('limits: 值 / 上限 → 填充宽度、上限标记、单位', () => {
  const html = render('limits', '程序性句子 | 13 / 20 | words');
  assert.match(html, /am-lim-fill" style="width: 43.33%"/);
  assert.match(html, /am-lim-mark" style="left: 66.67%"/);
  assert.match(html, /am-lim-val">13 \/ max 20 words/);
});

test('limits: 只有上限时填充到上限；支持 max 前缀', () => {
  const html = render('limits', '名词簇 | max 3 | words');
  assert.match(html, /am-lim-fill" style="width: 60%"/);
  assert.match(html, /am-lim-val">max 3 words/);
});

test('limits: 超限标红，第四列为备注', () => {
  const html = render('limits', '段落句数 | 8 / 6 | 句 | 例外：列表');
  assert.match(html, /am-lim is-over/);
  assert.match(html, /am-lim-note">例外：列表/);
});

test('limits: 刻度包含 0 与上限', () => {
  const html = render('limits', 'x | 20');
  assert.match(html, /<span style="left: 0%">0<\/span>/);
  assert.match(html, /<span style="left: 100%">30<\/span>/);
});

test('limits: 非数字或缺列报错', () => {
  throwsAt(() => render('limits', 'a | 1 / 2\nb | 很多'), 2);
  throwsAt(() => render('limits', '只有标签'), 1);
});

test('niceScale: 整数上限只用整数刻度', () => {
  assert.deepEqual(niceScale(1), { max: 2, step: 1 });
  assert.deepEqual(niceScale(2), { max: 3, step: 1 });
});

test('tree: 整个标签都是行内代码时保持代码样式', () => {
  assert.match(render('tree', '根\n  `bin/am.js` | 入口\n  `src/`', 'list'), /<span class="am-tree-label"><code>bin\/am.js<\/code><\/span>/);
});
