import { buildSchema } from 'graphql'
import { expect, test, vi } from 'vitest'
import { Config } from './config.js'
import { create_schema, write_config } from './database.js'
import { openDb } from './db.js'

vi.unmock('node:sqlite')

test('field reactivity defaults off and persists changes through config rewrites', async () => {
	const db = await openDb(':memory:')
	try {
		db.exec(create_schema)
		const config = new Config({
			config_file: {},
			plugins: [],
			root_dir: '/project',
			filepath: '/project/houdini.config.js',
			schema: buildSchema('type Query { hello: String }'),
		})
		for (const enabled of [undefined, true, false]) {
			config.config_file.experimentalFieldReactivity = enabled
			await write_config(db, config, async () => ({}), [], 'development')
			expect(db.get('SELECT experimental_field_reactivity FROM config')).toEqual({
				experimental_field_reactivity: enabled ? 1 : 0,
			})
		}
	} finally {
		db.close()
	}
})
