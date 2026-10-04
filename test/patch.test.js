import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDoc } from '../src/render.js';
import { parseDoc } from '../src/parse.js';
import { extractSource, replacePanel, findPanel, PatchError } from '../src/patch.js';

const SRC = `---
title: Patch 测试
---
导语保留。

## A 流程
旧的流程说明。

## B 对照
对照文字不要动。

## C 结论
结论也不要动。
`;

function sectionOf(source, title) {
  const doc = parseDoc(source);
  const panel = findPanel(doc, title);
  const idx = doc.panels.indexOf(panel);
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const start = panel.line - 1;
  const end = doc.panels[idx + 1] ? doc.panels[idx + 1].line - 1 : lines.length;
  return lines.slice(start, end).join('\n');
}

test('extractSource: 从 #am-source 还原转义后的源稿', () => {
  const src = '## A\n```html\n<script>x</script></textarea>\n```';
  const { html } = renderDoc(src);
  assert.equal(extractSource(html), src);
});

test('extractSource: 没有 #am-source 时返回 null', () => {
  assert.equal(extractSource('<html><body>no source</body></html>'), null);
});

test('replacePanel: 只替换匹配的 ## 面板，其余小节原文不变', () => {
  const next = replacePanel(SRC, '流程', '## A 流程\n新的流程说明。\n');
  assert.match(next, /新的流程说明/);
  assert.doesNotMatch(next, /旧的流程说明/);
  assert.equal(sectionOf(next, '对照'), sectionOf(SRC, '对照'));
  assert.equal(sectionOf(next, '结论'), sectionOf(SRC, '结论'));
  assert.match(next, /导语保留/);
  assert.match(next, /title: Patch 测试/);
});

test('replacePanel: --panel 可匹配标题、ID 或 "ID 标题"', () => {
  for (const q of ['流程', 'A', 'A 流程', '## A 流程']) {
    const next = replacePanel(SRC, q, '只写正文。\n');
    assert.match(next, /## A 流程\n只写正文。/);
  }
});

test('replacePanel: 正文不含 ## 时保留原标题行', () => {
  const next = replacePanel(SRC, '对照', '对照已更新。\n');
  assert.match(next, /## B 对照\n对照已更新。/);
});

test('replacePanel: 找不到面板或稿件为空时抛错', () => {
  assert.throws(() => replacePanel(SRC, '没有这个', 'x'), PatchError);
  assert.throws(() => replacePanel(SRC, '流程', '   '), PatchError);
  assert.throws(() => replacePanel(SRC, '流程', '## A 一\na\n## B 二\nb\n'), /只包含一个/);
});
