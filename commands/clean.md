---
description: Clean up old Answer me with HTML pages, videos and the narration cache
argument-hint: "[--days <天数>] | [--all]"
allowed-tools: Bash(node *)
---

## 当前占用（预演，不删除）

!`node "${CLAUDE_PLUGIN_ROOT}/skills/answer-me-with-html/scripts/am.mjs" clean --dry-run $ARGUMENTS`

## 你要做的

CLI：`node "${CLAUDE_PLUGIN_ROOT}/skills/answer-me-with-html/scripts/am.mjs" clean …`

- 上面是预演结果。用 AskUserQuestion 问用户是否执行，选项：按预演执行（推荐）/ 全部清掉（`--all`）/ 先不清理。
- 用户同意后，带同样的参数（或 `--all`）去掉 `--dry-run` 再运行一次。
- 默认删除 30 天前的页面和视频，并清空配音缓存（下次做视频会重新合成）。配置文件始终保留。
- 完成后用一句话说明释放了多少空间。不要生成解释页。
