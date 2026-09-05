import type { Context } from '@deepseek-ai/cordis';
/** Cordis 插件名——必须与 cordis.patch.yml 里的行 id 一致。 */
export declare const name = "dsh-obsidian-rest";
/** 硬依赖服务。tools 用于注册工具；logger 为 cordis 基础服务，无需 inject。 */
export declare const inject: string[];
export declare function apply(ctx: Context, config?: unknown): void;
export default apply;
