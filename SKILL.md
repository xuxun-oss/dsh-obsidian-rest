# dsh-obsidian-rest：Agent 使用规范（SKILL）

你是运行在 DeepSeek Harness（dsh）中的 agent。本 skill 说明如何安全、正确地使用
`dsh-obsidian-rest` 插件读写**远程 Obsidian vault**（经用户自配的 Local REST API）。

## 核心原则

1. **先读后写**：任何写/覆盖/删除之前，先 `obsidian_read_note` 读出现文，确认再改。
2. **路径是 vault 相对路径**：不写绝对路径、不写盘符、不用 `..` 穿越；`/` 分隔。
3. **写前确认**：写/删/执行命令是针锋相对的高危操作，涉及删除、覆盖、批量改动时必须先向用户确认目标与影响。

## 工具总览

| 工具 | 作用 | 风险 |
|---|---|---|
| `obsidian_health` | 探测端点可用性/版本/认证 | 无 |
| `obsidian_list_dir(path)` | 列目录（`path` 空或 `""` = 根） | 无 |
| `obsidian_read_note(path)` | 读笔记全文 | 无 |
| `obsidian_search(query, {tag?, dir?})` | 全文搜索 | 无 |
| `obsidian_create_note(path, content, {frontmatter?})` | 新建笔记 | 写（需开启 + 审批） |
| `obsidian_update_note(path, content)` | 整篇覆盖写回 | 写（需开启 + 审批） |
| `obsidian_delete_note(path)` | 永久删除（无回收站） | 高（需开启 + 审批） |
| `obsidian_list_commands` | 列出可执行命令 | 中（需开启） |
| `obsidian_run_command(commandId, args?)` | 执行 Obsidian 命令 | 高（需开启 + 审批） |

## frontmatter 保留（重要）

`obsidian_update_note` 是**整篇覆盖**，不会自动保留 frontmatter。覆盖已有笔记时：

1. 先 `obsidian_read_note(path)` 读出现文；
2. 提取原 frontmatter（`---` 起始块）；
3. 用「原 frontmatter + 新正文」拼出完整内容再 `obsidian_update_note`；
4. 新建笔记需要 frontmatter 时，用 `obsidian_create_note(image, content, frontmatter)` 传入键值对象。

## 路径边界

- 允许：`Notes/会议记录.md`、`项目/周报/2026-09.md`（相对路径，`/` 分隔）。
- 禁止写：`.obsidian/`、`.trash/` 系统目录；任何 `.` 开头的隐藏文件/目录（写会被拒绝；读允许）。
- 禁止：绝对路径 `/a/b`、盘符 `C:/x`、`..` 穿越、反斜杠逃逸 `..\..\secret`。
- 中文与空格路径：插件自动按 `quote(path, safe='/')` 语义编码，无需你手工转义。

## allowWrite / allowCommands 未开启时的表现

- 未开 `allowWrite`：`obsidian_create_note` / `obsidian_update_note` / `obsidian_delete_note` 直接返回
  “写操作未开启：config.allowWrite（未发送任何写请求）”——**不会**发出任何 HTTP 写请求。
- 未开 `allowCommands`：`obsidian_list_commands` / `obsidian_run_command` 返回
  “命令操作未开启：config.allowCommands”。
- 遇到此类错误时：不要反复重试，直接告知用户“写/命令能力未开启，需在配置中打开 `allowWrite`（或
  `allowCommands`）”，并说明会先做只读分析给出方案，等用户开启后再执行。

## 删除与覆盖的确认清单

- `obsidian_delete_note`：Local REST API 无回收站，**删除不可恢复**。删除前必须先向用户确认（列出
  要删的路径），并在结果中复述“已永久删除（不可恢复）”。
- `obsidian_update_note`：覆盖前先读现文确认差异，避免丢内容；必要时先备份原文件路径。

## 错误处理

- 返回的 `error` 已归一（网络错误 / 401 key 错 / 403 CF 拦截 / 404 不存在 / 5xx 服务端），直接读
  `error` 字段即可；不要假设 HTTP 状态码。
- 401 → 提示用户检查 API key；403 → 提示检查 Cloudflare Access 双头或服务端拦截；404 → 确认路径或
  检查 obsidian-local-rest-api 版本是否支持该端点。