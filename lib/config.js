// dsh-obsidian-rest 配置层：schemastery Schema + 启动 fail-fast 校验。
// 红线：一切凭证只来自用户配置或环境变量；代码零硬编码。
import z from '@deepseek-ai/schemastery';
/** 默认浏览器 UA（防 CF WAF 拦脚本 UA 返回 403/1010）。 */
export const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
/** 配置 Schema（全部用户自填；默认值见 spec R2）。 */
export const Config = z.object({
    /** Obsidian Local REST API 根地址（用户自填），如 https://vault.example.com */
    baseUrl: z.string().default(''),
    /** API key（Base64）直填；与 apiKeyEnv 二选一，apiKeyEnv 优先 */
    apiKey: z.string().default(''),
    /** 从 process.env[apiKeyEnv] 读 key（优先于 apiKey） */
    apiKeyEnv: z.string().default(''),
    /** Cloudflare Access Service Token 双头（两个都填才启用） */
    accessClientId: z.string().default(''),
    accessClientSecret: z.string().default(''),
    /** 直连自签证书时关闭 TLS 校验（Local REST API 默认自签） */
    rejectUnauthorized: z.boolean().default(false),
    /** 写/删工具总开关（默认关） */
    allowWrite: z.boolean().default(false),
    /** obsidian_run_command 类总开关（默认关，高危） */
    allowCommands: z.boolean().default(false),
    /** User-Agent（默认浏览器串，避免被 CF WAF 拦截） */
    ua: z.string().default(DEFAULT_UA),
    /** 请求超时（毫秒） */
    timeoutMs: z.number().default(30000),
});
function errText(e) {
    if (e instanceof Error)
        return e.message;
    return String(e);
}
/**
 * 解析并校验配置。缺 baseUrl 或 apiKey（含 apiKeyEnv 指向的环境变量不存在）
 * 时抛出包含操作指引的错误（fail-fast，插件加载即报错）。
 */
export function resolveConfig(raw) {
    let cfg;
    try {
        cfg = Config(raw == null ? {} : raw);
    }
    catch (e) {
        throw new Error('dsh-obsidian-rest 配置不合法：' + errText(e));
    }
    const baseUrl = String(cfg.baseUrl || '').trim().replace(/\/+$/, '');
    // apiKey 解析：apiKeyEnv 优先。
    let apiKey = '';
    if (cfg.apiKeyEnv) {
        apiKey = process.env[cfg.apiKeyEnv] ?? '';
    }
    if (!apiKey)
        apiKey = String(cfg.apiKey || '').trim();
    const errors = [];
    if (!baseUrl) {
        errors.push('缺少 baseUrl（请填写你自己的 Obsidian Local REST API 地址，如 https://vault.example.com，参考 Obsidian 社区插件 Local REST API 的设置）');
    }
    if (!apiKey) {
        errors.push(cfg.apiKeyEnv
            ? `apiKeyEnv "${cfg.apiKeyEnv}" 指向的环境变量不存在或为空`
            : '缺少 apiKey（Obsidian 设置 → 社区插件 Local REST API → 复制 API key）');
    }
    if (errors.length) {
        throw new Error('dsh-obsidian-rest 启动校验失败：' + errors.join('；'));
    }
    return {
        baseUrl,
        apiKey,
        apiKeyEnv: String(cfg.apiKeyEnv || ''),
        accessClientId: String(cfg.accessClientId || '').trim(),
        accessClientSecret: String(cfg.accessClientSecret || '').trim(),
        rejectUnauthorized: !!cfg.rejectUnauthorized,
        allowWrite: !!cfg.allowWrite,
        allowCommands: !!cfg.allowCommands,
        ua: String(cfg.ua || DEFAULT_UA),
        timeoutMs: Number(cfg.timeoutMs) || 30000,
    };
}
