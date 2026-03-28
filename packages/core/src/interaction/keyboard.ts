const keyMap: Record<string, string> = {
  f: 'fitToView',
  r: 'resetView',
}

/**
 * Maps a keyboard key to a renderer action name.
 * Returns undefined if the key has no mapped action.
 */
export function mapKeyToAction(key: string): string | undefined {
  return keyMap[key]
}
