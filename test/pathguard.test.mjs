import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeVaultPath,
  validateWritablePath,
  encodeVaultPath,
  writeProtectionReason,
} from '../lib/pathguard.js';

test('normalizeVaultPath：基本规范化', () => {
  assert.deepEqual(normalizeVaultPath('a/b.md'), { ok: true, path: 'a/b.md' });
  assert.deepEqual(normalizeVaultPath('a///b.md'), { ok: true, path: 'a/b.md' });
  assert.deepEqual(normalizeVaultPath('./a/b.md'), { ok: true, path: 'a/b.md' });
  assert.deepEqual(normalizeVaultPath('a/../b.md'), { ok: true, path: 'b.md' });
  assert.deepEqual(normalizeVaultPath('a/b/../../c.md'), { ok: true, path: 'c.md' });
});

test('normalizeVaultPath：拒绝绝对路径 / 盘符 / UNC', () => {
  assert.equal(normalizeVaultPath('/a/b.md').ok, false);
  assert.equal(normalizeVaultPath('C:/a/b.md').ok, false);
  assert.equal(normalizeVaultPath('C:\\a\\b.md').ok, false);
  assert.equal(normalizeVaultPath('\\\\server\\share\\b.md').ok, false);
  assert.equal(normalizeVaultPath('//server/share').ok, false);
});

test('normalizeVaultPath：拒绝路径穿越', () => {
  assert.equal(normalizeVaultPath('../secret.md').ok, false);
  assert.equal(normalizeVaultPath('a/../../x.md').ok, false);
  assert.equal(normalizeVaultPath('..').ok, false);
  assert.equal(normalizeVaultPath('..\\..\\secret.md').ok, false); // 反斜杠转义变体
  assert.equal(normalizeVaultPath('a\\..\\..\\secret.md').ok, false);
});

test('normalizeVaultPath：反斜杠统一为分隔符', () => {
  assert.deepEqual(normalizeVaultPath('a\\b\\c.md'), { ok: true, path: 'a/b/c.md' });
});

test('normalizeVaultPath：拒绝空路径 / 非字符串', () => {
  assert.equal(normalizeVaultPath('').ok, false);
  assert.equal(normalizeVaultPath('   ').ok, false); // 空白 -> 归一为空
  assert.equal(normalizeVaultPath(null).ok, false);
  assert.equal(normalizeVaultPath(123).ok, false);
});

test('validateWritablePath：.obsidian / .trash / 隐藏项写禁', () => {
  assert.equal(validateWritablePath('.obsidian/app.json').ok, false);
  assert.equal(validateWritablePath('.trash/x.md').ok, false);
  assert.equal(validateWritablePath('.hidden.md').ok, false);
  assert.equal(validateWritablePath('a/.git/config').ok, false);
  assert.equal(validateWritablePath('a/b.md').ok, true);
});

test('writeProtectionReason：命中系统目录 / 隐藏项', () => {
  assert.match(writeProtectionReason('.obsidian/app.json'), /\.obsidian/);
  assert.match(writeProtectionReason('.trash/x'), /\.trash/);
  assert.match(writeProtectionReason('.secret'), /隐藏/);
  assert.equal(writeProtectionReason('a/b.md'), '');
});

test('encodeVaultPath：UTF-8 编码但保留 /', () => {
  assert.equal(encodeVaultPath('a/b.md'), 'a/b.md');
  assert.equal(encodeVaultPath('a/b c.md'), 'a/b%20c.md');
  assert.doesNotMatch(encodeVaultPath('a/b c.md'), /%2F/);
  // 中文路径整体 UTF-8 编码，斜杠不变
  assert.equal(encodeVaultPath('文件夹/我的 笔记.md'), '%E6%96%87%E4%BB%B6%E5%A4%B9/%E6%88%91%E7%9A%84%20%E7%AC%94%E8%AE%B0.md');
});