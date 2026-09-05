// dsh-obsidian-rest 业务服务层：对 client 做门控（allowWrite/allowCommands）、
// 路径护栏与审计日志（R6）。工具 execute 只做薄封装，便于单测。

import { ObsidianClient, ObsidianError } from './client.js';
import { normalizeVaultPath, validateWritablePath } from './pathguard.js';
import type { ResolvedConfig } from './config.js';

/** 工具返回的统一结果对象。 */
export interface VaultResult {
  ok: boolean;
  error: string;
  [key: string]: unknown;
}

export function okResult(props: Record<string, unknown> = {}): VaultResult {
  return { ok: true, error: '', ...props };
}

export function errResult(error: string, props: Record<string, unknown> = {}): VaultResult {
  return { ok: false, error, ...props };
}

function toMessage(e: unknown): string {
  if (e instanceof ObsidianError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

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

export function createVaultService(
  cfg: ResolvedConfig,
  client: ObsidianClient,
  logger: AuditLogger,
): VaultService {
  const writeGate = () => {
    if (!cfg.allowWrite) {
      return errResult('写操作未开启：config.allowWrite（当前 allowWrite=false，未发出任何写请求）');
    }
    return null;
  };
  const commandGate = () => {
    if (!cfg.allowCommands) {
      return errResult('命令操作未开启：config.allowCommands（当前 allowCommands=false，未执行任何命令）');
    }
    return null;
  };

  const audit = (action: string, path: string, by: string) => {
    // 日志只记 action / path / by，绝不落 apiKey / CF secret。
    try {
      logger.warn('dsh-obsidian-rest %s -> %s (by %s)', action, path || '(root)', by || 'unknown');
    } catch {
      /* 审计失败不影响工具执行 */
    }
  };

  return {
    client,

    async health(): Promise<VaultResult> {
      try {
        const manifest = await client.health();
        const info = client.versionInfo();
        return okResult({
          status: (manifest && manifest.status) || 'OK',
          service: info ? info.service : (manifest && manifest.service) || 'Obsidian Local REST API',
          version: info ? info.version : null,
          authenticated: (manifest && (manifest as any).authenticated) ?? null,
          manifest,
        });
      } catch (e) {
        return errResult(toMessage(e), {
          status: null, service: null, version: null, authenticated: null, manifest: null,
        });
      }
    },

    async listDir(path: string): Promise<VaultResult> {
      const trimmed = String(path ?? '').replace(/^\/+/, '');
      let dir = '';
      if (trimmed !== '') {
        const r = normalizeVaultPath(trimmed);
        if (!r.ok) return errResult(r.error!, { path: trimmed, files: [] });
        dir = r.path!;
      }
      try {
        const files = await client.listDir(dir);
        return okResult({ path: dir, files });
      } catch (e) {
        return errResult(toMessage(e), { path: dir, files: [] });
      }
    },

    async readNote(path: string): Promise<VaultResult> {
      const r = normalizeVaultPath(path);
      if (!r.ok) return errResult(r.error!, { path, content: '' });
      try {
        const content = await client.readNote(r.path!);
        return okResult({ path: r.path, content });
      } catch (e) {
        return errResult(toMessage(e), { path: r.path, content: '' });
      }
    },

    async search(query: string, tag?: string, dir?: string): Promise<VaultResult> {
      if (typeof query !== 'string' || !query.trim()) {
        return errResult('缺少查询词 query', { query, results: [] });
      }
      try {
        const results = await client.search(query, { tag, dir });
        return okResult({ query, tag: tag || '', dir: dir || '', results });
      } catch (e) {
        return errResult(toMessage(e), { query, tag: tag || '', dir: dir || '', results: [] });
      }
    },

    async createNote(path: string, content: string, frontmatter: unknown, by: string): Promise<VaultResult> {
      const gate = writeGate();
      if (gate) return gate;
      const r = validateWritablePath(path);
      if (!r.ok) return errResult(r.error!, { path });
      const body = buildNote(content, frontmatter);
      audit('create_note', r.path!, by);
      try {
        await client.putNote(r.path!, body);
        return okResult({ path: r.path });
      } catch (e) {
        return errResult(toMessage(e), { path: r.path });
      }
    },

    async updateNote(path: string, content: string, by: string): Promise<VaultResult> {
      const gate = writeGate();
      if (gate) return gate;
      const r = validateWritablePath(path);
      if (!r.ok) return errResult(r.error!, { path });
      audit('update_note', r.path!, by);
      try {
        await client.putNote(r.path!, content);
        return okResult({ path: r.path });
      } catch (e) {
        return errResult(toMessage(e), { path: r.path });
      }
    },

    async deleteNote(path: string, by: string): Promise<VaultResult> {
      const gate = writeGate();
      if (gate) return gate;
      const r = validateWritablePath(path);
      if (!r.ok) return errResult(r.error!, { path, deleted: false });
      audit('delete_note', r.path!, by);
      try {
        await client.deleteNote(r.path!);
        return okResult({ path: r.path, deleted: true });
      } catch (e) {
        return errResult(toMessage(e), { path: r.path, deleted: false });
      }
    },

    async listCommands(): Promise<VaultResult> {
      try {
        const commands = await client.listCommands();
        return okResult({ commands });
      } catch (e) {
        return errResult(toMessage(e), { commands: [] });
      }
    },

    async runCommand(commandId: string, args: unknown, by: string): Promise<VaultResult> {
      const gate = commandGate();
      if (gate) return gate;
      if (typeof commandId !== 'string' || !commandId.trim()) {
        return errResult('缺少 commandId', { commandId, result: null });
      }
      audit('run_command', commandId, by);
      try {
        const result = await client.runCommand(commandId, args == null ? {} : args);
        return okResult({ commandId, result });
      } catch (e) {
        return errResult(toMessage(e), { commandId, result: null });
      }
    },
  };
}

/** 组装可选的 YAML frontmatter 与正文。 */
export function buildNote(content: string, frontmatter: unknown): string {
  if (frontmatter == null) return content;
  if (typeof frontmatter === 'string') {
    return frontmatter + '\n' + content;
  }
  if (typeof frontmatter === 'object') {
    let yaml = '---\n';
    for (const [k, v] of Object.entries(frontmatter as Record<string, unknown>)) {
      yaml += `${k}: ${formatYamlValue(v)}\n`;
    }
    yaml += '---\n';
    return yaml + content;
  }
  return content;
}

function formatYamlValue(v: unknown): string {
  if (v == null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') {
    if (/[:"#\n{}[\],&*!|>'"%@`]/.test(v)) return JSON.stringify(v);
    return v;
  }
  return JSON.stringify(v);
}

/** 从工具执行上下文提取可辨识的「by」信息（会话/agent，绝不提取凭证）。 */
export function identifyBy(exec: unknown): string {
  try {
    const a = (exec as any)?.agent;
    const sid = a?.session?.id ?? a?.sessionId ?? a?.session;
    if (typeof sid === 'string' && sid) return 'session:' + sid;
    const aid = a?.id ?? a?.agentId;
    if (typeof aid === 'string' && aid) return 'agent:' + aid;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}