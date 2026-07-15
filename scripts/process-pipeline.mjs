import { spawn } from 'node:child_process'

const STDERR_LIMIT = 64 * 1024

function captureStderr(stream) {
  const chunks = []
  let size = 0
  let truncated = false

  stream?.on('data', chunk => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const remaining = STDERR_LIMIT - size
    if (remaining > 0) {
      const captured = buffer.subarray(0, remaining)
      chunks.push(captured)
      size += captured.length
    }
    if (buffer.length > remaining) truncated = true
  })

  return () => {
    const text = Buffer.concat(chunks).toString('utf8').trim()
    return truncated ? `${text}\n[stderr truncated]` : text
  }
}

function waitForProcess(child) {
  return new Promise(resolve => {
    let spawnError = null
    child.once('error', error => {
      spawnError = error
    })
    child.once('close', (code, signal) => {
      resolve({ code, signal, spawnError })
    })
  })
}

function describeFailure(label, result, stderr) {
  if (result.spawnError) return `${label} failed to start: ${result.spawnError.message}`
  const status = result.signal ? `signal ${result.signal}` : `exit code ${result.code}`
  return `${label} failed with ${status}${stderr ? `:\n${stderr}` : ''}`
}

/**
 * Pipe stdout from one process directly into another without buffering it in Node.
 */
export async function runProcessPipeline(source, destination) {
  const upstream = spawn(source.command, source.args ?? [], {
    cwd: source.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const downstream = spawn(destination.command, destination.args ?? [], {
    cwd: destination.cwd,
    stdio: ['pipe', 'ignore', 'pipe'],
  })

  const getUpstreamStderr = captureStderr(upstream.stderr)
  const getDownstreamStderr = captureStderr(downstream.stderr)

  // A downstream process can exit before the producer. Consume EPIPE here and
  // report the actual child exit status below.
  downstream.stdin?.on('error', () => undefined)
  upstream.stdout?.pipe(downstream.stdin)

  downstream.once('error', () => {
    if (!upstream.killed) upstream.kill()
  })

  const [upstreamResult, downstreamResult] = await Promise.all([
    waitForProcess(upstream),
    waitForProcess(downstream),
  ])

  if (upstreamResult.spawnError || upstreamResult.code !== 0) {
    throw new Error(
      describeFailure(source.label ?? source.command, upstreamResult, getUpstreamStderr()),
    )
  }
  if (downstreamResult.spawnError || downstreamResult.code !== 0) {
    throw new Error(
      describeFailure(
        destination.label ?? destination.command,
        downstreamResult,
        getDownstreamStderr(),
      ),
    )
  }
}

export function extractRpmArchive(rpmPath, workDir) {
  return runProcessPipeline(
    {
      command: 'rpm2cpio',
      args: [rpmPath],
      label: 'rpm2cpio',
    },
    {
      command: 'cpio',
      args: ['-idm', '--quiet'],
      cwd: workDir,
      label: 'cpio extraction',
    },
  )
}
