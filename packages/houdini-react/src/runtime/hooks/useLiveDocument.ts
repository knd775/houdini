import type { DocumentArtifact, DocumentStore, QueryResult } from '$houdini/lib/types'
import { GraphQLObject } from 'houdini'
import * as React from 'react'

import { useHoudiniClient } from './useHoudiniClient'

export function useLiveDocument<
	_Data extends GraphQLObject = GraphQLObject,
	_Input extends {} = {}
>(
	artifact: DocumentArtifact,
	variables?: _Input
): [QueryResult<_Data, _Input>, DocumentStore<_Data, _Input>] {
	const client = useHoudiniClient()

	// hold onto an observer we'll use
	const { current: observer } = React.useRef(client.observe<_Data, _Input>({ artifact }))

	// get a safe reference to the cache
	const storeValue = React.useSyncExternalStore(
		observer.subscribe.bind(observer),
		() => observer.state
	)

	// whenever the variables change, we need to retrigger the query
	React.useEffect(() => {
		observer.send({ variables })
	}, [variables])

	return [storeValue, observer]
}