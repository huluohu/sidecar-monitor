/**
 * Post a build-result notification (success or failure) to a WeCom
 * (企业微信) group robot.
 *
 * Reads from the environment:
 *   WECOM_WEBHOOK_URL — group robot webhook (GitHub secret). When unset the
 *                       script exits 0 so CI is unaffected.
 *   STATUS             — 'success' or 'failure'.
 *   PACKAGE_RESULT     — result of the package job ('success'/'failure'/'skipped'...).
 *   RELEASE_RESULT     — result of the release job.
 *   GITHUB_*           — standard GitHub Actions variables for the message.
 *
 * Exits non-zero when the robot rejects the message so misconfiguration is
 * visible in the run log.
 */
const url = process.env.WECOM_WEBHOOK_URL
if (!url) {
  console.log('WECOM_WEBHOOK_URL is not set — skipping WeCom notification.')
  process.exit(0)
}

const isTag = (process.env.GITHUB_REF_NAME || '').startsWith('v')
const repo = process.env.GITHUB_REPOSITORY || ''
const ref = process.env.GITHUB_REF_NAME || '-'
const actor = process.env.GITHUB_ACTOR || '-'
const workflow = process.env.GITHUB_WORKFLOW || 'Build'
const runUrl = `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID || ''}`

let lines
if (process.env.STATUS === 'success') {
  lines = [
    `**${workflow} 构建成功**`,
    `> 版本：<font color="info">${ref}</font>`,
    `> 触发者：${actor}`,
  ]
  if (isTag) lines.push(`> [下载 Release](https://github.com/${repo}/releases/tag/${ref})`)
} else {
  const stage =
    process.env.PACKAGE_RESULT !== 'success'
      ? `打包（${process.env.PACKAGE_RESULT || '-'}）`
      : `发版（${process.env.RELEASE_RESULT || '-'}）`
  lines = [
    `**${workflow} 构建失败**`,
    `> 阶段：<font color="warning">${stage}</font>`,
    `> 分支/标签：${ref}`,
    `> 触发者：${actor}`,
  ]
}
lines.push(`> [运行日志](${runUrl})`)

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ msgtype: 'markdown', markdown: { content: lines.join('\n') } }),
})
const data = await res.json().catch(() => null)
if (!res.ok || data?.errcode !== 0) {
  console.error(`WeCom notification failed: HTTP ${res.status}`, data)
  process.exit(1)
}
console.log('WeCom notification sent.')
