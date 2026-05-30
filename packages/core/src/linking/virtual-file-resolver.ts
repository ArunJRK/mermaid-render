import type { LinkResolver } from '../types'

export function normalizeDiagramPath(targetFile: string, fromFile: string): string | null {
  const trimmed = targetFile.trim()
  if (!trimmed) return null
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith('//')) return null

  const baseSegments = fromFile.startsWith('/')
    ? fromFile.split('/').slice(0, -1)
    : []
  const rawPath = trimmed.startsWith('/')
    ? trimmed
    : [...baseSegments, ...trimmed.split('/')].join('/')

  const normalized: string[] = []
  for (const segment of rawPath.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (normalized.length === 0) return null
      normalized.pop()
      continue
    }
    normalized.push(segment)
  }

  const canonical = `/${normalized.join('/')}`
  return canonical.endsWith('.mmd') ? canonical : `${canonical}.mmd`
}

export function createVirtualFileResolver(
  files: Record<string, string> | Map<string, string>,
): LinkResolver {
  const fileMap = files instanceof Map
    ? new Map(files)
    : new Map(Object.entries(files))

  return {
    canonicalize(targetFile: string, fromFile: string): string | null {
      return normalizeDiagramPath(targetFile, fromFile)
    },
    read(canonicalFile: string): string | null {
      return fileMap.get(canonicalFile) ?? null
    },
  }
}
