package typescript

import (
	"fmt"

	"code.houdinigraphql.com/packages/houdini-core/plugin/documents/collected"
)

// Result selections get names based on response paths. GraphQL names cannot
// contain $, so aliases, union arms and loading variants have separate paths.
// Contexts without an alias collector keep their existing inline formatting.
func (ctx *DocumentContext) nestedType(name string, indent int) (*DocumentContext, int) {
	if ctx.aliases == nil {
		return ctx, indent
	}
	child := *ctx
	child.typeName += "$" + name
	return &child, 0
}

func (ctx *DocumentContext) referenceType(body string) string {
	if ctx.aliases == nil {
		return body
	}
	*ctx.aliases = append(*ctx.aliases, fmt.Sprintf("export type %s = %s;", ctx.typeName, body))
	return ctx.typeName
}

func generateNestedSelectionType(
	ctx *DocumentContext,
	selection *collected.Selection,
	readonly bool,
	indent int,
	docs *collected.Documents,
	unmasked bool,
) (string, error) {
	name := selection.FieldName
	if selection.Alias != nil {
		name = *selection.Alias
	}
	child, indent := ctx.nestedType(name, indent)
	for _, field := range selection.Children {
		if field.Kind == "inline_fragment" {
			return child.referenceType(generateInterfaceUnionType(child, selection, readonly, docs, unmasked, indent)), nil
		}
	}
	body, err := generateSelectionType(child, selection.Children, readonly, indent, selection.FieldType, docs, unmasked)
	if err != nil {
		return "", err
	}
	return child.referenceType(body), nil
}

func generateNestedLoadingType(
	ctx *DocumentContext,
	selection *collected.Selection,
	indent int,
	forceLoading bool,
	docs *collected.Documents,
) (string, error) {
	name := selection.FieldName
	if selection.Alias != nil {
		name = *selection.Alias
	}
	child, indent := ctx.nestedType(name, indent)
	body, err := generateLoadingStateType(child, selection.Children, indent, selection.FieldType, forceLoading, docs)
	if err != nil {
		return "", err
	}
	return child.referenceType(body), nil
}
