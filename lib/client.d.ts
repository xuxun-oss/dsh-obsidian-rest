import type { ResolvedConfig } from './config.js';
/** 归一后的响应（含解析 JSON）。 */
export interface HttpResult {
    status: number;
    data: unknown;
    text: string;
}
/** 归一化错误：结构化，message 对 agent 可读，绝不含 apiKey。 */
export declare class ObsidianError extends Error {
    status?: number;
    constructor(message: string, status?: number);
}
export declare class ObsidianClient {
    readonly cfg: ResolvedConfig;
    readonly baseUrl: string;
    /** 能力探测缓存（GET / 返回的 manifest）。 */
    manifest: Record<string, unknown> | null;
    /** 由上层（mock/测试）注入的请求计数器等可选观测点。 */
    requestCount: number;
    constructor(cfg: ResolvedConfig);
    request(method: string, urlPath: string, body?: unknown): Promise<HttpResult>;
    /** 非 2xx 时抛出归一化 ObsidianError。 */
    requestOk(method: string, urlPath: string, body?: unknown): Promise<HttpResult>;
    /** GET / —— 探测版本与能力。 */
    health(): Promise<Record<string, unknown>>;
    /** GET /vault/{path}/ —— 目录列表（尾斜杠；空路径 = 根）。 */
    listDir(path: string): Promise<unknown[]>;
    /** GET /vault/{path} —— 读笔记（无尾斜杠）。 */
    readNote(path: string): Promise<string>;
    /** PUT /vault/{path} —— 创建/覆盖写入（body {"content":...}）。 */
    putNote(path: string, content: string): Promise<void>;
    /** DELETE /vault/{path} —— 删除（不可恢复）。 */
    deleteNote(path: string): Promise<void>;
    /** POST /search/simple/?query=... —— 全文搜索（tag/dir 为可选附加参数）。 */
    search(query: string, opts?: {
        tag?: string;
        dir?: string;
    }): Promise<unknown>;
    /** GET /commands/ —— 命令列表。 */
    listCommands(): Promise<unknown[]>;
    /** POST /commands/{commandId}/ —— 执行命令。 */
    runCommand(commandId: string, args?: unknown): Promise<unknown>;
    /** 从 manifest 提取版本号（能力探测），取不到返回 null。 */
    versionInfo(): {
        version: string;
        service: string;
    } | null;
    /** 探测 manifest 中是否声明了某个能力。 */
    hasCapability(name: string): boolean;
}
