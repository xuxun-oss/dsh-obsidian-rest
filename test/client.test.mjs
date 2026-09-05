import test from 'node:test';
import assert from 'node:assert/strict';
import { startMockServer } from '../scripts/mock-server.mjs';
import { ObsidianClient } from '../lib/client.js';
import { resolveConfig } from '../lib/config.js';

function makeClient(url, extra = {}) {
  return new ObsidianClient(resolveConfig({
    baseUrl: url,
    apiKey: 'test-key-1234',
    ...extra,
  }));
}

test('health：GET / 返回 manifest 并可探测版本', async () => {
  const mock = await startMockServer();
  const c = makeClient(mock.url);
  const m = await c.health();
  assert.equal(m.status, 'OK');
  assert.deepEqual(c.versionInfo(), { version: '5.1.0', service: 'Obsidian Local REST API' });
  await mock.close();
});

test('读写删列表往返', async () => {
  const mock = await startMockServer();
  const c = makeClient(mock.url);
  await c.putNote('Notes/new.md', '# New\n\nhello');
  const content = await c.readNote('Notes/new.md');
  assert.equal(content, '# New\n\nhello');

  const files = await c.listDir('Notes');
  assert.ok(files.some((f) => (f.filename || f.path) === 'new.md' || (f.path || '').endsWith('new.md')));

  await c.deleteNote('Notes/new.md');
  await assert.rejects(() => c.readNote('Notes/new.md'), /404/);
  await mock.close();
});

test('中文与空格路径往返', async () => {
  const mock = await startMockServer();
  const c = makeClient(mock.url);
  const path = '文件夹/我的 笔记.md';
  const body = '第一条记录\n';
  await c.putNote(path, body);
  assert.equal(await c.readNote(path), body);
  const files = await c.listDir('文件夹');
  assert.ok(files.some((f) => (f.filename === '我的 笔记.md') || String(f.filename || '').includes('笔记')));
  await mock.close();
});

test('URL 编码保留 /（空格编码为 %20，斜杠不被 %2F）', async () => {
  const mock = await startMockServer();
  const c = makeClient(mock.url);
  await c.putNote('a/b c.md', 'x');
  const putUrl = mock.state.requests.find((r) => r.method === 'PUT').url;
  assert.match(putUrl, /\/vault\/a\/b%20c\.md$/);
  assert.doesNotMatch(putUrl, /%2F/);
  await mock.close();
});

test('错误归一：401/403/404/5xx 映射为可读错误', async () => {
  const mock = await startMockServer();
  const c = makeClient(mock.url);
  await assert.rejects(() => c.readNote('__err_401/x'), /认证失败（HTTP 401）/);
  await assert.rejects(() => c.readNote('__err_403/x'), /访问被拒绝（HTTP 403）/);
  await assert.rejects(() => c.readNote('does/not/exist.md'), /路径或端点不存在（HTTP 404）/);
  await assert.rejects(() => c.readNote('__err_500/x'), /服务端错误（HTTP 500）/);
  await mock.close();
});

test('网络错误归一', async () => {
  const c = makeClient('http://127.0.0.1:1'); // 未监听端口
  await assert.rejects(() => c.readNote('x.md'), /网络错误|连接/);
});

test('CF 双头按配置附加（都存在时）；缺失时不附加', async () => {
  const mock = await startMockServer();
  const withCf = makeClient(mock.url, { accessClientId: 'cid-1', accessClientSecret: 'csecret-1' });
  await withCf.health();
  let last = mock.state.headers[mock.state.headers.length - 1].headers;
  assert.equal(last['cf-access-client-id'], 'cid-1');
  assert.equal(last['cf-access-client-secret'], 'csecret-1');

  const noCf = makeClient(mock.url); // 两者都缺省
  await noCf.health();
  last = mock.state.headers[mock.state.headers.length - 1].headers;
  assert.equal(last['cf-access-client-id'], undefined);
  assert.equal(last['cf-access-client-secret'], undefined);

  // 只填一个也不附加
  const halfCf = makeClient(mock.url, { accessClientId: 'cid-2' });
  await halfCf.health();
  last = mock.state.headers[mock.state.headers.length - 1].headers;
  assert.equal(last['cf-access-client-id'], undefined);
  await mock.close();
});

test('UA 生效 + Bearer 头携带（且错误信息不回显 apiKey）', async () => {
  const mock = await startMockServer();
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) TestAgent/1.0';
  const c = makeClient(mock.url, { ua });
  await c.health();
  const last = mock.state.headers[mock.state.headers.length - 1].headers;
  assert.equal(last['user-agent'], ua);
  assert.equal(last.authorization, 'Bearer test-key-1234');

  // 触发 401 并确认错误信息里没有 key
  try {
    await c.readNote('__err_401/x');
    assert.fail('应抛错');
  } catch (e) {
    assert.doesNotMatch(String(e.message), /test-key-1234/);
  }
  await mock.close();
});

test('目录列表：根目录（空路径）与子目录', async () => {
  const mock = await startMockServer();
  const c = makeClient(mock.url);
  const root = await c.listDir('');
  assert.ok(Array.isArray(root));
  assert.ok(root.some((f) => (f.filename === 'Notes') || (f.filename || '').includes('welcome')));
  const notes = await c.listDir('Notes');
  assert.ok(Array.isArray(notes) && notes.length > 0);
  await mock.close();
});

test('搜索：POST /search/simple/ 命中并可选 dir/tag', async () => {
  const mock = await startMockServer();
  const c = makeClient(mock.url);
  const all = await c.search('obsidian');
  assert.ok(Array.isArray(all));
  assert.ok(all.some((r) => r.path === 'Notes/project.md'));

  const byDir = await c.search('notes', { dir: 'Notes' });
  assert.ok(Array.isArray(byDir));

  const noHit = await c.search('zzzz-no-such-term');
  assert.equal(noHit.length, 0);
  await mock.close();
});

test('命令：listCommands 与 runCommand', async () => {
  const mock = await startMockServer();
  const c = makeClient(mock.url);
  const cmds = await c.listCommands();
  assert.ok(Array.isArray(cmds) && cmds.length > 0);
  const r = await c.runCommand('editor:toggle-bold');
  assert.equal(r.ok, true);
  assert.equal(mock.state.runCommandCount, 1);
  await mock.close();
});