import { BitmapFont } from 'pixi.js'

let installed = false

/**
 * Install dynamic BitmapFonts for use in the renderer.
 * PixiJS 8 generates these from system fonts at runtime — no pre-built atlas needed.
 * SDF-based rendering keeps text crisp at any zoom level.
 */
export function ensureFontsInstalled(): void {
  if (installed) return
  installed = true

  BitmapFont.install({
    name: 'MermaidNode',
    style: {
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSize: 28, // Render at 2x for crisp scaling
      fill: 0xf1f5f9,
    },
    chars: BitmapFont.ASCII,
  })

  BitmapFont.install({
    name: 'MermaidLabel',
    style: {
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSize: 24,
      fill: 0x94a3b8,
      fontWeight: 'bold',
    },
    chars: BitmapFont.ASCII,
  })

  BitmapFont.install({
    name: 'MermaidEdge',
    style: {
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSize: 22,
      fill: 0xcbd5e1,
    },
    chars: BitmapFont.ASCII,
  })
}
