import { BitmapFont } from 'pixi.js'

let installed = false

// Printable ASCII range for pre-rendering
const ASCII_CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'

/**
 * Install dynamic BitmapFonts for use in the renderer.
 * PixiJS 8 generates these from system fonts at runtime — no pre-built atlas needed.
 * Text stays crisp at any zoom level.
 */
export function ensureFontsInstalled(): void {
  if (installed) return
  installed = true

  BitmapFont.install({
    name: 'MermaidNode',
    style: {
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSize: 28,
      fill: 0xf1f5f9,
    },
    chars: ASCII_CHARS.split(''),
  })

  BitmapFont.install({
    name: 'MermaidLabel',
    style: {
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSize: 24,
      fill: 0x94a3b8,
      fontWeight: 'bold',
    },
    chars: ASCII_CHARS.split(''),
  })

  BitmapFont.install({
    name: 'MermaidEdge',
    style: {
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSize: 22,
      fill: 0xcbd5e1,
    },
    chars: ASCII_CHARS.split(''),
  })
}
