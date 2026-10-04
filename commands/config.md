---
description: View or change Answer me with HTML settings — auto-open browser, always-on mode, default theme, light/dark, STE strictness, video voice, update notices
argument-hint: "[open|always|theme|mode|style|voice|update_check <值>] | reset [键]"
allowed-tools: Bash(node *)
---

## 当前配置

!`node "${CLAUDE_PLUGIN_ROOT}/skills/answer-me-with-html/scripts/am.mjs" config`

## 你要做的

用户参数：`$ARGUMENTS`

CLI：`node "${CLAUDE_PLUGIN_ROOT}/skills/answer-me-with-html/scripts/am.mjs" config …`

- **参数为空**：用 AskUserQuestion 让用户选。一次最多问 4 项，优先问：自动打开浏览器（open）、高频模式（always）、默认主题（theme）、明暗（mode）。把当前值标在选项里。用户选完后逐项执行 `config set`。
- **`<键> <值>`**（如 `open off`）：直接执行 `config set <键> <值>`。
- **`reset` 或 `reset <键>`**：执行 `config reset [键]`。
- **自然语言**（如"别再弹浏览器了"）：换算成对应的键和值再执行。

改完后用一两句话说明改了什么。配置立即生效；高频模式的开关从用户下一条消息开始生效。不要生成解释页。
