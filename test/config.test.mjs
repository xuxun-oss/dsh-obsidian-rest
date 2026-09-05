import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, DEFAULT_UA } from '../lib/config.js';

test('resolveConfig：缺 baseUrl fail-fast', () => {
  assert.throws(() => resolveConfig({ apiKey: 'k' }), /baseUrl/);
});

test('resolveConfig：缺 apiKey 且无 apiKeyEnv fail-fast', () => {
  assert.throws(() => resolveConfig({ baseUrl: 'http://vault.test' }), /apiKey/);
});

test('resolveConfig：apiKeyEnv 指向不存在环境变量 fail-fast', () => {
  const name = 'DSH_OR_TEST_NOEXIST_' + Date.now();
  delete process.env[name];
  assert.throws(() => resolveConfig({ baseUrl: 'http://x', apiKeyEnv: name }), /环境变量不存在/);
});

test('resolveConfig：apiKeyEnv 优先于 apiKey', () => {
  const name = 'DSH_OR_TEST_KEY_' + Date.now();
  process.env[name] = 'from-env-key';
  const cfg = resolveConfig({ baseUrl: 'http://x', apiKeyEnv: name, apiKey: 'from-field-key' });
  assert.equal(cfg.apiKey, 'from-env-key');
  delete process.env[name];
});

test('resolveConfig：默认值综合校验', () => {
  const cfg = resolveConfig({ baseUrl: 'http://vault.test', apiKey: 'test-key-1234' });
  assert.equal(cfg.baseUrl, 'http://vault.test');
  assert.equal(cfg.apiKey, 'test-key-1234');
  assert.equal(cfg.allowWrite, false);
  assert.equal(cfg.allowCommands, false);
  assert.equal(cfg.rejectUnauthorized, false);
  assert.equal(cfg.timeoutMs, 30000);
  assert.equal(cfg.ua, DEFAULT_UA);
  assert.equal(cfg.accessClientId, '');
});

test('resolveConfig：去尾斜杠', () => {
  const cfg = resolveConfig({ baseUrl: 'https://vault.example.com///', apiKey: 'k' });
  assert.equal(cfg.baseUrl, 'https://vault.example.com');
});

test('resolveConfig：allowWrite / allowCommands 可开', () => {
  const cfg = resolveConfig({ baseUrl: 'http://x', apiKey: 'k', allowWrite: true, allowCommands: true, rejectUnauthorized: true });
  assert.equal(cfg.allowWrite, true);
  assert.equal(cfg.allowCommands, true);
  assert.equal(cfg.rejectUnauthorized, true);
});