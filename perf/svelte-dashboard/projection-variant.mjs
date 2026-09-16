import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const runtime = path.resolve(root, '../../packages/houdini-svelte/runtime')

// Isolate a small projector change from the current runtime in a paired build.
// Copies share the cache and client. The field index and projector are transformed.
// Baseline restores the pre-profile implementation; the projection candidates
// apply changes to that baseline. Field-read candidates only change the current
// property handler. The normal fields mode always uses the current runtime.
export function projectionVariant(name) {
	const paired = !name.endsWith('-single')
	name = name.replace(/-single$/, '')
	const plain = ['plain-records', 'plain-resolved'].includes(name)
	const resolved = ['resolved-fields', 'plain-resolved', 'resolved-leaves'].includes(name)
	const fieldReads = ['single-lookup', 'checked-lookup'].includes(name)
	if (!plain && !resolved && !fieldReads && name !== 'baseline')
		throw new Error('Unknown projection variant: ' + name)
	const originals = [
		'stores/query.ts',
		'stores/base.ts',
		'stores/mode.ts',
		'reactivity/stores.ts',
		'reactivity/state.svelte.ts',
		'reactivity/fields.ts',
		'reactivity/projection.svelte.ts',
	].map((file) => path.join(runtime, file))
	const clones = new Map(
		originals.map((file) => [file.replace(/(\.svelte)?\.ts$/, '.variant$1.ts'), file])
	)
	const clone = (file) => [...clones].find(([, original]) => original === file)?.[0]
	const query = clone(path.join(runtime, 'stores/query.ts'))
	const projection = clone(path.join(runtime, 'reactivity/projection.svelte.ts'))
	return {
		name: 'projection-variant',
		enforce: 'pre',
		resolveId(source, importer) {
			if (source === 'benchmark:variant-query') return query
			if (source === 'benchmark:variant-projection') return projection
			if (clones.has(importer) && source.startsWith('.'))
				return clone(
					path.resolve(path.dirname(clones.get(importer)), source).replace(/\.js$/, '.ts')
				)
		},
		async load(id) {
			if (paired && id.endsWith('/perf/svelte-dashboard/main.js'))
				return `
import { ownsVariant } from 'benchmark:variant-projection'
window.__variantMode = ${JSON.stringify(name)}
window.__isVariantRecord = ownsVariant
${await readFile(id, 'utf8')}`
			if (paired && id.endsWith('/perf/svelte-dashboard/fixture.js')) {
				const source = await readFile(id, 'utf8')
				const before = "mode === 'store' || mode === 'native' ? LegacyQueryStore : QueryStore"
				if (!source.includes(before)) throw new Error('Query fixture changed.')
				return `import { QueryStore as VariantQuery } from 'benchmark:variant-query'\n${source.replace(before, `mode === ${JSON.stringify(name)} ? VariantQuery : (${before})`)}`
			}
			const original = paired ? clones.get(id) : originals.includes(id) ? id : undefined
			if (!original) return
			let source = await readFile(original, 'utf8')
			if (original.endsWith('/stores/mode.ts')) return "export * from '../reactivity/stores.js'\n"
			if (original.endsWith('/projection.svelte.ts')) {
				const checked = `return typeof name === 'string' && owns.call(target, name)
			? target[name].read()
			: Reflect.get(Object.prototype, name, receiver)`
				const single = `const field = typeof name === 'string' ? target[name] : undefined
		return field ? field.read() : Reflect.get(Object.prototype, name, receiver)`
				if (!source.includes(checked) && !source.includes(single))
					throw new Error('Field read handler changed; update the variant.')
				source = source.replace(
					source.includes(single) ? single : checked,
					name === 'single-lookup' ? single : checked
				)
				source += '\nexport const ownsVariant = value => records.has(value)\n'
				// Read variants compare only the property handler against current source.
				if (fieldReads) return source
				const before = `const value = capture(snapshot)
		if (isStandardDate(value)) dates.set(value, value.getTime())
		return value`
				const after = `if (!isStandardDate(snapshot)) return snapshot
		const value = new Date(snapshot.getTime())
		dates.set(value, value.getTime())
		return value`
				if (!source.includes(before) && !source.includes(after))
					throw new Error('Scalar projection changed.')
				source = source.replace(
					source.includes(after) ? after : before,
					name === 'resolved-leaves' ? after : before
				)
				if (name !== 'resolved-leaves')
					source = source.replace(
						'import { isContainer,',
						'import { capture, isContainer,'
					)
				if (plain) {
					const before = 'const fields: Record<string, Field> = Object.create(null)'
					if (!source.includes(before))
						throw new Error('Projector changed; update the variant.')
					source = source.replace(
						before,
						`const fields: Record<string, Field> = Object.keys(snapshot).includes('__proto__') ? Object.create(null) : {}`
					)
				}
			}
			if (!fieldReads && original.endsWith('/fields.ts')) {
				const before =
					'const fields = getFieldsForType({ fields: record.fields }, snapshot.__typename as string, false)'
				const after = 'const fields = record.fields'
				if (!source.includes(before) && !source.includes(after))
					throw new Error('Field index changed; update the variant.')
				source = source.replace(
					source.includes(after) ? after : before,
					resolved ? after : before
				)
				if (!resolved)
					source = `import { getFieldsForType } from 'houdini/runtime/selection'\n${source}`
			}

			return source
		},
	}
}
