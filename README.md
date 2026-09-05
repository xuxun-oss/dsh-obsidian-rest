# dsh-obsidian-rest

> DeepSeek Harness（dsh / cordis 运行时）第三方插件：通过用户自配的 **Obsidian Local REST API**，为 dsh agent 提供 **vault 远程读取 / 搜索 / 写入**能力。remote-REST-first，不依赖本地文件系统、不假设 vault 在本机。

- 🪶 **零运行时依赖**（HTTP 走 node:http / node:https），ESM，Node >= 18，TypeScript 源码编译到 `lib/`（含 `.d.ts`）。
- 🔐 **写默认关**（`allowWrite=false`）：写 / 删 / 命令类工具需显式开启，并联动 dsh 审批模型（写/删/执行命令需人工确认）。
- 🧭 **路径安全护栏**：拒绝绝对路径 / 盘符 / `..` 穿越；`.obsidian/`、`.trash/` 与隐藏项写禁。
- ☁️ 可选 **Cloudflare Access 双头**（`CF-Access-Client-Id` / `CF-Access-Client-Secret`）。
- 📐 能力探测：`GET /` 读 manifest/版本，对「不支持搜索 / DELETE」的老版本给出可读降级错误而非裸 404。

## 安装

插件是普通 npm 包（host 半 cordis 插件）。两种安装方式任选其一：

### 方式一：npm 依赖

```bash
dsh plugin --profile <name> add dsh-obsidian-rest
```

`dsh plugin add` 会把本包加入 `dsh.profile.bundles` 并应用随包附带的 `cordis.patch.yml`（insert 一行，id `dsh-obsidian-rest`）。

### 方式二：GitHub 依赖

在 profile 的 `package.json` 里：

```json
{
  "dependencies": {
    "dsh-obsidian-rest": "github:xuxun-oss/dsh-obsidian-rest#v0.1.0"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-obsidian-rest"]
    }
  }
}
```

## 配置

配置全部用户自填，通过 profile 的 `cordis.patch.yml`（以 id 覆写）传入，或写在 add 后的 insert 行 `config` 里。**必填 `baseUrl` + `apiKey`（或 `apiKeyEnv`），缺一插件加载即 fail-fast 报错**：

> Obsidian 侧：设置 → 社区插件 Local REST API → 复制 API key（Base64）。插件默认自签证书，若走 https 直连可设 `rejectUnauthorized: false`。

### ① 直连（本机）

```yaml
# cordis.patch.yml
- id: dsh-obsidian-rest
  config:
    baseUrl: "http://127.0.0.1:27124"
    apiKeyEnv: OBSIDIAN_API_KEY   # 推荐：密钥从环境变量读，不入库
    allowWrite: false             # 默认关闭，需要写时再开
```

### ② 套 Cloudflare Access（Zero Trust）

```yaml
- id: dsh-obsidian-rest
  config:
    baseUrl: "https://vault.example.com"
    apiKey: "<your-api-key>"      # 或换成 apiKeyEnv
    accessClientId: "<your-access-client-id>"
    accessClientSecret: "<your-access-client-secret>"   # 两个同填才启用 CF 双头
```

### ③ 环境变量取 key（推荐）

```yaml
- id: dsh-obsidian-rest
  config:
    baseUrl: "https://vault.example.com"
    apiKeyEnv: OBSIDIAN_API_KEY   # 从 process.env["OBSIDIAN_API_KEY"] 读，优先于 apiKey
```

### ④ 自签证书

Local REST API 默认自签；直连 `https://127.0.0.1:27124` 时关闭校验即可（默认已关）：

```yaml
- id: dsh-obsidian-rest
  config:
    baseUrl: "https://127.0.0.1:27124"
    apiKeyEnv: OBSIDIAN_API_KEY
    rejectUnauthorized: false     # 默认 false；走正规 CA（如 CF）可设 true
```

### 完整字段

| 字段 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `baseUrl` | 是 | — | Obsidian REST 根，如 `http://127.0.0.1:27124` 或 `https://vault.example.com` |
| `apiKey` | 二选一 | — | Local REST API 的 key（Base64） |
| `apiKeyEnv` | 二选一 | — | 从 `process.env[名]` 读，优先于 `apiKey` |
| `accessClientId` / `accessClientSecret` | 否 | — | 两个同填才启用 CF-Access 双头 |
| `rejectUnauthorized` | 否 | `false` | 直连自签证书时关闭 TLS 校验 |
| `allowWrite` | 否 | `false` | 写/删工具总开关 |
| `allowCommands` | 否 | `false` | `obsidian_run_command` 类总开关（高危） |
| `ua` | 否 | Mozilla UA | 防 CF WAF 拦脚本 UA（403/1010） |
| `timeoutMs` | 否 | `30000` | 请求超时（毫秒） |

