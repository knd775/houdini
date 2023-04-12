import type { Config, Document } from 'houdini'

export async function generate_manifest(
	args: {
		config: Config
		documents: Record<string, Document>
	},
	result: Manifest = {}
) {
	return {}
}

// The manifest is a tree of routes that the router will use to render
// the correct component tree for a given url
export type Manifest = {}
