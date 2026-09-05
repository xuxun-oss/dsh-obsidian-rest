// dsh-obsidian-rest HTTP 请求层（R4）。
// 统一 client：URL = baseUrl(去尾斜杠) + 路径；头含 Bearer/可选 CF 双头/UA；
// rejectUnauthorized 控制 TLS；错误归一为结构化可读对象，永不回显 apiKey。

import http from 'node:http';
import https from 'node:https';
import type { ResolvedConfig } from './config.js';
import { encodeVaultPath } from './pathguard.js';

/** 归一后的响应（含解析 JSON）。 */
export interface HttpResult {
  status: number;
  data: unknown;
  text: string;
}

/** 归一化错误：结构化，message 对 agent 可读，绝不含 apiKey。 */
export class ObsidianError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ObsidianError';
    if (status !== undefined) this.status = status;
  }
}

function netError(err: unknown): ObsidianError {
  const e = err as NodeJS.ErrnoException;
  const code = e && e.code ? ` (${e.code})` : '';
  if (e && e.code === 'ECONNREFUSED') {
    return new ObsidianError('网络错误：无法连接 baseUrl（连接被拒绝）。请确认 Obsidian 与 Local REST API 正在运行');
  }
  if (e && e.code === 'ENOTFOUND') return new ObsidianError('网络错误：无法解析 baseUrl 域名' + code);
  if (e && (e.code === 'ETIMEDOUT' || e.code === 'ABORT_ERR')) {
    return new ObsidianError('请求超时（' + code + '）');
  }
  if (e && /CERT_|DEPTH_ZERO_SELF_SIGNED|UNABLE_TO_VERIFY|SELF_SIGNED/.test(String(e.code || ''))) {
    return new ObsidianError('TLS 证书校验失败' + code + '：如为自签证书，请在配置中设 rejectUnauthorized=false');
  }
  if (e && typeof e.message === 'string' && /超时|timeout/i.test(e.message)) {
    return new ObsidianError('请求超时');
  }
  return new ObsidianError('网络错误' + code + (e && e.message ? '：' + e.message : ''));
}

function httpError(status: number, data: unknown): ObsidianError {
  const m = data && typeof data === 'object' && (data as any).message
    ? String((data as any).message) : '';
  const tail = m ? ' — ' + m : '';
  if (status === 401) return new ObsidianError('认证失败（HTTP 401）：API key 无效或缺失' + tail, status);
  if (status === 403) return new ObsidianError('访问被拒绝（HTTP 403）：被 Cloudflare Access 或服务端拦截' + tail, status);
  if (status === 404) return new ObsidianError('路径或端点不存在（HTTP 404）' + tail, status);
  if (status >= 500) return new ObsidianError('Obsidian 服务端错误（HTTP ' + status + '）' + tail, status);
  return new ObsidianError('HTTP ' + status + tail, status);
}

export class ObsidianClient {
  readonly cfg: ResolvedConfig;
  readonly baseUrl: string;
  /** 能力探测缓存（GET / 返回的 manifest）。 */
  manifest: Record<string, unknown> | null = null;
  /** 由上层（mock/测试）注入的请求计数器等可选观测点。 */
  requestCount = 0;

  constructor(cfg: ResolvedConfig) {
    this.cfg = cfg;
    this.baseUrl = cfg.baseUrl;
  }

