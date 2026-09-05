// dsh-obsidian-rest 审批/门控决策（与 dsh tools/pre-execute 审批模型联动）。
// 纯函数，便于单测；index.ts 的 waterfall 监听器仅做转发。
export const WRITE_TOOLS = new Set([
    'obsidian_create_note',
    'obsidian_update_note',
    'obsidian_delete_note',
]);
export const COMMAND_TOOLS = new Set([
    'obsidian_list_commands',
    'obsidian_run_command',
]);
/** 需人工确认（approval）的工具：写/删 + 执行命令。 */
export const ASK_TOOLS = new Set([
    'obsidian_create_note',
    'obsidian_update_note',
    'obsidian_delete_note',
    'obsidian_run_command',
]);
/**
 * 计算一次工具调用在审批瀑布中的决策。
 * - 非本插件工具 → { kind: 'allow' }（调用方应 next() 委托其它监听器）。
 * - 写工具未开 allowWrite / 命令工具未开 allowCommands → deny（不发任何请求）。
 * - 高危写/命令（ASK_TOOLS）→ ask（走 dsh 审批服务）。
 * - 其余（如 obsidian_list_commands 的只读列表）→ allow。
 */
export function preExecuteDecision(tool, args, cfg) {
    const isWrite = WRITE_TOOLS.has(tool);
    const isCommand = COMMAND_TOOLS.has(tool);
    if (!isWrite && !isCommand)
        return { kind: 'allow', owned: false };
    if (isWrite && !cfg.allowWrite) {
        return { kind: 'deny', reason: '写操作未开启：config.allowWrite（未发送任何写请求）', owned: true };
    }
    if (isCommand && !cfg.allowCommands) {
        return { kind: 'deny', reason: '命令操作未开启：config.allowCommands', owned: true };
    }
    if (ASK_TOOLS.has(tool)) {
        const target = (args && typeof args.path === 'string' && args.path)
            ? String(args.path)
            : ((args && typeof args.commandId === 'string' && args.commandId) ? String(args.commandId) : '');
        return {
            kind: 'ask',
            reason: `dsh-obsidian-rest 高危操作需确认：${tool}${target ? ' → ' + target : ''}`,
            owned: true,
        };
    }
    return { kind: 'allow', owned: true };
}
