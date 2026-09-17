import { expect, test } from 'vitest'
import { mutable } from './mutable.js'
import { project, setField } from './reactivity/projection.svelte.js'

test('a mutable copy can be sorted without changing the result and keeps live items', () => {
	const result = project([{ name: 'B' }, { name: 'A' }])
	const copy = mutable<{ readonly name: string }>(result)
	copy.sort((a, b) => a.name.localeCompare(b.name))
	expect(result.map((item: any) => item.name)).toEqual(['B', 'A'])
	expect(copy[0]).toBe(result[1])
	setField(result[1], 'name', 'Changed')
	expect(copy[0].name).toBe('Changed')
	expect(() => ((copy[0] as any).name = 'Local')).toThrow('readonly')
	copy.pop()
	expect(result).toHaveLength(2)
})
