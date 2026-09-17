package typescript_test

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"testing"

	"code.houdinigraphql.com/packages/houdini-core/config"
	"code.houdinigraphql.com/packages/houdini-core/plugin"
	"code.houdinigraphql.com/plugins"
	"code.houdinigraphql.com/plugins/tests"
	"github.com/spf13/afero"
	"github.com/stretchr/testify/require"
)

func TestReadonlyResults(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		t.Run(fmt.Sprintf("enabled=%v", enabled), func(t *testing.T) {
			tests.RunTable(t, tests.Table[config.PluginConfig, *plugin.HoudiniCore]{
				Schema: `
					type Query { users(names: [String!]!, limit: Int, offset: Int): [User!]! matrix: [[String]] nodes: [Node!]! }
					type Mutation { update(names: [String!]!): [User!]! }
					type Subscription { updates: [User!]! }
					interface Node { id: ID! }
					type User implements Node { id: ID! tags: [String!]! friends: [User] }
					type Bot implements Node { id: ID! tags: [String!]! friends: [User] }
				`,
				PerformTest: performTypescriptTest(func(t *testing.T, p *plugin.HoudiniCore, _ tests.Test[config.PluginConfig]) {
					cfg, err := p.DB.ProjectConfig(context.Background())
					require.NoError(t, err)
					for _, name := range []string{"Users", "UserFields", "LoadingUsers", "LoadingFields", "PagedUsers", "UpdateUsers", "Updates"} {
						content, err := afero.ReadFile(p.Fs, cfg.ArtifactTypePath(name))
						require.NoError(t, err)
						output := string(content)
						// Aliases are useful in both modes and must never shadow one another.
						declared := map[string]bool{}
						for _, match := range regexp.MustCompile(`export type (\S+) =`).FindAllStringSubmatch(output, -1) {
							require.False(t, declared[match[1]], "duplicate type %s", match[1])
							declared[match[1]] = true
						}
						if name == "Users" {
							for _, suffix := range []string{"$users", "$users$friends", "$nodes$$on$User$friends", "$nodes$$on$Bot$friends"} {
								require.True(t, declared["Users$result"+suffix], suffix)
							}
						}
						if name == "LoadingUsers" {
							require.True(t, declared["LoadingUsers$result$$loading$users$friends"])
						}
						if !enabled || name == "UpdateUsers" || name == "Updates" {
							require.NotContains(t, output, "ReadonlyArray<", name)
							continue
						}
						resultName := name + "$result"
						if strings.HasSuffix(name, "Fields") {
							resultName = name + "$data"
						}
						end := "export type " + name + "$input ="
						if strings.HasSuffix(name, "Fields") {
							end = "export type " + name + "$artifact"
						}
						result := strings.Split(strings.Split(output, "export type "+resultName+" =")[1], end)[0]
						require.Contains(t, result, "readonly tags: ReadonlyArray<string>", name)
						require.NotContains(t, result, "[]", name)
						if name == "Users" {
							require.Contains(t, result, "readonly matrix: ReadonlyArray<ReadonlyArray<string | null> | null> | null")
							require.Contains(t, output, "names: (string)[];") // inputs stay mutable
							unmasked := strings.Split(output, "export type Users$unmasked =")[1]
							require.NotContains(t, unmasked, "ReadonlyArray<")
						}
						if strings.HasPrefix(name, "Loading") {
							require.Contains(t, result, "readonly tags: ReadonlyArray<LoadingType>")
						}
					}
				}),
				Tests: []tests.Test[config.PluginConfig]{{
					Name:          "one flag controls query and fragment lists only",
					Pass:          true,
					ProjectConfig: func(cfg *plugins.ProjectConfig) { cfg.ExperimentalFieldReactivity = enabled },
					Input: []string{
						`query Users($names: [String!]!) { users(names: $names) { tags friends { tags } } matrix nodes { ... on User { friends { tags } } ... on Bot { friends { tags } } } }`,
						`fragment UserFields on User { tags friends { tags } }`,
						`query LoadingUsers @loading { users(names: []) { tags friends { tags } } }`,
						`fragment LoadingFields on User @loading { tags friends { tags } }`,
						`query PagedUsers($names: [String!]!) { users(names: $names, limit: 10) @paginate { tags friends { tags } } }`,
						`mutation UpdateUsers($names: [String!]!) { update(names: $names) { tags friends { tags } } }`,
						`subscription Updates { updates { tags friends { tags } } }`,
					},
				}},
			})
		})
	}
}
