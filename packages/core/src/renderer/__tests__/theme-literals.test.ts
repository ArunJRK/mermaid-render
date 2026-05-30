import { describe, expect, it } from 'vitest'

declare const require: any
declare const process: { cwd(): string }

const { readdirSync, readFileSync } = require('fs') as {
  readdirSync(path: string, options?: { withFileTypes?: boolean }): Array<string | { name: string; isDirectory(): boolean; isFile(): boolean }>
  readFileSync(path: string, encoding: string): string
}

const RENDERER_DIR = `${process.cwd()}/src/renderer`
const HEX_COLOR_LITERAL_RE = /0x[0-9a-fA-F]{3,}|#[0-9a-fA-F]{3,8}/g

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

describe('renderer semantic colors', () => {
  it('keeps hardcoded color literals out of renderer files outside theme/font definitions', () => {
    const rendererFiles = collectRendererFiles(RENDERER_DIR)
      .filter((file: string) => !file.includes('/__tests__/'))
      .filter((file: string) => !file.endsWith('/theme.ts') && !file.endsWith('/fonts.ts'))

    const offenders: Array<{ file: string; matches: string[] }> = []

    for (const file of rendererFiles) {
      const contents = readFileSync(file, 'utf8')
      const matches = contents.match(HEX_COLOR_LITERAL_RE)
      if (matches && matches.length > 0) {
        offenders.push({ file: file.replace(`${RENDERER_DIR}/`, ''), matches })
      }
    }

    expect(offenders).toEqual([])
  })
})
