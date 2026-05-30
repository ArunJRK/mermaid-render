import { describe, expect, it } from 'vitest'

declare const require: any
declare const process: { cwd(): string }

const { readdirSync, readFileSync } = require('fs') as {
  readdirSync(path: string): string[]
  readFileSync(path: string, encoding: string): string
}

const RENDERER_DIR = `${process.cwd()}/src/renderer`
const HEX_COLOR_LITERAL_RE = /0x[0-9a-fA-F]{3,}|#[0-9a-fA-F]{3,8}/g

describe('renderer semantic colors', () => {
  it('keeps hardcoded color literals out of renderer files outside theme/font definitions', () => {
    const rendererFiles = readdirSync(RENDERER_DIR)
      .filter((file: string) => file.endsWith('.ts'))
      .filter((file: string) => file !== 'theme.ts' && file !== 'fonts.ts')

    const offenders: Array<{ file: string; matches: string[] }> = []

    for (const file of rendererFiles) {
      const contents = readFileSync(`${RENDERER_DIR}/${file}`, 'utf8')
      const matches = contents.match(HEX_COLOR_LITERAL_RE)
      if (matches && matches.length > 0) {
        offenders.push({ file, matches })
      }
    }

    expect(offenders).toEqual([])
  })
})
