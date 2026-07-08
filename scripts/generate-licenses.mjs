// Generates build/THIRD_PARTY_LICENSES.txt — a consolidated attribution file
// for every third-party package whose code ships inside the app.
//
// What ships (and therefore must be attributed):
//   1. Production `dependencies` — externalized by electron-vite and packaged
//      as node_modules inside app.asar (e.g. keytar, electron-updater).
//   2. Runtime libraries the renderer/main bundles — discovered by scanning the
//      bare imports in src/ (react, @tiptap/*, pdfjs-dist, …).
// Plus the full transitive closure of both, walked via each package's own
// runtime `dependencies`.
//
// Build-only tooling (vite, eslint, typescript, electron-builder, tailwind, …)
// is intentionally excluded: it never reaches the user's machine, so scanning
// src/ rather than devDependencies keeps the list correct and self-maintaining.

import { promises as fs } from 'fs'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const nmRoot = join(root, 'node_modules')
const OUT = join(root, 'build', 'THIRD_PARTY_LICENSES.txt')

/** Reduce an import specifier to its top-level package name. */
function pkgFromSpecifier(spec) {
  if (!spec || spec.startsWith('.') || spec.startsWith('@renderer') || spec.startsWith('@shared'))
    return null
  if (spec.startsWith('@')) {
    const [scope, name] = spec.split('/')
    return scope && name ? `${scope}/${name}` : null
  }
  return spec.split('/')[0]
}

/** Collect every bare import/require specifier under src/. */
function scanSourceImports(dir, found = new Set()) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      scanSourceImports(full, found)
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) {
      const src = readFileSync(full, 'utf8')
      const re = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g
      let m
      while ((m = re.exec(src))) {
        const name = pkgFromSpecifier(m[1] || m[2] || m[3])
        if (name) found.add(name)
      }
    }
  }
  return found
}

/** Resolve a package directory: nearest node_modules walking up from `fromDir`. */
function resolvePkgDir(name, fromDir) {
  let dir = fromDir
  while (true) {
    const cand = join(dir, 'node_modules', name)
    if (existsSync(join(cand, 'package.json'))) return cand
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const top = join(nmRoot, name)
  return existsSync(join(top, 'package.json')) ? top : null
}

const LICENSE_FILE_RE = /^(licen[cs]e|copying|copyright|notice|unlicense)(\.|$)/i

/** Find and read a license/notice file shipped inside a package, if any. */
function readLicenseText(pkgDir) {
  let entries
  try {
    entries = readdirSync(pkgDir)
  } catch {
    return null
  }
  const files = entries
    .filter((f) => {
      try {
        return LICENSE_FILE_RE.test(f) && statSync(join(pkgDir, f)).isFile()
      } catch {
        return false
      }
    })
    // Prefer a plain LICENSE over LICENSE-MIT etc., but include all.
    .sort((a, b) => a.length - b.length)
  if (!files.length) return null
  return files
    .map((f) => {
      const text = readFileSync(join(pkgDir, f), 'utf8').trim()
      return files.length > 1 ? `----- ${f} -----\n${text}` : text
    })
    .join('\n\n')
}

function licenseId(pj) {
  if (typeof pj.license === 'string') return pj.license
  if (pj.license && typeof pj.license === 'object') return pj.license.type || 'see file'
  if (Array.isArray(pj.licenses)) return pj.licenses.map((l) => l.type || l).join(' OR ')
  return 'UNKNOWN'
}

async function main() {
  // Roots: production deps + runtime libs imported by src/.
  const pkg = JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf8'))
  const prodDeps = Object.keys(pkg.dependencies ?? {})
  const imported = [...scanSourceImports(join(root, 'src'))].filter((n) =>
    resolvePkgDir(n, root)
  )
  const roots = [...new Set([...prodDeps, ...imported])]

  // BFS the runtime-dependency closure.
  const collected = new Map() // name@version -> record
  const missing = []
  const queue = roots.map((name) => ({ name, from: root }))
  const visitedDirs = new Set()

  while (queue.length) {
    const { name, from } = queue.shift()
    const dir = resolvePkgDir(name, from)
    if (!dir || visitedDirs.has(dir)) continue
    visitedDirs.add(dir)
    let pj
    try {
      pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    const key = `${pj.name}@${pj.version}`
    if (!collected.has(key)) {
      const text = readLicenseText(dir)
      if (!text) missing.push(key)
      collected.set(key, {
        name: pj.name,
        version: pj.version,
        license: licenseId(pj),
        homepage: pj.homepage || (pj.repository && (pj.repository.url || pj.repository)) || '',
        text
      })
    }
    for (const dep of [
      ...Object.keys(pj.dependencies ?? {}),
      ...Object.keys(pj.optionalDependencies ?? {})
    ]) {
      queue.push({ name: dep, from: dir })
    }
  }

  const records = [...collected.values()].sort((a, b) => a.name.localeCompare(b.name))
  const stamp = process.env.SOURCE_DATE_EPOCH
    ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString().slice(0, 10)
    : ''

  const header = [
    `${pkg.productName ?? pkg.name} — Third-Party Software Licenses`,
    stamp ? `Generated: ${stamp}` : '',
    '',
    `This application bundles the ${records.length} third-party packages listed`,
    'below. Each is distributed under its own license, reproduced in full here.',
    'Build-only tooling is excluded, as it is not distributed with the app.',
    '',
    '='.repeat(78),
    ''
  ]
    .filter((l) => l !== null)
    .join('\n')

  const body = records
    .map((r) => {
      const lines = [
        '',
        '-'.repeat(78),
        `${r.name} v${r.version}`,
        `License: ${r.license}`
      ]
      if (r.homepage) lines.push(`Homepage: ${r.homepage}`)
      lines.push('-'.repeat(78), '')
      lines.push(r.text || `(No license text file shipped; declared license: ${r.license}.)`)
      return lines.join('\n')
    })
    .join('\n')

  await fs.mkdir(dirname(OUT), { recursive: true })
  await fs.writeFile(OUT, header + body + '\n')

  console.log(`Wrote ${OUT}`)
  console.log(`  ${records.length} packages attributed (roots: ${roots.length}).`)
  if (missing.length) {
    console.log(
      `  Note: ${missing.length} package(s) ship no license file; declared SPDX id used instead:`
    )
    console.log('    ' + missing.sort().join(', '))
  }
}

main().catch((e) => {
  console.error('License generation failed:', e)
  process.exit(1)
})
