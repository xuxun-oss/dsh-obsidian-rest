import type { ResolvedConfig } from './config.js';
export declare const WRITE_TOOLS: Set<string>;
export declare const COMMAND_TOOLS: Set<string>;
/** 需人工确认（approval）的工具：写/删 + 执行命令。 */
export declare const ASK_TOOLS: Set<string>;
export interface PreExecuteDecision {
    kind: 'allow' | 'deny' | 'ask';
    reason?: string;
}
/**
 * 计算一次工具调用在审批瀑布中的决策。
 * - 非本插件工具 → { kind: 'allow' }（调用方应 next() 委托其它监听器）。
 * - 写工具未开 allowWrite / 命令工具未开 allowCommands → deny（不发任何请求）。
 * - 高危写/命令（ASK_TOOLS）→ ask（走 dsh 审批服务）。
 * - 其余（如 obsidian_list_commands 的只读列表）→ allow。
 */
export declare function preExecuteDecision(tool: string, args: Record<string, unknown> | undefined, cfg: ResolvedConfig): PreExecuteDecision & {
    owned: boolean;
};
