import z from '@deepseek-ai/schemastery';
/** 默认浏览器 UA（防 CF WAF 拦脚本 UA 返回 403/1010）。 */
export declare const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
/** 配置 Schema（全部用户自填；默认值见 spec R2）。 */
export declare const Config: z<Schemastery.ObjectS<{
    /** Obsidian Local REST API 根地址（用户自填），如 https://vault.example.com */
    baseUrl: z<string, string>;
    /** API key（Base64）直填；与 apiKeyEnv 二选一，apiKeyEnv 优先 */
    apiKey: z<string, string>;
    /** 从 process.env[apiKeyEnv] 读 key（优先于 apiKey） */
    apiKeyEnv: z<string, string>;
    /** Cloudflare Access Service Token 双头（两个都填才启用） */
    accessClientId: z<string, string>;
    accessClientSecret: z<string, string>;
    /** 直连自签证书时关闭 TLS 校验（Local REST API 默认自签） */
    rejectUnauthorized: z<boolean, boolean>;
    /** 写/删工具总开关（默认关） */
    allowWrite: z<boolean, boolean>;
    /** obsidian_run_command 类总开关（默认关，高危） */
    allowCommands: z<boolean, boolean>;
    /** User-Agent（默认浏览器串，避免被 CF WAF 拦截） */
    ua: z<string, string>;
    /** 请求超时（毫秒） */
    timeoutMs: z<number, number>;
}>, Schemastery.ObjectT<{
    /** Obsidian Local REST API 根地址（用户自填），如 https://vault.example.com */
    baseUrl: z<string, string>;
    /** API key（Base64）直填；与 apiKeyEnv 二选一，apiKeyEnv 优先 */
    apiKey: z<string, string>;
    /** 从 process.env[apiKeyEnv] 读 key（优先于 apiKey） */
    apiKeyEnv: z<string, string>;
    /** Cloudflare Access Service Token 双头（两个都填才启用） */
    accessClientId: z<string, string>;
    accessClientSecret: z<string, string>;
    /** 直连自签证书时关闭 TLS 校验（Local REST API 默认自签） */
    rejectUnauthorized: z<boolean, boolean>;
    /** 写/删工具总开关（默认关） */
    allowWrite: z<boolean, boolean>;
    /** obsidian_run_command 类总开关（默认关，高危） */
    allowCommands: z<boolean, boolean>;
    /** User-Agent（默认浏览器串，避免被 CF WAF 拦截） */
    ua: z<string, string>;
    /** 请求超时（毫秒） */
    timeoutMs: z<number, number>;
}>>;
/** 校验/归一化后的配置。 */
export interface ResolvedConfig {
    baseUrl: string;
    apiKey: string;
    apiKeyEnv: string;
    accessClientId: string;
    accessClientSecret: string;
    rejectUnauthorized: boolean;
    allowWrite: boolean;
    allowCommands: boolean;
    ua: string;
    timeoutMs: number;
}
/**
 * 解析并校验配置。缺 baseUrl 或 apiKey（含 apiKeyEnv 指向的环境变量不存在）
 * 时抛出包含操作指引的错误（fail-fast，插件加载即报错）。
 */
export declare function resolveConfig(raw: unknown): ResolvedConfig;
