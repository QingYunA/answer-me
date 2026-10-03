// 运行时需要的静态资源集中在这里。开发时从磁盘读取；打包（scripts/build.mjs）时整个模块被替换成内联字符串，
// 因此产物 skills/answer-me-with-html/scripts/am.mjs 不依赖任何外部文件。
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

export const VERSION = JSON.parse(read('../package.json')).version;
export const BASE_CSS = read('./themes/base.css');
export const RUNTIME_JS = read('./runtime/page.js');
export const VIDEO_CSS = read('./themes/video.css');
export const VIDEO_JS = read('./runtime/video.js');
