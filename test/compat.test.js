// 兼容性回归测试：直接调用 DSH 自己的兼容性判定，复现「插件被静默跳过」的那道闸门。
//
// 背景：DSH 启动时会检查插件 package.json 里所有 `@deepseek-ai/dsh*` peer 的版本范围
// 是否覆盖当前运行时版本，不覆盖就打印 "skipping profile bundle" 并**静默跳过整个插件**。
// 0.2.0-rc.1 曾因 peer 停在 `^0.1.0-rc.6` 而触发该分支，插件在界面上完全消失。
// 这里的测试让这种升级破坏在本地 `node --test` 就暴露，而不是等到重启 DSH 才发现。
//
// 找不到 DSH 安装时整体跳过（例如 CI 上只跑纯逻辑测试）。

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/** 定位全局安装的 DSH：优先 DSH_INSTALL_DIR，其次 `npm root -g`。 */
function resolveDshDir() {
  const candidates = []
  if (typeof process.env.DSH_INSTALL_DIR === 'string' && process.env.DSH_INSTALL_DIR !== '') {
    candidates.push(process.env.DSH_INSTALL_DIR)
  }
  try {
    const root = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (root !== '') candidates.push(join(root, '@deepseek-ai', 'dsh'))
  } catch {
    // npm 不在 PATH 上时只依赖 DSH_INSTALL_DIR
  }
  return candidates.find((dir) => existsSync(join(dir, 'package.json'))) ?? null
}

const dshDir = resolveDshDir()
const skip = dshDir === null ? '未找到 DSH 安装（可设置 DSH_INSTALL_DIR 指定）' : false

/** 从 `exports` 字段取出 ./client 的相对路径，兼容字符串与条件导出两种写法。 */
function clientEntryOf(exportsField) {
  let value = exportsField?.['./client']
  while (value !== null && typeof value === 'object') value = value.default
  return typeof value === 'string' ? value : null
}

/** 本插件声明为 peer 的 DSH 侧包名。 */
const dshPeers = Object.keys(manifest.peerDependencies ?? {}).filter(
  (name) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'),
)

const at = (dir, name) => join(dir, 'node_modules', ...name.split('/'))

test('peerDependencies 覆盖当前安装的 DSH 运行时', { skip }, async () => {
  const entry = at(dshDir, '@deepseek-ai/dsh-app-boot')
  const appBoot = await import(pathToFileURL(join(entry, 'lib', 'index.js')).href)
  // evaluatePluginCompatibility 就是 DSH 启动时调用的同一个函数
  const issue = appBoot.evaluatePluginCompatibility(manifest)
  assert.equal(issue, undefined, issue === undefined ? '' : appBoot.pluginCompatibilityWarning(issue))
})

test('声明的 dsh peer 都真实存在于当前 DSH', { skip }, () => {
  assert.ok(dshPeers.length > 0, '至少要声明一个 @deepseek-ai/dsh-* peer')
  const missing = dshPeers.filter((name) => !existsSync(join(at(dshDir, name), 'package.json')))
  // 例如 0.2.0-rc.1 删掉了 @deepseek-ai/dsh-client-runtime：声明它会让闸门永远无法通过
  assert.deepEqual(missing, [], `以下 peer 已不在 DSH 中，应从 package.json 删除：${missing.join(', ')}`)
})

test('dsh.client.inject 的每一项都是可注入的 Web 客户端模块', { skip }, () => {
  const ids = manifest.dsh?.client?.inject ?? []
  assert.ok(ids.length > 0, '客户端插件必须声明 dsh.client.inject')

  const problems = []
  for (const id of ids) {
    const pkgPath = join(at(dshDir, id), 'package.json')
    if (!existsSync(pkgPath)) {
      problems.push(`${id}: 未安装`)
      continue
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    if (pkg.dsh?.client?.platform !== 'web') {
      problems.push(`${id}: 未声明 dsh.client.platform === "web"`)
      continue
    }
    const clientEntry = clientEntryOf(pkg.exports)
    if (clientEntry === null) {
      problems.push(`${id}: 未导出 "./client"`)
      continue
    }
    if (!existsSync(join(at(dshDir, id), clientEntry))) {
      problems.push(`${id}: "./client" 指向的 ${clientEntry} 不存在`)
    }
  }
  assert.deepEqual(problems, [])
})

test('客户端 bundle 注册的模块 id 与包名一致', () => {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const match = source.match(/__ModuleLoader__\.load\(\s*\{\s*id:\s*['"]([^'"]+)['"]/)
  assert.ok(match, 'lib/client.js 未找到 __ModuleLoader__.load({ id })')
  assert.equal(match[1], manifest.name, '模块 id 必须是包名，否则 DSH 无法把 bundle 关联到插件')
})
