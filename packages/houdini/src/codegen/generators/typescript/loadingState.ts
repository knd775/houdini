import { StatementKind, TSPropertySignatureKind, TSTypeKind } from 'ast-types/lib/gen/kinds'
import * as graphql from 'graphql'
import * as recast from 'recast'

import { Config, DocumentArtifact, ensureImports, SubscriptionSelection } from '../../../lib'
import { getFieldsForType } from '../../../runtime/lib/selection'
import { readonlyProperty } from './types'

const AST = recast.types.builders

// so the general approach to adding the loading state is to add the base type to a union
// with the type that describes the loading state. this makes it easy for the user to build
// loading UIs by just looking at a single value. If any value is LoadingValue then typescript
// will be able to infer the rest of the loading fields

export function withLoadingState(args: {
	config: Config
	artifact: DocumentArtifact
	base: TSTypeKind
	body: StatementKind[]
}): TSTypeKind {
	// if the artifact does not have a loading state then we don't need to do anything
	if (!('enableLoadingState' in args.artifact) || !args.artifact.enableLoadingState) {
		return args.base
	}

	// we have a loading state so our final type is a union of the base type and the loading state
	return AST.tsUnionType([
		args.base,
		loadingState({
			parentType: args.artifact.rootType,
			config: args.config,
			selection: args.artifact.selection,
			body: args.body,
		}),
	])
}

// the generated loading state is a concrete, non-null object
// that has all of the fields marked with the loadingDirective
function loadingState(args: {
	config: Config
	selection: SubscriptionSelection
	parentType: string
	body: StatementKind[]
}): TSTypeKind {
	// we need to figure out the selection for the type
	const selection = getFieldsForType(args.selection, args.parentType, true)

	// we now need to convert the selection into an object with the appropriate field
	return AST.tsTypeLiteral(
		Object.entries(selection).reduce<TSPropertySignatureKind[]>((rest, [key, value]) => {
			// if the value does not have a loading configuration, skip it
			if (!value.loading) {
				return rest
			}

			// make sure we've imported the loading value from the runtime
			ensureImports({
				config: args.config,
				body: args.body,
				import: ['LoadingType'],
				sourceModule: '$houdini/runtime/lib/types',
			})

			// the type for this key depends on its loading state
			let keyType: TSTypeKind | null = null
			if (value.loading.kind === 'value') {
				keyType = AST.tsTypeReference(AST.identifier('LoadingType'))
			}
			// if we have to continue down, then that's the value we'll use
			if (value.loading.kind === 'continue' && value.selection) {
				keyType = loadingState({
					config: args.config,
					selection: value.selection,
					parentType: value.type,
					body: args.body,
				})
			}

			// if we couldn't identify the fields type by now, skip it
			if (!keyType) {
				return rest
			}

			const fieldType = args.config.schema.getType(args.parentType)
			if (graphql.isNamedType(fieldType)) {
				console.log({ fieldType })
			}

			return [
				...rest,
				readonlyProperty(
					AST.tsPropertySignature(AST.identifier(key), AST.tsTypeAnnotation(keyType))
				),
			]
		}, [])
	)
}
