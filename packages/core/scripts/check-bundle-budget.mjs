import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const CORE_BUDGET_BYTES = 330 * 1024
const DEMO_ENTRY_BUDGET_BYTES = 500 * 1024
const DEMO_ENTRY_GZIP_BUDGET_BYTES = 160 * 1024
const demoAssetsDir = new URL('../dist-demo/assets', import.meta.url)

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`
}

function requireFileSize(pathname) {
  const size = statSync(pathname).size
  return size
}

function findDemoEntry() {
  const files = readdirSync(demoAssetsDir)
    .filter((file) => /^index-.*\.js$/.test(file))
  if (files.length === 0) {
    throw new Error('Missing demo entry chunk under dist-demo/assets.')
  }
  return files
    .map((file) => ({
      file,
      mtimeMs: statSync(join(demoAssetsDir.pathname, file)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].file
}

const esmSize = requireFileSize(new URL('../dist/index.js', import.meta.url))
const cjsSize = requireFileSize(new URL('../dist/index.cjs', import.meta.url))
const demoEntry = findDemoEntry()
const demoEntryPath = join(demoAssetsDir.pathname, demoEntry)
const demoEntrySize = requireFileSize(demoEntryPath)
const demoEntryGzipSize = gzipSync(readFileSync(demoEntryPath)).byteLength

console.log(`Core ESM: ${formatKiB(esmSize)} (${esmSize} bytes)`)
console.log(`Core CJS: ${formatKiB(cjsSize)} (${cjsSize} bytes)`)
console.log(
  `Demo entry: ${demoEntry} ${formatKiB(demoEntrySize)} (${demoEntrySize} bytes), gzip ${formatKiB(demoEntryGzipSize)} (${demoEntryGzipSize} bytes)`,
)

if (esmSize > CORE_BUDGET_BYTES) {
  throw new Error(
    `Core ESM bundle exceeds budget: ${formatKiB(esmSize)} > ${formatKiB(CORE_BUDGET_BYTES)}`,
  )
}

if (cjsSize > CORE_BUDGET_BYTES) {
  throw new Error(
    `Core CJS bundle exceeds budget: ${formatKiB(cjsSize)} > ${formatKiB(CORE_BUDGET_BYTES)}`,
  )
}

if (demoEntrySize > DEMO_ENTRY_BUDGET_BYTES) {
  throw new Error(
    `Demo entry bundle exceeds budget: ${formatKiB(demoEntrySize)} > ${formatKiB(DEMO_ENTRY_BUDGET_BYTES)}`,
  )
}

if (demoEntryGzipSize > DEMO_ENTRY_GZIP_BUDGET_BYTES) {
  throw new Error(
    `Demo entry gzip bundle exceeds budget: ${formatKiB(demoEntryGzipSize)} > ${formatKiB(DEMO_ENTRY_GZIP_BUDGET_BYTES)}`,
  )
}

console.log(`Core bundle budget check passed at ${formatKiB(CORE_BUDGET_BYTES)}.`)
console.log(
  `Demo entry budget check passed at ${formatKiB(DEMO_ENTRY_BUDGET_BYTES)} raw / ${formatKiB(DEMO_ENTRY_GZIP_BUDGET_BYTES)} gzip.`,
)
