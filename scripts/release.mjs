#!/usr/bin/env node
/**
 * Release helper: bump version, tag and push in one step.
 * Usage: node scripts/release.mjs [patch|minor|major|x.y.z] [--dry-run]
 *
 * Wraps `npm version`, which keeps package.json and package-lock.json in
 * sync and creates the matching v* tag, so the release workflow's
 * "tag == package version" gate can never trip on a manual mistake.
 *
 * Exits 0 after pushing; 1 on any preflight or publish failure.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const BRANCH = 'main'

// ── Argument parsing ─────────────────────────────────────────────────────────

const EXPLICIT_VERSION = /^\d+\.\d+\.\d+$/

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const bump = args.find((a) => a !== '--dry-run') ?? 'patch'
if (bump !== 'patch' && bump !== 'minor' && bump !== 'major' && !EXPLICIT_VERSION.test(bump)) {
  fail(`无效的版本参数: ${bump}\n    支持 patch | minor | major | 具体版本号(如 0.2.0)`)
}

function fail(msg) {
  console.error(`\n❌  发布失败\n    ${msg}\n`)
  process.exit(1)
}

function sh(cmd, opts = {}) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: ROOT, ...opts })
  if (r.status !== 0) {
    throw new Error(`\`${cmd}\` 失败 (退出码 ${r.status})\n${(r.stderr || r.stdout || '').trim()}`)
  }
  return (r.stdout ?? '').trim()
}

function currentVersion() {
  return JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version
}

function nextVersion(version, type) {
  if (EXPLICIT_VERSION.test(type)) return type
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!m) fail(`当前版本 ${version} 不是标准三段式版本号，请手动处理`)
  const [, maj, min, pat] = m
  if (type === 'patch') return `${maj}.${min}.${Number(pat) + 1}`
  if (type === 'minor') return `${maj}.${Number(min) + 1}.0`
  return `${Number(maj) + 1}.0.0`
}

// ── Preflight ────────────────────────────────────────────────────────────────

const branch = sh('git rev-parse --abbrev-ref HEAD')
if (branch !== BRANCH) fail(`当前分支是 ${branch}，请在 ${BRANCH} 上发版`)

try {
  sh('git fetch origin --quiet')
} catch (e) {
  fail(`无法访问远端仓库（git fetch 失败），发版需要推送，请检查网络。\n    ${e.message}`)
}

const behind = sh(`git rev-list --count ${BRANCH}..origin/${BRANCH}`)
if (behind !== '0') fail(`本地落后远端 ${behind} 个提交，请先 git pull --rebase`)

const dirty = sh('git status --porcelain')
if (dirty) fail(`工作区有未提交改动，请先提交：\n${dirty.split('\n').map((l) => `      ${l}`).join('\n')}`)

const from = currentVersion()
const to = nextVersion(from, bump)
if (to === from) fail(`目标版本与当前版本相同 (${to})`)

const tag = `v${to}`
const existingTag = sh(`git ls-remote --tags origin refs/tags/${tag}`)
if (existingTag) fail(`标签 ${tag} 在远端已存在，请更换版本号`)

// ── Plan ─────────────────────────────────────────────────────────────────────

console.log(`\n🚀  发版计划`)
console.log(`    版本:  ${from} → ${to}`)
console.log(`    标签:  ${tag} (annotated)`)
console.log(`    动作:  npm version → push ${BRANCH} → push ${tag}`)
if (dryRun) {
  console.log(`\n✅  dry-run 通过，以上检查全部就绪（未做任何修改）\n`)
  process.exit(0)
}

// ── Publish ──────────────────────────────────────────────────────────────────

sh(`npm version ${bump} -m "chore：发布 v%s"`, { stdio: 'inherit' })

const published = currentVersion()
if (published !== to) fail(`npm version 后版本为 ${published}，与预期 ${to} 不符，请检查 git 状态`)

sh(`git push origin ${BRANCH}`)
sh(`git push origin ${tag}`)

console.log(`\n✅  v${to} 已推送，CI 开始构建`)

const remoteUrl = sh('git remote get-url origin')
const slug = /github\.com[:/](.+?)(?:\.git)?$/.exec(remoteUrl)?.[1]
if (slug) {
  console.log(`    进度: https://github.com/${slug}/actions/workflows/build-release.yml\n`)
}
