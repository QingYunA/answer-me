// 结构树（配图 A）：缩进表达层级。单根且 2~4 个子节点时画成组织图，其余情况画成带连线的缩进列表。
import { mdInline } from '../markdown.js';
import { ComponentError, fields } from './error.js';
import { esc } from '../svg/text.js';

export default {
  name: 'tree',
  summary: '层级结构树（组织图 / 缩进列表）',
  syntax: `\`\`\`tree [list]
根节点 | 副标题
  子节点
    孙节点 | 一行说明
  *高亮子节点
\`\`\`
- 用缩进（空格或 Tab）表达层级；"标签 | 说明" 给出灰色说明。
- 单根且 2~4 个子节点 → 组织图；子节点更多或参数 list → 缩进列表；多个根 → 并排。
- 标签支持行内 Markdown，如 \`Section 1\` Words。`,
  example: '```tree\nASD-STE100 | Simplified Technical English\n  Part 1: Writing rules\n    `Section 1` Words\n  Part 2: Dictionary\n    Approved words | 一词一义\n```',
  render(text, { args }) {
    const roots = buildTree(text);
    if (!roots.length) throw new ComponentError('tree 至少需要一个节点', 1);
    const listMode = /\blist\b/.test(args);
    if (roots.length === 1) {
      const [root] = roots;
      const n = root.children.length;
      if (!listMode && n >= 2 && n <= 4) return orgHtml(root);
      return `<div class="am-tree">${rootBox(root, true)}${listHtml(root.children)}</div>`;
    }
    if (!listMode && roots.length <= 4) {
      return `<div class="am-tree"><div class="am-tree-cols am-tree-cols--free" style="--n: ${roots.length}">${roots.map(colHtml).join('')}</div></div>`;
    }
    return `<div class="am-tree">${listHtml(roots)}</div>`;
  },
};

function buildTree(text) {
  const roots = [];
  const stack = [];
  let step = 0;
  for (const raw of String(text).split('\n')) {
    if (!raw.trim()) continue;
    const indent = raw.replace(/\t/g, '  ').match(/^ */)[0].length;
    const node = { ...parseLabel(raw.trim()), indent, step: step++, children: [] };
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    (stack.length ? stack.at(-1).children : roots).push(node);
    stack.push(node);
  }
  return roots;
}

function parseLabel(t) {
  const hi = t.startsWith('*');
  const [label, sub = ''] = fields(hi ? t.slice(1) : t);
  return { label, sub, hi };
}

// 标签以行内代码开头且后面还有文字时（如 `Section 1` Words），代码部分作为灰色编号标签。
const labelHtml = (label) => mdInline(label).replace(/^<code>([^<]*)<\/code>(?=\s*\S)/, '<span class="am-tree-tag">$1</span>');

// data-key / data-step 供视频模式使用：同名节点跨场景变形，按源码行逐步出现。
const vattrs = (n) => ` data-key="${esc(n.label)}" data-step="${n.step}"`;

const boxInner = (n) => `${labelHtml(n.label)}${n.sub ? `<small>${mdInline(n.sub)}</small>` : ''}`;

function rootBox(root, solo = false) {
  return `<div class="am-tree-root${solo ? ' am-tree-root--solo' : ''}"><div class="am-tree-box am-tree-box--root"${vattrs(root)}>${boxInner(root)}</div></div>`;
}

function colHtml(node) {
  const children = node.children.length ? listHtml(node.children) : '';
  return `<div class="am-tree-col"><div class="am-tree-box${node.hi ? ' am-tree-box--hi' : ''}"${vattrs(node)}>${boxInner(node)}</div>${children}</div>`;
}

function orgHtml(root) {
  return `<div class="am-tree">${rootBox(root)}<div class="am-tree-cols" style="--n: ${root.children.length}">${root.children.map(colHtml).join('')}</div></div>`;
}

function listHtml(nodes) {
  return `<ul class="am-tree-list">${nodes.map(liHtml).join('')}</ul>`;
}

function liHtml(n) {
  const sub = n.sub ? `<span class="am-tree-sub">${mdInline(n.sub)}</span>` : '';
  const kids = n.children.length ? `<ul>${n.children.map(liHtml).join('')}</ul>` : '';
  return `<li${n.hi ? ' class="am-tree-hi"' : ''}${vattrs(n)}><span class="am-tree-label">${labelHtml(n.label)}</span>${sub}${kids}</li>`;
}
