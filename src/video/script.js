// 视频稿件：复用 parseDoc 的面板切分。一个 "## " 面板 = 一个场景；面板里以 > 开头的行是旁白，
// 每行旁白是一拍；旁白里的 [名字] 让镜头聚焦到同名元素。其余内容（组件、Markdown）是画面。
import { parseDoc, ParseError, CHOICES } from '../parse.js';
import { isCJK } from '../svg/text.js';

const NARRATION = /^\s*>\s?(.*)$/;
const FOCUS = /\[([^\]\n]+)\]/g;

// 视频主题：页面的两套主题，外加深色的 3b1b。
export const VIDEO_THEMES = Object.freeze([...CHOICES.theme, '3b1b']);

export function parseVideo(source, { defaults = {} } = {}) {
  const doc = parseDoc(source, { defaults: { ...defaults, template: 'video' }, choices: { theme: VIDEO_THEMES } });
  const intro = splitNarration(doc.intro);
  const scenes = doc.panels.map((p) => {
    const { blocks, beats } = splitNarration(p.blocks);
    if (!beats.length) throw new ParseError(`场景 "${p.title}" 没有旁白：每个场景至少写一行 > 旁白`, p.line);
    return { id: p.id, title: p.title, line: p.line, attrs: p.attrs, blocks, beats };
  });
  if (!scenes.length) throw new ParseError('视频稿至少需要一个场景（## 场景标题）', 1);
  return { meta: doc.meta, doc, intro: intro.blocks, introBeats: intro.beats, scenes };
}

// 从 Markdown 块里取出旁白行；剩余的 Markdown 留作画面内容。
function splitNarration(blocks) {
  const beats = [];
  const out = [];
  for (const b of blocks) {
    if (b.type !== 'md') {
      out.push(b);
      continue;
    }
    const rest = [];
    b.text.split('\n').forEach((raw, i) => {
      const m = raw.match(NARRATION);
      if (m && m[1].trim()) beats.push(beat(m[1].trim(), b.line + i));
      else if (!m) rest.push(raw);
    });
    if (rest.some((l) => l.trim())) out.push({ ...b, text: rest.join('\n') });
  }
  return { blocks: out, beats };
}

function beat(raw, line) {
  const focus = [...raw.matchAll(FOCUS)].map((m) => m[1].trim());
  return { raw, text: raw.replace(FOCUS, '$1'), focus: focus[0] ?? null, line };
}

// 没有配音时按字数估算朗读时长：中文约 4.2 字/秒，英文约 2.6 词/秒。
export function estimateSeconds(text) {
  let cjk = 0;
  let latin = '';
  for (const ch of text) {
    if (isCJK(ch)) cjk++;
    latin += isCJK(ch) ? ' ' : ch;
  }
  const words = latin.match(/[A-Za-z0-9][\w'’-]*/g)?.length ?? 0;
  return Math.max(1.6, cjk / 4.2 + words / 2.6 + 0.3);
}

export const TIMING = Object.freeze({
  title: 2.4,      // 无旁白时片头停留
  transition: 0.9, // 场景切换（含跨场景变形）
  gap: 0.35,       // 两句旁白之间的停顿
  tail: 0.8,       // 场景最后一句之后的停留
  outro: 1.5,      // 片尾停留
});

// 把每拍时长排成时间轴。durations[i] 依次对应片头旁白和各场景旁白（扁平顺序）。
export function buildTimeline(video, durations) {
  let t = 0;
  let k = 0;
  const lay = (beats) => beats.map((b) => {
    const dur = durations[k++];
    const start = t;
    t += dur + TIMING.gap;
    return { text: b.text, focus: b.focus, start: round(start), end: round(start + dur) };
  });

  const titleBeats = lay(video.introBeats);
  if (!titleBeats.length) t = TIMING.title;
  const title = { start: 0, end: round(t), beats: titleBeats };

  const scenes = video.scenes.map((s) => {
    const start = t;
    t += TIMING.transition;
    const beats = lay(s.beats);
    t += TIMING.tail - TIMING.gap;
    return { title: s.title, start: round(start), end: round(t), beats };
  });
  t += TIMING.outro;
  return { duration: round(t), title, scenes };
}

export const allBeats = (video) => [...video.introBeats, ...video.scenes.flatMap((s) => s.beats)];

const round = (x) => Math.round(x * 1000) / 1000;
