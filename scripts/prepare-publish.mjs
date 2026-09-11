// Fixes up the built packages before pkg.pr.new publishes them. Both problems
// here are invisible until someone installs a preview and it goes wrong.
//
// 1. workspace: specs. Upstream releases with `pnpm publish`, which rewrites
//    `workspace:^` into a real range on the way out. pkg.pr.new packs the
//    directory closer to as-is, so a preview of houdini-lsp or any adapter keeps
//    the literal `workspace:^` in peerDependencies, which means nothing outside
//    this repo can resolve it.
//
// 2. Platform packages this run doesn't publish. The build writes all seven into
//    optionalDependencies; a preview publishes only the ones in PLATFORMS, and
//    the rest are left pointing at a preview version npm has never heard of.
//    They're optional, so an install survives, but it survives by failing a
//    fetch for every platform it isn't running on. Drop them instead.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const platforms = (process.env.PLATFORMS ?? '').split(/\s+/).filter(Boolean)
const targets = (process.env.TARGETS ?? '').split(/\s+/).filter(Boolean)

if (!platforms.length || !targets.length) {
	console.error('PLATFORMS and TARGETS must both be set')
	process.exit(1)
}

// name -> version for everything in the workspace, read after the version stamp
// so a stamped Go package resolves to the version actually being published.
const workspaceVersions = new Map()
for (const entry of readdirSync('packages', { withFileTypes: true })) {
	if (!entry.isDirectory()) continue
	try {
		const pkg = JSON.parse(readFileSync(path.join('packages', entry.name, 'package.json'), 'utf8'))
		if (pkg.name && pkg.version) workspaceVersions.set(pkg.name, pkg.version)
	} catch {
		// not a package, or unreadable: nothing to resolve against
	}
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

// `workspace:^` -> `^1.2.3`, `workspace:~` -> `~1.2.3`, `workspace:*` -> `1.2.3`.
function resolveWorkspaceSpec(name, spec) {
	const version = workspaceVersions.get(name)
	if (!version) return null
	const range = spec.slice('workspace:'.length)
	if (range === '*' || range === '') return version
	if (range === '^' || range === '~') return `${range}${version}`
	return range
}

let changed = 0

for (const target of targets) {
	const manifestPath = path.join(target, 'package.json')
	const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'))
	const notes = []

	for (const field of DEP_FIELDS) {
		const deps = pkg[field]
		if (!deps) continue

		for (const [name, spec] of Object.entries(deps)) {
			if (typeof spec !== 'string' || !spec.startsWith('workspace:')) continue
			const resolved = resolveWorkspaceSpec(name, spec)
			if (!resolved) {
				console.error(`${pkg.name}: ${field}.${name} is "${spec}" and no workspace package matches`)
				process.exit(1)
			}
			deps[name] = resolved
			notes.push(`${field}.${name}: ${spec} -> ${resolved}`)
		}
	}

	// Platform packages are named <package>-<nodeOS>-<cpu>, plus <package>-wasm.
	for (const name of Object.keys(pkg.optionalDependencies ?? {})) {
		if (!name.startsWith(`${pkg.name}-`)) continue
		const platform = name.slice(pkg.name.length + 1)
		if (platforms.includes(platform)) continue
		delete pkg.optionalDependencies[name]
		notes.push(`dropped optionalDependencies.${name}`)
	}

	if (notes.length) {
		writeFileSync(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`)
		console.log(`${pkg.name} (${target})`)
		for (const note of notes) console.log(`  ${note}`)
		changed += 1
	}
}

console.log(`\n${changed} of ${targets.length} manifests rewritten`)
