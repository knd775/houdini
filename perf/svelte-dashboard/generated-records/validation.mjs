import { generatedRecordPlugin } from './plugin.mjs'
import { dashboardSelection, peopleSelection, activitySelection } from '../selections.js'

// Shapes used by the existing ownership, reconciliation and browser regressions.
// Production generation would obtain these from each application's artifacts.
const shapes = [
	['rows', 'dates'], ['n'], ['id', 'v'], ['list'], ['id', 'n'],
	['id', 'name'], ['name'], ['label'], ['name', 'label'], ['label', 'joined'],
	['users'], ['name', 'email'], ['viewer', 'missing'], ['viewer'],
	['visible', 'hidden'], ['date'], ['id', 'money', 'n'], ['list', 'date'],
	['__proto__'], ['value'], ['a'], ['x'], ['constructor', 'toString', '__proto__'],
].map(names => ({ fields: Object.fromEntries(names.map(name =>
	[name, { visible: true, type: 'String', keyRaw: name }])) }))

export function validationPlugin() {
	return generatedRecordPlugin([dashboardSelection, peopleSelection, activitySelection, ...shapes])
}
