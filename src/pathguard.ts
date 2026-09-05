// dsh-obsidian-rest 路径安全护栏（R5）。
// 纯函数，零依赖，便于单测。

export interface PathResult {
  ok: boolean;
  /** 规范化后的 vault 相对路径（posix，无前导/尾随斜杠）。 */
  path?: string;
  error?: string;
}

const ok = (path: string): PathResult => ({ ok: true, path });
const fail = (error: string): PathResult => ({ ok: false, error });

const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;
const IS_ABSOLUTE = /^[\\/]/;

/**
 * 校验并规范化一个 vault 相对路径。
 * - 拒绝绝对路径、盘符、UNC、空路径；
 * - `..` 段在 posix normalize 后不得越出根；
 * - 反斜杠 `\` 统一转为 `/`，使 `..\..\secret` 等转义变体同样被拦截。
 */
export function normalizeVaultPath(input: unknown): PathResult {
  if (typeof input !== 'string') return fail('路径必须是非空字符串');
  if (input.length === 0 || input.trim() === '') return fail('路径为空');
  if (input.includes('\0')) return fail('路径含非法字符');
  if (WINDOWS_DRIVE.test(input)) return fail('不允许绝对路径或盘符');
  if (IS_ABSOLUTE.test(input)) return fail('不允许绝对路径（vault 相对路径必须以目录/文件名开头）');

  // 统一分隔符：反斜杠转正斜杠。
  const p = input.replace(/\\/g, '/');
  const stack: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (stack.length === 0) return fail('路径越出 vault 根（`..` 逃逸被拒绝）');
      stack.pop();
    } else {
      stack.push(seg);
    }
  }
  if (stack.length === 0) return fail('路径为空');
  return ok(stack.join('/'));
}

/** 目录列表路径：规范化后（外部决定是否为目录，尾斜杠由调用方补）。 */
export function normalizeDirPath(input: unknown): PathResult {
  const r = normalizeVaultPath(input);
  return r;
}

/**
 * 判断规范化路径是否触碰到隐藏段（`.` 开头）。
 * 既覆盖 `.obsidian/`、`.trash/` 系统目录，也覆盖任意隐藏文件/目录。
 */
export function hasHiddenSegment(normalized: string): boolean {
  return normalized.split('/').some((s) => s.startsWith('.'));
}

/** 写操作护栏：返回错误信息，无错误返回空串。 */
export function writeProtectionReason(normalized: string): string {
  for (const seg of normalized.split('/')) {
    if (!seg.startsWith('.')) continue;
    if (seg === '.obsidian' || seg === '.trash') {
      return `禁止写入系统目录 ${seg}/（读写需保护 vault 配置）`;
    }
    return `禁止写入隐藏文件/目录（. 开头）${seg}`;
  }
  return '';
}

/** 报文写路径：规范化 + 写保护（读允许 .obsidian / 隐藏项）。 */
export function validateWritablePath(input: unknown): PathResult {
  const r = normalizeVaultPath(input);
  if (!r.ok) return r;
  const reason = writeProtectionReason(r.path!);
  if (reason) return fail(reason);
  return r;
}

/**
 * URL 编码语义但保留 `/`（等价 Python quote(path, safe='/')）：
 * 逐段 encodeURIComponent 再以 `/` 拼接，空格/中文正确编码，斜杠不被编码成 %2F。
 */
export function encodeVaultPath(normalized: string): string {
  return normalized.split('/').map((seg) => encodeURIComponent(seg)).join('/');
}