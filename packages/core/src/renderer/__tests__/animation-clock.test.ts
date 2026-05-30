import { describe, expect, it } from 'vitest'

declare const require: any
declare const process: { cwd(): string }

const { readdirSync, readFileSync } = require('fs') as {
  readdirSync(path: string, options?: { withFileTypes?: boolean }): Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>
  readFileSync(path: string, encoding: string): string
}

const RENDERER_DIR = `${process.cwd()}/src/renderer`
const RAF_RE = /\b(?:requestAnimationFrame|cancelAnimationFrame)\b/

function collectRendererFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>
  const files: string[] = []

  for (const entry of entries) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      files.push(...collectRendererFiles(path))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files
}

describe('renderer animation clock', () => {
  it('keeps requestAnimationFrame out of renderer animation paths except resize debounce', () => {
    const rendererFiles = collectRendererFiles(RENDERER_DIR)
      .filter((file) => !file.includes('/__tests__/'))

    const offenders: Array<{ file: string; line: number; text: string }> = []

    for (const file of rendererFiles) {
      const relative = file.replace(`${RENDERER_DIR}/`, '')
      const lines = readFileSync(file, 'utf8').split('\n')

      for (const [index, line] of lines.entries()) {
        if (!RAF_RE.test(line)) continue

        const allowedResizeDebounce =
          relative === 'mermaid-renderer.ts'
          && line.includes('_resizeRafId')

        if (!allowedResizeDebounce) {
          offenders.push({
            file: relative,
            line: index + 1,
            text: line.trim(),
          })
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
