/**
 * Regression guard for the 2026-08-13 incident: bob's service-token auth
 * wiring (nginx `include /etc/nginx/bob-auth.conf;` + the docker-compose
 * bind mount that supplies that file) was hand-added on the NAS and never
 * committed, so a redeploy silently reverted it and the queue/debt panels
 * rendered empty (bob answers 401 without X-SPARTAN-Service-Token, since it
 * runs MCP_AUTH_REQUIRED=true). Fixed in e26f84d.
 *
 * These tests read the repo's config files directly (no server, no network,
 * no Docker) so CI fails loudly if the wiring regresses.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

const nginxConf = fs.readFileSync(path.join(REPO_ROOT, 'nginx.conf'), 'utf8')
const dockerCompose = fs.readFileSync(path.join(REPO_ROOT, 'docker-compose.yml'), 'utf8')
const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8')
const appJsxSource = fs.readFileSync(path.join(__dirname, 'App.jsx'), 'utf8')

/**
 * Parses top-level `location <path> { ... }` blocks out of an nginx server
 * config. Assumes location bodies don't contain nested `{}` blocks of their
 * own (true today — only proxy/header directives inside), so simple brace
 * depth tracking is sufficient to find each block's extent.
 */
function parseNginxLocationBlocks(conf) {
  const lines = conf.split('\n')
  const blocks = []
  let current = null
  let depth = 0
  for (const line of lines) {
    if (!current) {
      const match = line.match(/^\s*location\s+(.+?)\s*\{\s*$/)
      if (match) {
        current = { path: match[1].trim(), body: [] }
        depth = 1
      }
      continue
    }
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    depth += opens - closes
    if (depth <= 0) {
      blocks.push(current)
      current = null
      depth = 0
      continue
    }
    current.body.push(line)
  }
  return blocks
}

/** Extracts the text of a top-level `<indent>2><serviceName>:` block from a compose YAML. */
function getComposeServiceBlock(yaml, serviceName) {
  const lines = yaml.split('\n')
  const startIdx = lines.findIndex((l) => new RegExp(`^\\s{2}${serviceName}:\\s*$`).test(l))
  if (startIdx === -1) return ''
  const startIndent = lines[startIdx].match(/^(\s*)/)[1].length
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue
    const indent = lines[i].match(/^(\s*)/)[1].length
    if (indent <= startIndent) {
      endIdx = i
      break
    }
  }
  return lines.slice(startIdx, endIdx).join('\n')
}

describe('nginx.conf — /api/bob/ locations carry the bob-auth.conf include', () => {
  const blocks = parseNginxLocationBlocks(nginxConf)
  const bobBlocks = blocks.filter((b) => b.path.includes('/api/bob/'))

  it('parses at least one /api/bob/ location block (parsing sanity check)', () => {
    expect(bobBlocks.length).toBeGreaterThan(0)
  })

  it('every /api/bob/ location block includes /etc/nginx/bob-auth.conf', () => {
    const missing = bobBlocks
      .filter((b) => !b.body.some((l) => l.includes('include /etc/nginx/bob-auth.conf;')))
      .map((b) => b.path)
    expect(missing).toEqual([])
  })
})

describe('docker-compose.yml — bob-auth.conf is mounted into spartan-dashboard', () => {
  it('mounts ./bob-auth.conf:/etc/nginx/bob-auth.conf:ro on the spartan-dashboard service', () => {
    const serviceBlock = getComposeServiceBlock(dockerCompose, 'spartan-dashboard')
    expect(serviceBlock).toContain('./bob-auth.conf:/etc/nginx/bob-auth.conf:ro')
  })
})

describe('App.jsx — GROUPS registry has no decommissioned agents', () => {
  function extractGroupsSource(source) {
    const start = source.indexOf('const GROUPS = [')
    const end = source.indexOf('const ALL_AGENTS')
    if (start === -1 || end === -1) {
      throw new Error('GROUPS registry not found in App.jsx — has it been renamed/moved?')
    }
    return source.slice(start, end)
  }

  const groupsSource = extractGroupsSource(appJsxSource)
  const ids = [...groupsSource.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1])

  it('parses at least one agent id out of GROUPS (parsing sanity check)', () => {
    expect(ids.length).toBeGreaterThan(0)
  })

  it('contains none of the decommissioned ids: forge, erlai, comply, erlai-*', () => {
    const decommissioned = ids.filter(
      (id) => id === 'forge' || id === 'erlai' || id === 'comply' || id.startsWith('erlai-'),
    )
    expect(decommissioned).toEqual([])
  })
})

describe('.gitignore — bob-auth.conf stays out of the repo', () => {
  it('lists bob-auth.conf (it holds a live secret and must never be committed)', () => {
    const listed = gitignore.split('\n').some((line) => line.trim() === 'bob-auth.conf')
    expect(listed).toBe(true)
  })
})