  request(method: string, urlPath: string, body?: unknown): Promise<HttpResult> {
    this.requestCount++;
    return new Promise<HttpResult>((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(this.baseUrl + (urlPath || '/'));
      } catch (e) {
        reject(new ObsidianError('baseUrl 非法：' + String((e as Error).message)));
        return;
      }
      const isHttps = url.protocol === 'https:';
      const mod = isHttps ? https : http;

      const headers: Record<string, string> = {
        Authorization: 'Bearer ' + this.cfg.apiKey,
        'User-Agent': this.cfg.ua,
        Accept: 'application/json, text/plain, text/markdown, */*',
      };
      if (this.cfg.accessClientId && this.cfg.accessClientSecret) {
        headers['CF-Access-Client-Id'] = this.cfg.accessClientId;
        headers['CF-Access-Client-Secret'] = this.cfg.accessClientSecret;
      }

      let payload: string | undefined;
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }

      const opts: https.RequestOptions = { method, headers };
      if (isHttps) opts.rejectUnauthorized = this.cfg.rejectUnauthorized;

      const req = mod.request(url, opts, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data: unknown = null;
          try { data = text ? JSON.parse(text) : null; } catch { data = null; }
          resolve({ status: res.statusCode || 0, data, text });
        });
      });

      req.setTimeout(this.cfg.timeoutMs, () => {
        req.destroy(Object.assign(new Error('请求超时（' + this.cfg.timeoutMs + 'ms）'), { code: 'ETIMEDOUT' }));
      });
      req.on('error', (err) => reject(netError(err)));
      if (payload) req.write(payload);
      req.end();
    });
  }

  /** 非 2xx 时抛出归一化 ObsidianError。 */
  async requestOk(method: string, urlPath: string, body?: unknown): Promise<HttpResult> {
    const res = await this.request(method, urlPath, body);
    if (res.status < 200 || res.status >= 300) {
      throw httpError(res.status, res.data);
    }
    return res;
  }

  /** GET / —— 探测版本与能力。 */
  async health(): Promise<Record<string, unknown>> {
    const res = await this.requestOk('GET', '/');
    this.manifest = (res.data && typeof res.data === 'object') ? (res.data as Record<string, unknown>) : {};
    return this.manifest;
  }

  /** GET /vault/{path}/ —— 目录列表（尾斜杠；空路径 = 根）。 */
  async listDir(path: string): Promise<unknown[]> {
    const seg = path ? encodeVaultPath(path) + '/' : '';
    const res = await this.requestOk('GET', '/vault/' + seg);
    const files = res.data && typeof res.data === 'object' && Array.isArray((res.data as any).files)
      ? (res.data as any).files : [];
    return files;
  }

  /** GET /vault/{path} —— 读笔记（无尾斜杠）。 */
  async readNote(path: string): Promise<string> {
    const res = await this.requestOk('GET', '/vault/' + encodeVaultPath(path));
    // 优先原始文本；部分服务端以 JSON 包装时取 data.content。
    if (typeof res.data === 'string') return res.data;
    if (res.data && typeof res.data === 'object' && typeof (res.data as any).content === 'string') {
      return (res.data as any).content;
    }
    return res.text;
  }

  /** PUT /vault/{path} —— 创建/覆盖写入（body {"content":...}）。 */
  async putNote(path: string, content: string): Promise<void> {
    await this.requestOk('PUT', '/vault/' + encodeVaultPath(path), { content });
  }

  /** DELETE /vault/{path} —— 删除（不可恢复）。 */
  async deleteNote(path: string): Promise<void> {
    await this.requestOk('DELETE', '/vault/' + encodeVaultPath(path));
  }

  /** POST /search/simple/?query=... —— 全文搜索（tag/dir 为可选附加参数）。 */
  async search(query: string, opts?: { tag?: string; dir?: string }): Promise<unknown> {
    const params = new URLSearchParams();
    params.set('query', query || '');
    if (opts?.tag) params.set('tag', opts.tag);
    if (opts?.dir) params.set('dir', opts.dir);
    const res = await this.requestOk('POST', '/search/simple/?' + params.toString());
    return res.data;
  }

  /** GET /commands/ —— 命令列表。 */
  async listCommands(): Promise<unknown[]> {
    const res = await this.requestOk('GET', '/commands/');
    const commands = res.data && typeof res.data === 'object' && Array.isArray((res.data as any).commands)
      ? (res.data as any).commands : [];
    return commands;
  }

  /** POST /commands/{commandId}/ —— 执行命令。 */
  async runCommand(commandId: string, args?: unknown): Promise<unknown> {
    const res = await this.requestOk('POST', '/commands/' + encodeURIComponent(commandId) + '/', args == null ? {} : args);
    return res.data;
  }

  /** 从 manifest 提取版本号（能力探测），取不到返回 null。 */
  versionInfo(): { version: string; service: string } | null {
    const m = this.manifest;
    if (!m) return null;
    const get = (...keys: string[]) => {
      for (const k of keys) {
        let v: unknown = m;
        for (const seg of k.split('.')) {
          if (v && typeof v === 'object') v = (v as any)[seg];
          else { v = undefined; break; }
        }
        if (typeof v === 'string' && v) return v;
      }
      return null;
    };
    const version = get('manifest.version', 'versions.self', 'versions.obsidian', 'appVersion', 'version') || '';
    const service = get('service', 'appId', 'manifest.id') || '';
    return version ? { version, service } : null;
  }

  /** 探测 manifest 中是否声明了某个能力。 */
  hasCapability(name: string): boolean {
    const m = this.manifest;
    if (!m) return false;
    return String((m as any)[name] ?? '') !== '';
  }
}