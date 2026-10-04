import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS, ComponentError } from '../src/components/index.js';
import { parseFlow } from '../src/components/flow.js';
import { parseSequence } from '../src/components/sequence.js';
import { smoothPath } from '../src/svg/shapes.js';

const ctx = (args = '') => ({ args, uid: () => 'u1' });
const render = (name, text, args) => COMPONENTS.get(name).render(text, ctx(args));
const throwsAt = (fn, line) =>
  assert.throws(fn, (e) => e instanceof ComponentError && e.line === line);
const viewBox = (svg) => svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);

// ── shapes ──
test('smoothPath: 两点为直线，多点为平滑曲线', () => {
  assert.equal(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }]), 'M0,0 L10,0');
  assert.match(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]), /^M0,0 L5,0 Q10,0 10,5 L10,10$/);
});

// ── sequence ──
test('parseSequence: 参与者按出现顺序、实线/虚线、自调用、注释', () => {
  const m = parseSequence('A -> B: 请求\nB --> A: 响应\nB -> B: 校验\nnote A, B: 建立连接');
  assert.deepEqual(m.participants, ['A', 'B']);
  assert.deepEqual(m.steps.map((s) => s.kind), ['msg', 'msg', 'msg', 'note']);
  assert.equal(m.steps[1].dashed, true);
  assert.equal(m.steps[2].from, m.steps[2].to);
  assert.deepEqual(m.steps[3].over, ['A', 'B']);
});

test('parseSequence: participants 行固定顺序', () => {
  const m = parseSequence('participants: Server, Client\nClient -> Server: SYN');
  assert.deepEqual(m.participants, ['Server', 'Client']);
});

test('sequence: 输出 SVG，含参与者框、生命线、箭头标签', () => {
  const svg = render('sequence', 'Client -> Server: SYN\nServer --> Client: SYN-ACK');
  assert.match(svg, /^<figure class="am-diagram am-seq">/);
  assert.equal((svg.match(/class="am-actor"/g) || []).length, 2);
  assert.equal((svg.match(/class="am-lifeline"/g) || []).length, 2);
  assert.match(svg, />SYN<\/text>/);
  assert.match(svg, /am-edge am-edge--dashed/);
  assert.match(svg, /marker-end="url\(#u1-arrow\)"/);
});

test('sequence: 长消息标签会拉开参与者间距', () => {
  const short = viewBox(render('sequence', 'A -> B: x'))[0];
  const long = viewBox(render('sequence', 'A -> B: 这是一个非常非常长的消息标签需要更大的间距'))[0];
  assert.ok(long > short + 100, `short=${short} long=${long}`);
});

test('sequence: num 参数添加序号', () => {
  assert.match(render('sequence', 'A -> B: x', 'num'), /class="am-step"[^>]*>1<\/text>/);
});

test('sequence: 无法解析的行报告行号', () => {
  throwsAt(() => render('sequence', 'A -> B: ok\nA => B'), 2);
});

// ── flow ──
test('parseFlow: 链式、扇出、形状标记、高亮、边标签', () => {
  const m = parseFlow('(开始) -> 输入 -> {合法?}\n合法? -> 处理 & *[(数据库)]: 是\n合法? --> 报错: 否');
  const shape = Object.fromEntries([...m.nodes.values()].map((n) => [n.id, n.shape]));
  assert.deepEqual(shape, { 开始: 'round', 输入: 'rect', '合法?': 'diamond', 处理: 'rect', 数据库: 'db', 报错: 'rect' });
  assert.equal(m.nodes.get('数据库').hi, true);
  assert.equal(m.edges.length, 5);
  assert.deepEqual(m.edges.filter((e) => e.label === '是').map((e) => e.to), ['处理', '数据库']);
  assert.equal(m.edges.find((e) => e.to === '报错').dashed, true);
});

test('parseFlow: 方括号保护含冒号的节点文本', () => {
  const m = parseFlow('[Part 1: rules] -> [Part 2: dict]: 引用');
  assert.ok(m.nodes.has('Part 1: rules'));
  assert.equal(m.edges[0].label, '引用');
});

test('parseFlow: group 声明分组', () => {
  const m = parseFlow('网关 -> 鉴权\n网关 -> 业务\ngroup 后端: 鉴权, 业务');
  assert.deepEqual(m.groups, [{ name: '后端', members: ['鉴权', '业务'], line: 3 }]);
});

test('flow: 输出 SVG，节点/边/标签/分组齐全', () => {
  const svg = render('flow', '用户 -> 网关: HTTPS\n网关 -> 鉴权\n网关 -> 业务\ngroup 后端: 鉴权, 业务');
  assert.match(svg, /^<figure class="am-diagram am-flow">/);
  assert.equal((svg.match(/class="am-node /g) || []).length, 4);
  assert.equal((svg.match(/class="am-edge"/g) || []).length, 3);
  assert.match(svg, /class="am-edge-label".*>HTTPS<\/text>/s);
  assert.match(svg, /class="am-cluster"/);
  assert.match(svg, />后端<\/text>/);
});

test('flow: LR 方向更宽，TB 方向更高', () => {
  const src = 'A -> B -> C -> D';
  const [wTB, hTB] = viewBox(render('flow', src));
  const [wLR, hLR] = viewBox(render('flow', src, 'LR'));
  assert.ok(hTB > wTB && wLR > hLR);
});

test('flow: 菱形节点画成 polygon，数据库画成圆柱', () => {
  const svg = render('flow', '{判断?} -> [(DB)]');
  assert.match(svg, /<polygon class="am-node-shape"/);
  assert.match(svg, /am-node--db/);
});

test('flow: 引用了不存在节点的 group 报错；空图报错', () => {
  throwsAt(() => render('flow', 'A -> B\ngroup G: A, X'), 2);
  throwsAt(() => render('flow', '  '), 1);
});

test('flow: 未闭合的形状括号报错', () => {
  throwsAt(() => render('flow', 'A -> B\n(未闭合 -> C'), 2);
});

test('flow: 节点名与 dagre 保留 id 或内部分组 id 相同也能布局', () => {
  assert.match(render('flow', '\u0000 -> B'), /<svg/);
  assert.match(render('flow', '__group0 -> B\ngroup G: B'), /am-cluster/);
  assert.match(render('flow', 'g0 -> n0\ngroup g0: n0'), /am-cluster/);
});
