// 限值条（配图 E）：填充 = 当前值（或上限本身），竖线 = 上限，超限标红。条长 ∝ 数值，刻度从 0 开始，不断轴。
import { esc } from '../svg/text.js';
import { ComponentError, contentLines, fields } from './error.js';

const NICE_MAX = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const NICE_STEP = [1, 2, 2.5, 5, 10];

export function niceScale(peak) {
  if (!Number.isFinite(peak) || peak <= 0) return { max: 1, step: 1 };
  const target = peak * 1.4;
  const pow = 10 ** Math.floor(Math.log10(target));
  const integral = Number.isInteger(peak);
  const nice = NICE_MAX.map((m) => m * pow).find((m) => m >= target - 1e-9) ?? 10 * pow;
  const max = integral ? Math.ceil(nice) : nice;
  const stepPow = 10 ** Math.floor(Math.log10(max));
  const step = [...NICE_STEP.map((s) => (s * stepPow) / 10), ...NICE_STEP.map((s) => s * stepPow)]
    .find((s) => max / s <= 7 && Number.isInteger(round(max / s)) && (integral ? s >= 1 : true)) ?? max;
  return { max: round(max), step: round(step) };
}

const round = (n) => Math.round(n * 1000) / 1000;
const pct = (v, max) => `${Math.round((v / max) * 10000) / 100}%`;
const NUM = /^(?:max\s+)?(-?\d+(?:\.\d+)?)$/i;

export default {
  name: 'limits',
  summary: '数值 vs 上限 条形对照',
  syntax: `\`\`\`limits
标签 | 当前值 / 上限 | 单位（可选） | 备注（可选）
标签 | 上限 | 单位          ← 只给上限：条填充到上限
\`\`\`
- 当前值超过上限时整行标红。上限可写成 "max 20"。`,
  example: '```limits\n程序性句子 | 13 / 20 | words\n描述性句子 | max 25 | words\n名词簇 | 4 / 3 | words | 超限\n```',
  render(text) {
    const rows = contentLines(text).map(({ text: t, line }) => parseRow(t, line));
    if (!rows.length) throw new ComponentError('limits 至少需要一行', 1);
    return `<div class="am-limits">${rows.map(rowHtml).join('')}</div>`;
  },
};

function parseRow(t, line) {
  const [label, spec = '', unit = '', note = ''] = fields(t);
  const [a, b] = spec.split('/').map((s) => s.trim());
  const nums = (b === undefined ? [a] : [a, b]).map((s) => s?.match(NUM)?.[1]);
  if (!spec || nums.some((n) => n === undefined)) {
    throw new ComponentError(`limits 行格式应为 标签 | 当前值 / 上限 | 单位："${t}"`, line);
  }
  const [value, limit] = b === undefined ? [null, Number(nums[0])] : nums.map(Number);
  return { label, value, limit, unit, note };
}

function rowHtml({ label, value, limit, unit, note }) {
  const { max, step } = niceScale(Math.max(limit, value ?? 0));
  const shown = value ?? limit;
  const over = value !== null && value > limit;
  const valText = `${value !== null ? `${value} / ` : ''}max ${limit}${unit ? ` ${unit}` : ''}`;
  const ticks = [];
  if (step > 0 && max > 0) {
    for (let v = 0; v <= max + 1e-9; v += step) ticks.push(`<span style="left: ${pct(round(v), max)}">${round(v)}</span>`);
  }
  return `<div class="am-lim${over ? ' is-over' : ''}">
<div class="am-lim-head"><span>${esc(label)}${note ? `<span class="am-lim-note">${esc(note)}</span>` : ''}</span><span class="am-lim-val">${esc(valText)}</span></div>
<div class="am-lim-track"><div class="am-lim-fill" style="width: ${pct(shown, max)}"></div><div class="am-lim-mark" style="left: ${pct(limit, max)}"></div></div>
<div class="am-lim-ticks" aria-hidden="true">${ticks.join('')}</div>
</div>`;
}
