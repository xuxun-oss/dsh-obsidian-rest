import test from 'node:test';
import assert from 'node:assert/strict';
import { startMockServer } from '../scripts/mock-server.mjs';
import { ObsidianClient } from '../lib/client.js';
import { resolveConfig } from '../lib/config.js';
import { createVaultService, buildNote } from '../lib/service.js';
import { preExecuteDecision } from '../lib/approval.js';

const silentLogger = { info() {}, warn() {}, error() {} };

function makeSvc(url, extra = {}) {
  const cfg = resolveConfig({ baseUrl: url, apiKey: 'test-key-1234', ...extra });
  const client = new ObsidianClient(cfg);
  return { svc: createVaultService(cfg, client, silentLogger), client, cfg };
}

test('allowWrite=false：写/删拒绝且未发任何请求', async (t) => {
  const mock = await startMockServer();
  t.after(() => mock.close());
  const { svc, client } = makeSvc(mock.url, { allowWrite: false });

  const before = client.requestCount;
  const c = await svc.createNote('Notes/a.md', 'x', null, 'session:test');
  const u = await svc.updateNote('Notes/a.md', 'y', 'session:test');
  const d = await svc.deleteNote('Notes/a.md', 'session:test');

  assert.equal(c.ok, false);
  assert.match(c.error, /allowWrite/);
  assert.match(u.error, /allowWrite/);
  assert.match(d.error, /allowWrite/);
  assert.equal(client.requestCount, before, '门控应在发送请求前拒绝');
  assert.equal(mock.state.writeCount, 0);
  assert.equal(mock.state.deleteCount, 0);
});

test('allowWrite=true：写删除正常执行 + 审计日志记录 action/path/by 且不含 key', async (t) => {
  const mock = await startMockServer();
  t.after(() => mock.close());
  const cfg = resolveConfig({ baseUrl: mock.url, apiKey: 'test-key-1234', allowWrite: true });
  const logged = [];
  const probe = createVaultService(cfg, new ObsidianClient(cfg), {
    info() {}, error() {},
    warn(_fmt, ...args) { logged.push(args.join(' ')); },
  });

  const r = await probe.createNote('Notes/a.md', 'hello', null, 'session:abc');
  assert.equal(r.ok, true);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /create_note/);
  assert.match(logged[0], /Notes\/a\.md/);
  assert.match(logged[0], /session:abc/);
  assert.doesNotMatch(logged[0], /test-key-1234/);
  const del = await probe.deleteNote('Notes/a.md', 'session:abc');
  assert.equal(del.ok, true);
  assert.equal(logged.length, 2);
  assert.match(logged[1], /delete_note/);
});

test('allowCommands=false：runCommand 拒绝且未发请求', async (t) => {
  const mock = await startMockServer();
  t.after(() => mock.close());
  const { svc, client } = makeSvc(mock.url, { allowCommands: false });
  const before = client.requestCount;
  const r = await svc.runCommand('editor:toggle-bold', null, 'session:t');
  assert.equal(r.ok, false);
  assert.match(r.error, /allowCommands/);
  assert.equal(client.requestCount, before);
  assert.equal(mock.state.runCommandCount, 0);
});

test('写路径护栏：.obsidian / 隐藏目录写被拒（读允许）', async (t) => {
  const mock = await startMockServer();
  t.after(() => mock.close());
  const { svc } = makeSvc(mock.url, { allowWrite: true });
  const a = await svc.createNote('.obsidian/app.json', 'x', null, 's');
  assert.equal(a.ok, false);
  assert.match(a.error, /\.obsidian/);
  const b = await svc.createNote('a/.hidden.md', 'x', null, 's');
  assert.equal(b.ok, false);
  // 读允许：读 .obsidian 下（mock 无此文件会 404，但路径校验应放行，不报「禁止/不允许」）
  const r = await svc.readNote('.obsidian/app.json');
  assert.doesNotMatch(r.error, /禁止|不允许/, '读 .obsidian 不应被路径护栏拒绝');
});

test('审批决策：写需审批、读免审批、命令受 allowCommands 门控', () => {
  const cfgOff = resolveConfig({ baseUrl: 'http://x', apiKey: 'k' });
  const cfgOn = resolveConfig({ baseUrl: 'http://x', apiKey: 'k', allowWrite: true, allowCommands: true });

  // 读工具：非本插件关注 → owned false → allow（委托）
  assert.deepEqual(preExecuteDecision('obsidian_read_note', { path: 'a.md' }, cfgOff), { kind: 'allow', owned: false });

  // 写工具：allowWrite=false → deny
  const denyWrite = preExecuteDecision('obsidian_create_note', { path: 'a.md' }, cfgOff);
  assert.equal(denyWrite.kind, 'deny');
  assert.equal(denyWrite.owned, true);

  // 写工具：allowWrite=true → ask（需审批）
  const askWrite = preExecuteDecision('obsidian_delete_note', { path: 'a.md' }, cfgOn);
  assert.equal(askWrite.kind, 'ask');
  assert.equal(askWrite.owned, true);

  // 命令：allowCommands=false → deny
  const denyCmd = preExecuteDecision('obsidian_run_command', { commandId: 'x' }, cfgOff);
  assert.equal(denyCmd.kind, 'deny');

  // run_command 开启后 → ask；list_commands 开启后 → allow（只读，不 ask）
  const askCmd = preExecuteDecision('obsidian_run_command', { commandId: 'x' }, cfgOn);
  assert.equal(askCmd.kind, 'ask');
  const allowList = preExecuteDecision('obsidian_list_commands', {}, cfgOn);
  assert.equal(allowList.kind, 'allow');
  assert.equal(allowList.owned, true);
});

test('buildNote：frontmatter 序列化', () => {
  assert.equal(buildNote('body', null), 'body');
  const withFm = buildNote('body', { title: 'T', tags: ['a', 'b'] });
  assert.match(withFm, /^---\n/);
  assert.match(withFm, /title: T/);
  assert.match(withFm, /tags: \["a","b"\]/);
  assert.match(withFm, /---\nbody$/);
});