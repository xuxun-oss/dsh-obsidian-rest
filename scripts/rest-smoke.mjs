// dsh-obsidian-rest 真库只读冒烟（R8/R9 可选步骤，网络可达时执行）。
// 红线：只读。只做 health + 一次搜索 + 一次读已知笔记；绝不出现任何写/删/命令操作。
// 凭证：若 ~/.secrets/obsidian-rest.env 存在则读入（600 权限）；变量名以文件为准
//   （OBSIDIAN_BASE_URL / OBSIDIAN_API_TOKEN / CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET，
//     兼容 OBSIDIAN_BASE / OBSIDIAN_API_KEY / OBSIDIAN_CF_ACCESS_CLIENT_ID / OBSIDIAN_CF_ACCESS_CLIENT_SECRET）。
// 仅打印 key 的末 4 位，绝不落盘、绝不外传。

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ObsidianClient } from '../lib/client.js';
import { resolveConfig } from '../lib/config.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function mask(key) {
  if (!key) return '(空)';
  return key.length > 4 ? '…' + key.slice(-4) : '(短)';
}

function loadEnvFile() {
  const candidates = [
    join(process.env.DSH_HOME || join(homedir(), '.dsh'), '..', '.secrets', 'obsidian-rest.env'),
    join(homedir(), '.secrets', 'obsidian-rest.env'),
  ];
  let content = null;
  for (const p of candidates) {
    try {
      content = readFileSync(p, 'utf8');
      break;
    } catch { /* try next */ }
  }
  if (content == null) return null;
  const env = {};
  for (const line of content.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i <= 0) continue;
    const k = s.slice(0, i).trim();
    const v = s.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (k) env[k] = v;
  }
  return env;
}

function pick(env, ...names) {
  for (const n of names) if (env[n]) return env[n];
  return '';
}

const env = loadEnvFile();
if (!env) {
  console.log('ℹ 未找到 ~/.secrets/obsidian-rest.env —— 跳过真库只读冒烟（仅本地 mock 测试已覆盖）。');
  process.exit(0);
}

const baseUrl = pick(env, 'OBSIDIAN_BASE_URL', 'OBSIDIAN_BASE');
const apiKey = pick(env, 'OBSIDIAN_API_TOKEN', 'OBSIDIAN_API_KEY');
const cid = pick(env, 'CF_ACCESS_CLIENT_ID', 'OBSIDIAN_CF_ACCESS_CLIENT_ID');
const csecret = pick(env, 'CF_ACCESS_CLIENT_SECRET', 'OBSIDIAN_CF_ACCESS_CLIENT_SECRET');
const query = process.env.OBSIDIAN_SMOKE_QUERY || '';

if (!baseUrl || !apiKey) {
  console.error('✖ 凭证文件存在但缺少 baseUrl / apiKey（变量名以文件为准：OBSIDIAN_BASE_URL / OBSIDIAN_API_TOKEN）。');
  process.exit(2);
}

const cfg = resolveConfig({
  baseUrl,
  apiKey,
  accessClientId: cid,
  accessClientSecret: csecret,
  ua: BROWSER_UA,
  // 只读冒烟默认关闭 TLS 校验（兼容自签），不涉及写。
  rejectUnauthorized: false,
  allowWrite: false,
  allowCommands: false,
});

const client = new ObsidianClient(cfg);
console.log(`→ Obsidian 端点：${baseUrl}`);
console.log(`→ API key：${mask(apiKey)}；CF 双头：${cid ? '已配置' : '未配置'}（只读冒烟，绝不写）`);

let failed = false;

// 1) health
try {
  const m = await client.health();
  const info = client.versionInfo();
  console.log('✅ health：status=' + (m.status || '?') +
    (info ? ` version=${info.version} service=${info.service}` : '') +
    ` authenticated=${m.authenticated}`);
} catch (e) {
  failed = true;
  console.error('✖ health 失败：' + e.message);
}

// 2) 搜索（优先用根目录第一个 markdown 的文件名作为查询，保证命中）
let readPath = process.env.OBSIDIAN_SMOKE_NOTE || '';
try {
  let q = query;
  if (!q || !readPath) {
    const root = await client.listDir('');
    // 真实 API 目录列表返回字符串数组（目录带尾斜杠、文件不带）；mock 返回对象，兼容两者。
    const firstName = (root || []).map((f) => {
      if (typeof f === 'string') return f;
      const n = String((f && f.filename) || (f && f.path) || '');
      return n;
    }).find((n) => n.toLowerCase().endsWith('.md'));
    if (firstName) {
      if (!readPath) readPath = firstName;
      if (!q) q = firstName.replace(/\.md$/i, '').split('/').pop().slice(0, 6);
    }
  }
  if (q) {
    const hits = await client.search(q);
    const n = Array.isArray(hits) ? hits.length : 0;
    console.log(`✅ 搜索「${q}」命中 ${n} 条`);
  } else {
    console.log('ℹ 无法自动确定搜索词，跳过搜索（可用 OBSIDIAN_SMOKE_QUERY 指定）');
  }
} catch (e) {
  failed = true;
  console.error('✖ 搜索失败：' + e.message);
}

// 3) 读已知笔记
if (readPath) {
  try {
    const content = await client.readNote(readPath);
    console.log(`✅ 读取「${readPath}」：${content.length} 字符`);
    console.log('   开头预览：' + content.slice(0, 80).replace(/\n/g, '⏎'));
  } catch (e) {
    failed = true;
    console.error('✖ 读取失败：' + e.message);
  }
} else {
  console.log('ℹ 未能确定已知笔记路径，跳过读取（可用 OBSIDIAN_SMOKE_NOTE 指定）');
}

console.log(failed ? '\n结果：有步骤失败（见上），不阻塞发布，但请确认网络/隧道/凭据。' : '\n结果：真库只读冒烟通过（无任何写操作）。');
process.exit(failed ? 3 : 0);