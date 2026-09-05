// dsh-obsidian-rest 工具集（R3 + R6）。
// obsidian_* 命名；读免审批、写/删/命令走 approval（见 index.ts 的 tools/pre-execute）。
// 工具 execute 只做薄转发到 service（service 内完成门控/护栏/审计）。
import { defineTool } from '@deepseek-ai/dsh-tools';
import { identifyBy } from './service.js';
const BASE_ERR = '（dsh-obsidian-rest）';
function text(lines) {
    return [{ type: 'text', text: lines.join('\n') }];
}
function listBriefish(files) {
    if (!files.length)
        return '(空目录)';
    return files.slice(0, 50).map((f) => {
        if (typeof f === 'string')
            return f;
        if (f && typeof f === 'object') {
            const o = f;
            return String(o.filename ?? o.name ?? o.path ?? JSON.stringify(f));
        }
        return String(f);
    }).join('\n');
}
/** 注册全部 obsidian_* 工具。 */
export function registerTools(ctx, svc) {
    ctx.tools.register(defineTool({
        name: 'obsidian_health',
        description: '探测 Obsidian Local REST API 状态：GET / 返回服务状态、版本与认证情况，确认 vault 远程端点可用。',
        parameters: {},
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean', required: true },
                    error: { type: 'string', required: true },
                    status: { type: 'string', required: true },
                    service: { type: 'string', required: true },
                    version: { type: 'json', required: true },
                    authenticated: { type: 'json', required: true },
                    manifest: { type: 'json', required: true },
                },
            },
            render(args, v) {
                if (!v.ok)
                    return text(['❌ Obsidian 端点探测失败' + BASE_ERR + v.error]);
                return text([
                    '✅ Obsidian REST 端点可用',
                    '服务: ' + (v.service || '-'),
                    '版本: ' + (v.version ? JSON.stringify(v.version) : '-'),
                    '认证: ' + (v.authenticated === true ? '已通过' : String(v.authenticated)),
                ]);
            },
        },
        timeoutMs: 30000,
        async execute(_args, _exec) {
            return (await svc.health());
        },
    }));
    ctx.tools.register(defineTool({
        name: 'obsidian_list_dir',
        description: '列出 vault 中一个目录的内容（尾斜杠目录列表）。path 传 vault 相对目录，如 ""（根）、"Notes"、"folder/sub"。只读。',
        parameters: {
            path: { type: 'string', required: true, description: 'vault 相对目录路径（空字符串或 "/" 表示根目录）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean', required: true },
                    error: { type: 'string', required: true },
                    path: { type: 'string', required: true },
                    files: { type: 'array', items: { type: 'json' }, required: true },
                },
            },
            render(_args, v) {
                if (!v.ok)
                    return text(['❌ 目录列表失败' + BASE_ERR + v.error]);
                return text(['📁 目录 ' + (v.path || '(根)') + ' 共 ' + v.files.length + ' 项', listBriefish(v.files)]);
            },
        },
        timeoutMs: 30000,
        async execute(args) {
            const p = String(args.path || '');
            return (await svc.listDir(p.replace(/^\/+/, '')));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'obsidian_read_note',
        description: '读取 vault 中一个笔记/文件的完整内容（无尾斜杠）。path 为 vault 相对路径，如 "Notes/meeting.md"。只读。',
        parameters: {
            path: { type: 'string', required: true, description: 'vault 相对文件路径' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean', required: true },
                    error: { type: 'string', required: true },
                    path: { type: 'string', required: true },
                    content: { type: 'string', required: true },
                },
            },
            render(_args, v) {
                if (!v.ok)
                    return text(['❌ 读取失败' + BASE_ERR + v.error]);
                return text(['📄 ' + v.path + '（' + v.content.length + ' 字符）', v.content]);
            },
        },
        timeoutMs: 30000,
        async execute(args) {
            return (await svc.readNote(String(args.path)));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'obsidian_search',
        description: '在 vault 中全文搜索（REST 全文搜索端点），按文件名与内容打分返回。可选 tag / dir 过滤。只读。',
        parameters: {
            query: { type: 'string', required: true, description: '搜索关键词' },
            tag: { type: 'string', description: '可选：按标签过滤（best-effort，取决于服务端是否支持）' },
            dir: { type: 'string', description: '可选：限定在某个目录下搜索' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean', required: true },
                    error: { type: 'string', required: true },
                    query: { type: 'string', required: true },
                    tag: { type: 'string', required: true },
                    dir: { type: 'string', required: true },
                    results: { type: 'json', required: true },
                },
            },
            render(_args, v) {
                if (!v.ok)
                    return text(['❌ 搜索失败' + BASE_ERR + v.error]);
                const n = Array.isArray(v.results) ? v.results.length : 0;
                return text(['🔎 搜索「' + v.query + '」命中 ' + n + ' 条', JSON.stringify(v.results)]);
            },
        },
        timeoutMs: 30000,
        async execute(args) {
            return (await svc.search(String(args.query || ''), args.tag ? String(args.tag) : undefined, args.dir ? String(args.dir) : undefined));
        },
    }));
    // ---- 写入类（受 config.allowWrite 门控 + approval） ----
    ctx.tools.register(defineTool({
        name: 'obsidian_create_note',
        description: '在 vault 中新建一个笔记（PUT，body {"content":...}）。受 config.allowWrite 门控，默认关闭；未开启时返回明确错误。path 为 vault 相对路径。',
        parameters: {
            path: { type: 'string', required: true, description: 'vault 相对路径，如 "Notes/新建笔记.md"' },
            content: { type: 'string', required: true, description: '笔记正文（Markdown）' },
            frontmatter: { type: 'json', description: '可选：YAML frontmatter 键值对象（如 {"tags":["a"],"title":"t"}），会被序列化为 frontmatter 头' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean', required: true },
                    error: { type: 'string', required: true },
                    path: { type: 'string', required: true },
                },
            },
            render(_args, v) {
                if (!v.ok)
                    return text(['❌ 创建失败' + BASE_ERR + v.error]);
                return text(['✅ 已创建笔记 ' + v.path]);
            },
        },
        timeoutMs: 30000,
        async execute(args, exec) {
            return (await svc.createNote(String(args.path), String(args.content), args.frontmatter ?? null, identifyBy(exec)));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'obsidian_update_note',
        description: '整篇覆盖写入一个已有笔记（PUT）。会覆盖全文——若想保留 frontmatter，请先 obsidian_read_note 读出现文、自行保留 frontmatter 再写回（这是 agent 职责，见 SKILL.md）。受 config.allowWrite 门控。',
        parameters: {
            path: { type: 'string', required: true, description: 'vault 相对路径' },
            content: { type: 'string', required: true, description: '新的完整正文（Markdown）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean', required: true },
                    error: { type: 'string', required: true },
                    path: { type: 'string', required: true },
                },
            },
            render(_args, v) {
                if (!v.ok)
                    return text(['❌ 更新失败' + BASE_ERR + v.error]);
                return text(['✅ 已覆盖写入 ' + v.path]);
            },
        },
        timeoutMs: 30000,
        async execute(args, exec) {
            return (await svc.updateNote(String(args.path), String(args.content), identifyBy(exec)));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'obsidian_delete_note',
        description: '⚠️ 永久删除 vault 中的一个笔记（DELETE）。Local REST API 无回收站语义，删除不可恢复，请务必先与用户确认。受 config.allowWrite 门控 + approval。',
        parameters: {
            path: { type: 'string', required: true, description: 'vault 相对路径（将被永久删除，无回收站）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean', required: true },
                    error: { type: 'string', required: true },
                    path: { type: 'string', required: true },
                    deleted: { type: 'boolean', required: true },
                },
            },
            render(_args, v) {
                if (!v.ok)
                    return text(['❌ 删除失败' + BASE_ERR + v.error]);
                return text(['🗑️ 已永久删除 ' + v.path + '（不可恢复）']);
            },
        },
        timeoutMs: 30000,
        async execute(args, exec) {
            return (await svc.deleteNote(String(args.path), identifyBy(exec)));
        },
    }));
    // ---- 命令类（受 config.allowCommands 门控 + approval，高危） ----
    ctx.tools.register(defineTool({
        name: 'obsidian_list_commands',
        description: '列出 Obsidian 可执行的命令（GET /commands/）。只读；用于配合 obsidian_run_command。',
        parameters: {},
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean', required: true },
                    error: { type: 'string', required: true },
                    commands: { type: 'array', items: { type: 'json' }, required: true },
                },
            },
            render(_args, v) {
                if (!v.ok)
                    return text(['❌ 命令列表失败' + BASE_ERR + v.error]);
                return text(['⚙️ 可用命令 ' + v.commands.length + ' 个', JSON.stringify(v.commands)]);
            },
        },
        timeoutMs: 30000,
        async execute() {
            return (await svc.listCommands());
        },
    }));
    ctx.tools.register(defineTool({
        name: 'obsidian_run_command',
        description: '⚠️ 在 Obsidian 中执行一个命令（POST /commands/{commandId}/），如命令面板触发的动作。受 config.allowCommands 门控（高危，默认关闭）+ approval。commandId 请先用 obsidian_list_commands 查询。',
        parameters: {
            commandId: { type: 'string', required: true, description: '要执行的 Obsidian 命令 ID' },
            args: { type: 'json', description: '可选：命令参数（JSON 对象）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean', required: true },
                    error: { type: 'string', required: true },
                    commandId: { type: 'string', required: true },
                    result: { type: 'json', required: true },
                },
            },
            render(_args, v) {
                if (!v.ok)
                    return text(['❌ 命令执行失败' + BASE_ERR + v.error]);
                return text(['✅ 已执行命令 ' + v.commandId, JSON.stringify(v.result)]);
            },
        },
        timeoutMs: 60000,
        async execute(args, exec) {
            return (await svc.runCommand(String(args.commandId), args.args ?? null, identifyBy(exec)));
        },
    }));
}
