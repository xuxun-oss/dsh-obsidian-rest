import { ObsidianClient } from './client.js';
import type { ResolvedConfig } from './config.js';
/** 工具返回的统一结果对象。 */
export interface VaultResult {
    ok: boolean;
    error: string;
    [key: string]: unknown;
}
export declare function okResult(props?: Record<string, unknown>): VaultResult;
export declare function errResult(error: string, props?: Record<string, unknown>): VaultResult;
/** 审计日志接口（与 ctx.logger 兼容，便于测试注入）。 */
export interface AuditLogger {
    info(format: string, ...args: unknown[]): void;
    warn(format: string, ...args: unknown[]): void;
    error(format: string, ...args: unknown[]): void;
}
export interface VaultService {
    health(): Promise<VaultResult>;
    listDir(path: string): Promise<VaultResult>;
    readNote(path: string): Promise<VaultResult>;
    search(query: string, tag?: string, dir?: string): Promise<VaultResult>;
    createNote(path: string, content: string, frontmatter: unknown, by: string): Promise<VaultResult>;
    updateNote(path: string, content: string, by: string): Promise<VaultResult>;
    deleteNote(path: string, by: string): Promise<VaultResult>;
    listCommands(): Promise<VaultResult>;
    runCommand(commandId: string, args: unknown, by: string): Promise<VaultResult>;
    /** 暴露 client 供测试观测（如写请求计数、manifest）。 */
    readonly client: ObsidianClient;
}
export declare function createVaultService(cfg: ResolvedConfig, client: ObsidianClient, logger: AuditLogger): VaultService;
/** 组装可选的 YAML frontmatter 与正文。 */
export declare function buildNote(content: string, frontmatter: unknown): string;
/** 从工具执行上下文提取可辨识的「by」信息（会话/agent，绝不提取凭证）。 */
export declare function identifyBy(exec: unknown): string;
