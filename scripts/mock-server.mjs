// dsh-obsidian-rest 测试用 mock Obsidian REST 服务器（node 内置 http，零依赖）。
// 实现：GET /（manifest）、/vault/<path> GET/PUT/DELETE、目录列表（尾斜杠 GET）、
// /search/simple/（全文搜索）、/commands/ 与 /commands/<id>/。
// 可 `node scripts/mock-server.mjs` 独立启动（默认端口 27300），也可被测试 import。

import http from 'node:http';

export const MOCK_MANIFEST = {
  status: 'OK',
  manifest: { id: 'obsidian-local-rest-api', version: '5.1.0' },
  versions: { obsidian: 'v5', self: '5.1.0' },
  service: 'Obsidian Local REST API',
  authenticated: true,
};

export const MOCK_COMMANDS = [
  { id: 'app:open-vault', name: 'Open another vault' },
  { id: 'editor:toggle-bold', name: 'Toggle bold' },
  { id: 'workspace:undo-close-window', name: 'Undo close window' },
];

function send(res, status, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  res.writeHead(status, headers);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function decodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function normDir(p) {
  return p.replace(/^\/+|\/+$/g, '');
}

export function createMockServer() {
  const files = new Map(); // normalized path -> content string
  files.set('welcome.md', '# Welcome\n\nHello vault.\n');
  files.set('Notes/会议 记录.md', '# 会议\n\n讨论项目进展。\n');
  files.set('Notes/project.md', '# 项目\n\nobsidian 笔记与搜索。\n');

  const state = {
    requests: [], // { method, url }
    headers: [], // { method, url, headers } 用于断言 UA / CF 双头
    writeCount: 0,
    deleteCount: 0,
    runCommandCount: 0,
    authDenied: false, // 若为 true，任何缺失 Bearer 的请求都 401
    forceStatus: null, // 测试用：如 403 强制所有请求返回该状态
  };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://mock.local');
    const pathname = decodePath(u.pathname);
    const full = { method: req.method, url: u.pathname + u.search, headers: { ...req.headers } };
    state.requests.push({ method: req.method, url: u.pathname + u.search });
    state.headers.push(full);

    if (state.authDenied && !String(req.headers.authorization || '').startsWith('Bearer ')) {
      return send(res, 401, { message: 'Unauthorized', errorCode: 40100 });
    }
    if (state.forceStatus) {
      return send(res, state.forceStatus, { message: 'forced ' + state.forceStatus, errorCode: state.forceStatus * 100 });
    }

    // GET / —— manifest
    if (req.method === 'GET' && pathname === '/') {
      return send(res, 200, MOCK_MANIFEST);
    }

    // /commands/
    if (req.method === 'GET' && pathname === '/commands/') {
      return send(res, 200, { commands: MOCK_COMMANDS });
    }

    // /commands/<id>/ —— 执行命令
    if (req.method === 'POST' && pathname.startsWith('/commands/')) {
      const id = decodeURIComponent(pathname.slice('/commands/'.length).replace(/\/$/, ''));
      state.runCommandCount++;
      return send(res, 200, { ok: true, commandId: id });
    }

    // /search/simple/ —— 全文搜索
    if (req.method === 'POST' && (pathname === '/search/simple/' || pathname === '/search/')) {
      const query = (u.searchParams.get('query') || '').toLowerCase();
      const tag = u.searchParams.get('tag');
      const dir = u.searchParams.get('dir');
      const results = [];
      for (const [path, content] of files) {
        const hay = (path + '\n' + content).toLowerCase();
        let okMatch = !query || hay.includes(query);
        if (okMatch && dir) okMatch = path === dir || path.startsWith(dir.replace(/\/+$/, '') + '/');
        if (okMatch && tag) okMatch = content.includes('#' + tag) || content.includes('tags:') && content.includes(tag);
        if (okMatch && query) {
          const idx = content.toLowerCase().indexOf(query);
          results.push({
            filename: path.split('/').pop(),
            path,
            score: 100 - Math.max(0, idx),
            context: content.slice(Math.max(0, (idx > 0 ? idx : 0) - 20), (idx > 0 ? idx : 0) + 40),
          });
        }
      }
      return send(res, 200, results);
    }

    // /vault/* —— 目录列表（尾斜杠或根）与文件读写
    if (pathname === '/vault/' || pathname.startsWith('/vault/')) {
      const raw = pathname.slice('/vault/'.length);
      const isDir = raw === '' || raw.endsWith('/');
      const p = normDir(raw);

      if (isDir && req.method === 'GET') {
        // 目录列表
        const prefix = p ? p + '/' : '';
        const entries = new Set();
        for (const fp of files.keys()) {
          if (!fp.startsWith(prefix)) continue;
          const rest = fp.slice(prefix.length);
          const first = rest.split('/')[0];
          if (first) entries.add(first);
        }
        const list = [...entries].map((name) => {
          const full = prefix + name;
          const isFile = files.has(full) || ![...files.keys()].some((k) => k.startsWith(full + '/'));
          return { filename: name, path: prefix + (isFile ? name : name + '/'), type: isFile ? 'file' : 'directory' };
        });
        if (p && list.length === 0) return send(res, 404, { message: 'Not Found', errorCode: 40400 });
        return send(res, 200, { files: list });
      }

      if (req.method === 'GET') {
        // 读文件
        if (p.startsWith('__err_401')) return send(res, 401, { message: 'Unauthorized', errorCode: 40100 });
        if (p.startsWith('__err_403')) return send(res, 403, { message: 'Forbidden', errorCode: 40300 });
        if (p.startsWith('__err_500')) return send(res, 500, { message: 'boom', errorCode: 50000 });
        if (!files.has(p)) return send(res, 404, { message: 'Not Found', errorCode: 40400 });
        return send(res, 200, files.get(p), { 'Content-Type': 'text/markdown; charset=utf-8' });
      }

      if (req.method === 'PUT') {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          let content = body;
          try {
            const j = JSON.parse(body);
            if (j && typeof j.content === 'string') content = j.content;
          } catch { /* raw body */ }
          state.writeCount++;
          files.set(p, content);
          send(res, 200, { ok: true, path: p });
        });
        return;
      }

      if (req.method === 'DELETE') {
        if (!files.has(p)) return send(res, 404, { message: 'Not Found', errorCode: 40400 });
        state.deleteCount++;
        files.delete(p);
        return send(res, 204, '');
      }
    }

    send(res, 404, { message: 'Not Found', errorCode: 40400 });
  });

  return { server, files, state };
}

/** 启动一个 mock 服务器并解析到随机端口。 */
export function startMockServer() {
  const mock = createMockServer();
  return new Promise((resolve) => {
    mock.server.listen(0, '127.0.0.1', () => {
      const { port } = mock.server.address();
      resolve({
        ...mock,
        port,
        url: 'http://127.0.0.1:' + port,
        close() {
          if (typeof mock.server.closeAllConnections === 'function') mock.server.closeAllConnections();
          return new Promise((r) => mock.server.close(r));
        },
      });
    });
  });
}

// 独立运行（CLI）
const isDirect = process.argv[1] && import.meta.url === 'file://' + process.argv[1];
if (isDirect) {
  const port = Number(process.env.PORT || 27300);
  const mock = createMockServer();
  mock.server.listen(port, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log('mock Obsidian REST server listening on http://127.0.0.1:' + port);
    // eslint-disable-next-line no-console
    console.log('  GET /                 -> manifest');
    // eslint-disable-next-line no-console
    console.log('  GET|PUT|DELETE /vault/<path>  (+ 目录列表: GET /vault/<path>/)');
    // eslint-disable-next-line no-console
    console.log('  POST /search/simple/?query=   GET /commands/:id/');
  });
}