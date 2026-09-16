import { Cache } from 'houdini/runtime/cache'
import { testConfigFile } from 'houdini/test'
import { expect, test } from 'vitest'
import { HoudiniClient } from '../client.js'
import { setMockConfig } from '../config.js'

test('fragment setup and resumption retain arguments without marshalling scalars twice', async () => {
	const config = testConfigFile({
		scalars: {
			Date: {
				type: 'Date',
				marshal: (value: Date) => value.toISOString(),
				unmarshal: (value: string) => new Date(value),
			},
		},
	})
	setMockConfig(config)
	const cache = new Cache({ ...config, disabled: false })
	const selection = {
		fields: {
			avatar: { type: 'String', keyRaw: 'avatar(size: $size, at: $at)', visible: true },
		},
	}
	const variables = { size: 64, at: new Date('2026-01-01') }
	const write = (avatar: string, size = 64) =>
		cache.write({
			parent: 'User:1',
			selection,
			variables: { size, at: variables.at.toISOString() },
			data: { avatar },
		})
	write('Small')
	write('Large', 128)
	const store = new HoudiniClient({ cache }).observe({
		fieldUpdates: true,
		initialValue: { avatar: 'Small' },
		artifact: {
			kind: 'HoudiniFragment',
			name: 'Avatar',
			hash: '',
			raw: '',
			rootType: 'User',
			pluginData: {},
			stripVariables: [],
			selection,
			input: { fields: { size: 'Int', at: 'Date' }, types: {}, defaults: {} },
		},
	})
	await store.send({ setup: true, variables, stuff: { parentID: 'User:1' } })
	expect(store.state.variables).toEqual(variables)
	let stop = store.subscribe(() => {})
	await store.send({ setup: true, variables: store.state.variables })
	expect(store.state.data).toEqual({ avatar: 'Small' })
	write('Updated')
	expect(store.state.data).toEqual({ avatar: 'Updated' })
	expect(store.state.variables).toEqual(variables)
	write('Other size', 128)
	expect(store.state.data).toEqual({ avatar: 'Updated' })
	stop()
	write('While away')
	stop = store.subscribe(() => {})
	await store.send({ setup: true, variables: store.state.variables })
	expect(store.state.data).toEqual({ avatar: 'While away' })
	expect(store.state.variables).toEqual(variables)
	write('Listening')
	expect(store.state.data).toEqual({ avatar: 'Listening' })
	stop()
})
