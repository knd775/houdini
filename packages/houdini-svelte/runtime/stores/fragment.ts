import type {
	FragmentArtifact,
	GraphQLObject,
	GraphQLVariables,
	HoudiniFetchContext,
} from 'houdini/runtime'
import { CompiledFragmentKind, fragmentKey, marshalInputs } from 'houdini/runtime'
import { derived, readable } from 'svelte/store'
import cache from '$houdini/runtime/cache'
import { getCurrentConfig } from '$houdini/runtime/config'

import { isBrowser } from '../adapter.js'
import type { FragmentStoreInstance } from '../types.js'
import { BaseStore, fieldUpdates, withFragmentData, withFragmentList } from './mode.js'

// a fragment store exists in multiple places in a given application so we
// can't just return a store directly, the user has to load the version of the
// fragment store for the object the store has been mixed into
export class FragmentStore<
	_Data extends GraphQLObject,
	_ReferenceType extends {},
	_Input extends GraphQLVariables = GraphQLVariables,
	// generated stores narrow this to their document's artifact type so a store
	// can be matched back to its data/input types (e.g. by record.read/write)
	_Artifact extends FragmentArtifact = FragmentArtifact,
> {
	artifact: _Artifact
	name: string
	kind = CompiledFragmentKind

	protected context: HoudiniFetchContext | null = null

	constructor({ artifact, storeName }: { artifact: _Artifact; storeName: string }) {
		this.artifact = artifact
		this.name = storeName
	}

	// @plural fragments are spread on a list field, so they are read as a list of
	// references and produce a store whose value is the array of data.
	get(
		initialValue: ReadonlyArray<_Data | { [fragmentKey]: _ReferenceType }> | null
	): FragmentStoreInstance<_Data[] | null, _Input> & { initialValue: _Data[] | null }
	get(
		initialValue: _Data | { [fragmentKey]: _ReferenceType } | null
	): FragmentStoreInstance<_Data | null, _Input> & { initialValue: _Data | null }
	get(
		initialValue:
			| _Data
			| { [fragmentKey]: _ReferenceType }
			| ReadonlyArray<_Data | { [fragmentKey]: _ReferenceType }>
			| null
	): any {
		if (this.artifact.plural || Array.isArray(initialValue)) {
			// a non-plural fragment given a list of references is a mistake
			if (!this.artifact.plural) {
				throw new Error(
					`fragment "${this.artifact.name}" was given a list of references but is not marked @plural.`
				)
			}
			return this.#getPlural(
				(Array.isArray(initialValue) ? initialValue : []) as Array<
					_Data | { [fragmentKey]: _ReferenceType }
				>
			)
		}

		// the array case returned above, so this is a single reference
		return this.#getOne(initialValue as _Data | { [fragmentKey]: _ReferenceType } | null)
	}

	// getPlural reads one instance per reference and combines them into a single store
	// holding the array of data.
	#getPlural(
		references: Array<_Data | { [fragmentKey]: _ReferenceType }>
	): FragmentStoreInstance<_Data[] | null, _Input> & { initialValue: _Data[] | null } {
		// derived() requires at least one input store; short-circuit the empty case
		if (references.length === 0) {
			const empty = readable<_Data[]>([])
			return withFragmentList(
				{
					initialValue: [],
					variables: {} as _Input,
					kind: CompiledFragmentKind,
					subscribe: empty.subscribe,
				},
				[]
			)
		}

		const instances = references.map((reference) => this.#getOne(reference))
		const combined = derived(instances, ($values) => $values as _Data[])
		return withFragmentList(
			{
				initialValue: instances.map((instance) => instance.initialValue) as _Data[],
				variables: instances[0].variables,
				kind: CompiledFragmentKind,
				subscribe: combined.subscribe,
			},
			instances
		) as FragmentStoreInstance<_Data[] | null, _Input> & { initialValue: _Data[] | null }
	}

	#getOne(
		initialValue: _Data | { [fragmentKey]: _ReferenceType } | null
	): FragmentStoreInstance<_Data | null, _Input> & { initialValue: _Data | null } {
		const { variables, parent } =
			// @ts-expect-error: typescript can't guarantee that the fragment key is defined
			// but if its not, then the fragment wasn't mixed into the right thing
			// the variables for the fragment live on the initial value's $fragment key
			initialValue?.[fragmentKey]?.values?.[this.artifact.name] ?? {}
		// @ts-expect-error: see above.
		const { loading } = initialValue?.[fragmentKey] ?? {}
		if (
			!loading &&
			initialValue &&
			fragmentKey in initialValue &&
			(!variables || !parent) &&
			isBrowser
		) {
			console.warn(
				`! Parent does not contain the information for this fragment. Something is wrong.
Please ensure that you have passed a record that has ${this.artifact.name} mixed into it.`
			)
		}

		// if we got this far then we are safe to use the fields on the object
		let data = initialValue as _Data | null

		// on the client, we want to ensure that we apply masking to the initial value by
		// loading the value from cache
		if (loading || (initialValue && parent && isBrowser)) {
			data = cache.read({
				fieldUpdates,
				selection: this.artifact.selection,
				parent,
				variables,
				loading,
			}).data as _Data
			if (!loading && isBrowser) {
				const storage = cache._internal_unstable.storage
				const typename = this.artifact.selection.fields?.__typename
				// Generated concrete fragments also select a non-null root typename.
				// Its absence nulls the read even when the record was keyed correctly.
				const missingRequiredTypename =
					data === null &&
					typename?.visible &&
					!typename.nullable &&
					!typename.directives?.length
				if (
					(this.artifact.selection.abstractFields || missingRequiredTypename) &&
					!storage.getTypename(parent)
				) {
					console.warn(
						`Fragment "${this.artifact.name}" could not read all its selected fields because ` +
							`cache record "${parent}" has no __typename. ` +
							'Include __typename in the parent response on the object where this fragment is spread.'
					)
				} else if (data === null) {
					// Cached null fields, skipped fields, and incomplete selections on
					// an existing record are valid reads. Only diagnose an absent record.
					const ids = [parent, storage.idMaps[parent]].filter(Boolean)
					const exists = storage.data.some((layer) =>
						ids.some((id) => layer.fields[id] || layer.links[id])
					)
					if (!exists) {
						console.warn(
							`Fragment "${this.artifact.name}" could not read cache record "${parent}". ` +
								'Check that the parent response includes the selected __typename and key fields, ' +
								'and that this reference has not been evicted or deleted.'
						)
					}
				}
			}
		}

		// build up a document store that we will use to subscribe the fragment to cache updates
		const store = new BaseStore<_Data, _Input>({
			artifact: this.artifact,
			initialValue: data,
		})
		if (!loading && parent) {
			store.observer.send({ variables, setup: true, stuff: { parentID: parent } })
		}

		return withFragmentData(
			{
				initialValue: data,
				variables: marshalInputs({
					artifact: this.artifact,
					input: variables,
					config: getCurrentConfig(),
					rootType: this.artifact.rootType,
				}) as _Input,
				kind: CompiledFragmentKind,
				subscribe: derived([store], ([$store]) => $store.data).subscribe,
			},
			store
		)
	}
}
