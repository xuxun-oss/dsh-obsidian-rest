// dsh-obsidian-rest —— 远程 Obsidian vault REST 读写插件（host 半）。
// remote-REST-first：通过用户自配的 Obsidian Local REST API（baseUrl + apiKey，
// 可选 Cloudflare Access 双头）为 dsh agent 提供 vault 读取/搜索/写入能力。
// 红线：零硬编码、凭证只从配置/环境变量读取、写默认关、无遥测外联。
import { resolveConfig } from './config.js';
import { ObsidianClient } from './client.js';
import { createVaultService } from './service.js';
import { registerTools } from './tools.js';
import { preExecuteDecision } from './approval.js';
/** Cordis 插件名——必须与 cordis.patch.yml 里的行 id 一致。 */
export const name = 'dsh-obsidian-rest';
/** 硬依赖服务。tools 用于注册工具；logger 为 cordis 基础服务，无需 inject。 */
export const inject = ['tools'];
export function apply(ctx, config = {}) {
    // 启动 fail-fast 校验：缺 baseUrl / apiKey 直接抛错，插件加载即失败。
    const cfg = resolveConfig(config);
    const client = new ObsidianClient(cfg);
    const logger = ctx.logger(name);
    const svc = createVaultService(cfg, client, logger);
    // 写/命令的审批与门控（读免审批）：与 dsh 审批模型联动。
    ctx.on('tools/pre-execute', (exec, next) => {
        const decision = preExecuteDecision(exec.name, exec.arguments, cfg);
        if (!decision.owned)
            return next();
        if (decision.kind === 'allow')
            return next();
        return { kind: decision.kind, reason: decision.reason };
    });
    registerTools(ctx, svc);
}
export default apply;
