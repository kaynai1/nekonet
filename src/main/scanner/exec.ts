import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function decode(buf: Buffer): string {
  const utf8 = buf.toString('utf8')
  if (!utf8.includes('\uFFFD')) return utf8
  try {
    return new TextDecoder('gbk').decode(buf)
  } catch {
    return utf8
  }
}

export async function run(file: string, args: string[], timeoutMs = 12000): Promise<string> {
  try {
    const { stdout } = await execFileAsync(file, args, {
      timeout: timeoutMs,
      windowsHide: true,
      encoding: 'buffer',
      maxBuffer: 8 * 1024 * 1024
    })
    return decode(stdout as unknown as Buffer)
  } catch (err) {
    const stdout = (err as { stdout?: Buffer }).stdout
    return stdout ? decode(stdout) : ''
  }
}

export async function runPowerShell(script: string, timeoutMs = 15000): Promise<string> {
  return run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    timeoutMs
  )
}