## 工具表

| 工具 | 类型 | 端点 | 说明 |
|---|---|---|---|
| `obsidian_health` | 只读 | `GET /` | 探测服务状态、版本与认证 |
| `obsidian_list_dir(path)` | 只读 | `GET /vault/{path}/` | 目录列表（尾斜杠） |
| `obsidian_read_note(path)` | 只读 | `GET /vault/{path}` | 读笔记全文 |
| `obsidian_search(query, {tag?, dir?})` | 只读 | `POST /search/simple/?query=` | 全文搜索 |
| `obsidian_create_note(path, content, {frontmatter?})` | 写（`allowWrite`） | `PUT /vault/{path}` | 新建笔记 |
| `obsidian_update_note(path, content)` | 写（`allowWrite`） | `PUT /vault/{path}` | 整篇覆盖（frontmatter 保留是 agent 职责） |
| `obsidian_delete_note(path)` | 写（`allowWrite`）⚠️ | `DELETE /vault/{path}` | 永久删除，无回收站 |
| `obsidian_list_commands` | 命令（`allowCommands`） | `GET /commands/` | 列出可执行命令 |
| `obsidian_run_command(commandId, args?)` | 命令（`allowCommands`）⚠️ | `POST /commands/{commandId}/` | 执行命令 |

- 读工具免费审批；写/删/执行命令走 dsh 审批模型（人工确认后才执行）。
- `obsidian_update_note` 是**整篇覆盖**：想保留 frontmatter 请先 `obsidian_read_note` 读出现文、自行保留 frontmatter 再写回（见 `SKILL.md`）。

## 安全说明

- **API key ≈ 全库权限**：拥有 key 即可读/写/删整个 vault。用 `apiKeyEnv` 从环境变量取 key，切勿把真实密钥写进版本库 / README / 日志。
- **写默认关**：`allowWrite=false` 时任何写/删请求都不会发出（在发出 HTTP 前即拒绝）。
- **凭证不入库 / 不入日志**：审计日志只记 `action / path / by`，绝不含 API key / CF secret。
- **无遥测无外联**：插件运行时只连接你配置的 `baseUrl`，无任何统计 / 回传端点。
- **路径护栏**：拒绝绝对路径 / `..` 穿越 / 反斜杠逃逸变体；`.obsidian/`、`.trash/` 及 `.` 开头隐藏项写禁（读允许）。

## 兼容性与降级

- 最低支持 **obsidian-local-rest-api v3.6.0**（`/search/simple/` 全文搜索、尾斜杠目录列表均在该版本起稳定）。
- `baseUrl` 支持 `http` 与 `https`。
- `rejectUnauthorized` 控制 TLS（Node https）；`ua` 默认浏览器串以规避 CF WAF 403/1010。
- 响应错误归一：网络错误 / 401（key 错）/ 403（CF 或服务端拦）/ 404 / 5xx，message 可读且**永不回显 apiKey**。
- 对不支持搜索 / DELETE 的老版本：`GET /` 失败或 404 时返回可读降级错误，而非裸 404。

## 开发

```bash
npm install          # 安装 devDependencies（typescript 等）
npm run build        # tsc -> lib/
npm test             # build + node --test（mock Obsidian REST，32 个用例）
npm run mock         # 独立启动 mock 服务器（http://127.0.0.1:27300）
npm run smoke        # 真库只读冒烟（若 ~/.secrets/obsidian-rest.env 存在）
```

### 真库只读冒烟

`npm run smoke` 只做 **health + 一次搜索 + 一次读已知笔记**，**绝不写**。若 `~/.secrets/obsidian-rest.env`（600 权限，变量名见脚本头注释）存在则读入；网络不可达时给出原因，不阻塞发布。

## Roadmap（v1 本地版有、本期不做）

- backlinks / 反向链接
- batch 批量读写
- export_novel 等高级导出
- `PATCH` 精准编辑（保留 frontmatter 自动合并）
- JsonLogic 结构化搜索（`POST /search/`，按 tag/frontmatter 过滤）
- 浏览器设置页（GUI 配 key / 测连接）

## License

[MIT](LICENSE) © 2026 Xun Xu