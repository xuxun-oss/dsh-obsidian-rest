export interface PathResult {
    ok: boolean;
    /** 规范化后的 vault 相对路径（posix，无前导/尾随斜杠）。 */
    path?: string;
    error?: string;
}
/**
 * 校验并规范化一个 vault 相对路径。
 * - 拒绝绝对路径、盘符、UNC、空路径；
 * - `..` 段在 posix normalize 后不得越出根；
 * - 反斜杠 `\` 统一转为 `/`，使 `..\..\secret` 等转义变体同样被拦截。
 */
export declare function normalizeVaultPath(input: unknown): PathResult;
/** 目录列表路径：规范化后（外部决定是否为目录，尾斜杠由调用方补）。 */
export declare function normalizeDirPath(input: unknown): PathResult;
/**
 * 判断规范化路径是否触碰到隐藏段（`.` 开头）。
 * 既覆盖 `.obsidian/`、`.trash/` 系统目录，也覆盖任意隐藏文件/目录。
 */
export declare function hasHiddenSegment(normalized: string): boolean;
/** 写操作护栏：返回错误信息，无错误返回空串。 */
export declare function writeProtectionReason(normalized: string): string;
/** 报文写路径：规范化 + 写保护（读允许 .obsidian / 隐藏项）。 */
export declare function validateWritablePath(input: unknown): PathResult;
/**
 * URL 编码语义但保留 `/`（等价 Python quote(path, safe='/')）：
 * 逐段 encodeURIComponent 再以 `/` 拼接，空格/中文正确编码，斜杠不被编码成 %2F。
 */
export declare function encodeVaultPath(normalized: string): string;
