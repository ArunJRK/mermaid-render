/**
 * Estimate text width for layout purposes.
 * Uses average character widths per font style.
 * More accurate than the old `length * 8` estimate.
 */

const AVG_CHAR_WIDTH_PROPORTIONAL = 9.0  // Conservative: BitmapText renders wider than CSS
const AVG_CHAR_WIDTH_MONOSPACE = 9.5     // JetBrains Mono BitmapText
const WIDE_CHARS = /[WMQODHNG@]/g       // Characters wider than average
const NARROW_CHARS = /[iljt1!|:;,.]/g   // Characters narrower than average

export function measureTextWidth(
  text: string,
  fontSize: number = 14,
  monospace: boolean = false,
): number {
  const baseWidth = monospace ? AVG_CHAR_WIDTH_MONOSPACE : AVG_CHAR_WIDTH_PROPORTIONAL
  const scale = fontSize / 14

  // Count wide and narrow characters for proportional fonts
  let width = text.length * baseWidth
  if (!monospace) {
    const wideCount = (text.match(WIDE_CHARS) || []).length
    const narrowCount = (text.match(NARROW_CHARS) || []).length
    width += wideCount * 2.5  // wide chars add ~2.5px each
    width -= narrowCount * 2  // narrow chars save ~2px each
  }

  return width * scale
}

/**
 * Compute node width from label text, respecting min width and padding.
 */
export function computeNodeWidth(
  label: string,
  minWidth: number,
  padding: number,
  monospace: boolean = false,
): number {
  const textWidth = measureTextWidth(label, 14, monospace)
  return Math.max(minWidth, Math.min(textWidth + padding * 2, 350)) // cap at 350px
}
