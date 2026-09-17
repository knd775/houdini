import type { QueryStore } from '../runtime/stores/query.js'

declare const query: QueryStore<
	{ users: { id: string; name: string; date: Date }[] },
	{ page: number }
>
const result = query
const name: string | undefined = result.data?.users[0].name
const page: number | undefined = result.variables?.page
const date: Date | undefined = result.data?.users[0].date
const fetching: boolean = result.fetching
// @ts-expect-error Results are readonly
result.fetching = true
// @ts-expect-error Nested arrays are readonly
result.data?.users.push({ id: 'a', name: 'A', date: new Date() })
if (result.data) {
	// @ts-expect-error Nested records are readonly
	result.data.users[0].name = 'Changed'
}

// The public fragment helper exposes readonly payload fields directly.
import { fragment, FragmentStore, mutable } from '../runtime/index.js'
declare const reference: { ' $fragments': { UserFields: {} } }
declare const fragmentStore: FragmentStore<{ name: string; nested: { n: number } }, {}>
const row = fragment(reference, fragmentStore)
const fragmentName: string = row.data.name
// @ts-expect-error Fragment data is readonly too
row.data.nested.n = 2
void [name, page, date, fetching, fragmentName]

// Opaque scalar classes must retain their nominal types when read from queries
// and fragments, including private, protected and ECMAScript private members.
class Money {
	private cents = 100
	amount() {
		return this.cents
	}
}
class Token {
	#value = 'token'
	value() {
		return this.#value
	}
}
class Identifier {
	protected id = 'id'
	value() {
		return this.id
	}
}
// Generated runtimes register their configured scalar outputs this way.
declare module 'houdini/runtime/types' {
	interface CacheTypeDef {
		scalars: Date | Money | Token | Identifier
	}
}
declare const scalars: QueryStore<{ money: Money; tokens: Token[]; id: Identifier | null }, {}>
const money: Money | undefined = scalars.data?.money
const token: Token | undefined = scalars.data?.tokens[0]
const id: Identifier | null | undefined = scalars.data?.id
declare const scalarFragment: FragmentStore<{ money: Money }, {}>
const fragmentMoney: Money = fragment(reference, scalarFragment).data.money
if (scalars.data) {
	// @ts-expect-error Scalar fields remain readonly on their enclosing record
	scalars.data.money = new Money()
	// @ts-expect-error Lists of scalar instances remain readonly
	scalars.data.tokens.push(new Token())
}
void [money, token, id, fragmentMoney]

// Generated query/fragment results use readonly lists in experimental mode.
type Users$result = { readonly users: ReadonlyArray<{ readonly name: string; readonly tags: ReadonlyArray<string> }> }
declare const generated: QueryStore<Users$result, {}>
if (generated.data) {
	const result: Users$result = generated.data
	const copy: Users$result['users'][number][] = mutable(result.users)
	copy.sort((a, b) => a.name.localeCompare(b.name))
	// @ts-expect-error Copying the array does not make its items mutable.
	copy[0].tags.push('new')
}
