import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateRecords, recordShapes } from './generate.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const generatedId = path.join(directory, 'records.svelte.js')
const projectionPath = '/packages/houdini-svelte/runtime/reactivity/projection.svelte.ts'

export function generatedRecordPlugin(selections, paired = false) {
	const shapes = recordShapes(selections)
	const code = generateRecords(shapes)
	const runtime = path.resolve(directory, '../../../packages/houdini-svelte/runtime')
	const clones = new Map([
		'stores/query.ts', 'stores/base.ts', 'stores/mode.ts', 'reactivity/stores.ts', 'reactivity/state.svelte.ts',
		'reactivity/fields.ts', 'reactivity/projection.svelte.ts',
	].map(file => {
		const original = path.join(runtime, file)
		return [original.replace(/(\.svelte)?\.ts$/, '.experiment$1.ts'), original]
	}))
	const clone = original => [...clones].find(([, value]) => value === original)?.[0]
	const queryId = clone(path.join(runtime, 'stores/query.ts'))
	return {
		name: 'experimental-generated-records',
		enforce: 'pre',
		api: { shapes, sha256: createHash('sha256').update(code).digest('hex'), code, paired },
		resolveId(source, importer) {
			if (source === 'benchmark:generated-records') return generatedId
			if (paired && source === 'benchmark:generated-query') return queryId
			if (paired && clones.has(importer) && source.startsWith('.')) {
				const original = path.resolve(path.dirname(clones.get(importer)), source).replace(/\.js$/, '.ts')
				return clone(original)
			}
		},
		async load(id) {
			if (id === generatedId) return code
			if (id.endsWith('/perf/svelte-dashboard/main.js')) {
				return `import { generatedRecords } from 'benchmark:generated-records'\nwindow.__isGeneratedRecord = value => generatedRecords.has(value)\nwindow.__pairedGeneratedRecords = ${paired}\n${await readFile(id, 'utf8')}`
			}
			if (paired && id.endsWith('/perf/svelte-dashboard/fixture.js')) {
				const fixture = await readFile(id, 'utf8')
				const before = "mode === 'store' || mode === 'native' ? LegacyQueryStore : QueryStore"
				if (!fixture.includes(before)) throw new Error('Query fixture changed; update the paired experiment.')
				return `import { QueryStore as GeneratedQueryStore } from 'benchmark:generated-query'\n${fixture.replace(before, `mode === 'generated' ? GeneratedQueryStore : (${before})`)}`
			}
			if (paired) {
				const original = clones.get(id)
				if (!original) return
				if (original.endsWith('/stores/mode.ts')) return "export * from '../reactivity/stores.js'\n"
				if (!original.endsWith(projectionPath)) return readFile(original, 'utf8')
				id = original
			}
			if (!id.endsWith(projectionPath)) return
			let source = await readFile(id, 'utf8')
			const replace = (before, after) => {
				if (!source.includes(before)) throw new Error('Projection changed; update the generated-record experiment: ' + before)
				source = source.replace(before, after)
			}
			source = `import { createGeneratedRecord, generatedRecords } from 'benchmark:generated-records'\n${source}`
			replace('const record = records.get(value)\n\treturn record',
				'const generated = generatedRecords.get(value)\n\tif (generated) return generated.peek(value, field)\n\tconst record = records.get(value)\n\treturn record')
			replace('const record = records.get(value)\n\tif (!record)',
				'const generated = generatedRecords.get(value)\n\tif (generated) return generated.write(value, field, next)\n\tconst record = records.get(value)\n\tif (!record)')
			replace(`const fields: Record<string, Field> = Object.create(null)
		const names = Object.keys(snapshot)
		for (const name of names) fields[name] = new Field(read(name))
		view = new Proxy(fields, recordHandler)
		records.set(view, fields)`, `const names = Object.keys(snapshot)
		view = createGeneratedRecord(snapshot, names, read)
		if (!view) {
			const fields: Record<string, Field> = Object.create(null)
			for (const name of names) fields[name] = new Field(read(name))
			view = new Proxy(fields, recordHandler)
			records.set(view, fields)
		}`)
			return source
		},
	}
}
