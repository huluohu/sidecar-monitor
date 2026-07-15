import { describe, expect, it } from 'vitest'
import { runProcessPipeline } from '../scripts/process-pipeline.mjs'

const nodeProcess = process.execPath

function nodeCommand(source: string, label: string) {
  return {
    command: nodeProcess,
    args: ['-e', source],
    label,
  }
}

describe('runProcessPipeline', () => {
  it('streams large stdout into the destination without a parent buffer', async () => {
    await expect(
      runProcessPipeline(
        nodeCommand(
          'const chunk = Buffer.alloc(1024 * 1024); for (let i = 0; i < 16; i++) process.stdout.write(chunk)',
          'producer',
        ),
        nodeCommand(
          'let size = 0; process.stdin.on("data", chunk => size += chunk.length); process.stdin.on("end", () => process.exit(size === 16 * 1024 * 1024 ? 0 : 9))',
          'consumer',
        ),
      ),
    ).resolves.toBeUndefined()
  })

  it('reports an upstream failure with bounded stderr', async () => {
    await expect(
      runProcessPipeline(
        nodeCommand(
          'process.stderr.write("upstream boom\\n" + "x".repeat(100000), () => process.exit(3))',
          'rpm2cpio',
        ),
        nodeCommand('process.stdin.resume()', 'cpio extraction'),
      ),
    ).rejects.toSatisfy((error: Error) => {
      expect(error.message).toContain('rpm2cpio failed with exit code 3')
      expect(error.message).toContain('upstream boom')
      expect(error.message).toContain('[stderr truncated]')
      expect(error.message.length).toBeLessThan(66_000)
      return true
    })
  })

  it('reports a downstream failure without including pipeline stdout', async () => {
    await expect(
      runProcessPipeline(
        nodeCommand('process.stdout.write("070701 archive body")', 'rpm2cpio'),
        nodeCommand(
          'process.stdin.resume(); process.stderr.write("downstream boom"); process.exit(4)',
          'cpio extraction',
        ),
      ),
    ).rejects.toSatisfy((error: Error) => {
      expect(error.message).toContain('cpio extraction failed with exit code 4')
      expect(error.message).toContain('downstream boom')
      expect(error.message).not.toContain('070701 archive body')
      return true
    })
  })

  it('reports a process that cannot be started', async () => {
    await expect(
      runProcessPipeline(
        {
          command: `missing-command-${process.pid}`,
          label: 'missing producer',
        },
        nodeCommand('process.stdin.resume()', 'consumer'),
      ),
    ).rejects.toThrow('missing producer failed to start')
  })
})
