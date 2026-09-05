# Changelog

本项目的所有值得注意的变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.1] - 2026-09-05

### Fixed

- 修复与 dsh 0.1.1-rc.2（cordis-plugin-loader）不兼容导致的 web profile 启动崩溃：入口模块曾同时
  `export default apply`，loader 的 `unwrapExports` 优先取 `default`（裸 apply 函数），丢失
  `name`/`inject`，运行时访问 `ctx.tools` 抛「cannot get property "tools" without inject」。
  改为仅具名导出 `name`/`inject`/`apply`（与 dsh-vision-imagen 一致）。

## [0.1.0] - 2026-09-05

### Added

- 首个版本：`dsh-obsidian-rest` —— 第三方 DeepSeek Harness（dsh / cordis）插件，通过用户自配的
  Obsidian Local REST API 为 dsh agent 提供 vault 远程读/搜索/写/命令能力（remote-REST-first）。
- 配置 Schema（schemastery）：`baseUrl` / `apiKey` 或 `apiKeyEnv` / `accessClientId` /
  `accessClientSecret`（CF 双头）/ `rejectUnauthorized` / `allowWrite` / `allowCommands` / `ua` /
  `timeoutMs`；启动 fail-fast 校验（缺 baseUrl 或 apiKey 即报错并指引复制 API key）。
- 工具集（`obsidian_*`）：`obsidian_health`、`obsidian_list_dir`、`obsidian_read_note`、
  `obsidian_search`、`obsidian_create_note`、`obsidian_update_note`、`obsidian_delete_note`、
  `obsidian_list_commands`、`obsidian_run_command`。
- 统一 HTTP 客户端：`baseUrl`（去尾斜杠）+ `/vault/` + 路径；Bearer + 可选 CF 双头 + 浏览器 UA；
  `rejectUnauthorized` 控制 TLS；错误归一（网络 / 401 / 403 / 404 / 5xx），永不回显 apiKey。
- 路径安全护栏：拒绝绝对路径/盘符/UNC/空路径/`..` 穿越/反斜杠逃逸；`.obsidian/`、`.trash/` 与
  隐藏项写禁（读允许）；`quote(path, safe='/')` 语义编码。
- 写保护与审计：`allowWrite=false` 时写/删在发请求前拒绝；写/删/执行命令经插件 logger 记
  `action / path / by`，日志不含密钥。
- 能力探测：`GET /` 读 manifest/版本；对不支持搜索/DELETE 的老版本给出可读降级错误。
- 测试：node:test + node 内置 http mock 服务器，覆盖读/写/删/列表往返、中文与空格路径、URL 编码、
  路径穿越、`.obsidian` 写禁、缺 key fail-fast、`allowWrite=false` 拒绝且未发请求、CF 双头、UA、
  错误归一。
- 文档：`README.md`（中文）、`SKILL.md`（agent 使用规范）、`cordis.patch.yml` bundle patch。
- `scripts/rest-smoke.mjs`：真库**只读**冒烟（health + 搜索 + 读已知笔记，绝不写）。

### Security

- 写/删默认关闭（`allowWrite=false`）；写/删/执行命令联动 dsh 审批模型（人工确认）。
- 凭证只从用户配置或环境变量读取，零硬编码、零遥测外联。

## Roadmap（本期不做，列入 README）

- backlinks、batch、export_novel 等高级功能；PATCH 精准编辑与 JsonLogic 结构化搜索；浏览器设置页。