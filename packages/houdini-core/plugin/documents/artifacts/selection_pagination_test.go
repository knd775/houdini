package artifacts_test

import (
	"testing"

	"code.houdinigraphql.com/packages/houdini-core/config"
	"code.houdinigraphql.com/packages/houdini-core/plugin"
	"code.houdinigraphql.com/plugins/tests"
)

func TestPaginationArtifacts(t *testing.T) {
	tests.RunTable(t, tests.Table[config.PluginConfig, *plugin.HoudiniCore]{
		Schema: `
      scalar Cursor

      type Query {
        users: [User!]!
        user: User!
				entitiesByCursor(first: Int, after: String, last: Int, before: String): EntityConnection!
        species(id: Int!): Species
      }

      type Species {
        id: Int!
        name: String!
        moves(first: Int, after: String): SpeciesMoveConnection!
      }

      type SpeciesMoveConnection {
        edges: [SpeciesMoveEdge!]!
        pageInfo: PageInfo!
      }

      type SpeciesMoveEdge {
        node: SpeciesMove
        cursor: String!
      }

      type SpeciesMove {
        id: Int!
        name: String!
      }

      type User implements  Node {
        id: ID!
        name: String!
        firstName: String!
        friendsByCursor(
          first: Int,
          last: Int,
          before: String,
          after: String,
          filter: String
        ): UserConnection
        friendsByOffset(limit: Int, offset: Int, filter: String): [User!]!
				friendsByCursorScalar(first: Int, after: Cursor, last: Int, before: Cursor, filter: String): UserConnection!
      }

      type UserConnection {
        edges: [UserEdge!]!
        pageInfo: PageInfo!
      }

      type PageInfo {
        hasNextPage: Boolean!
        hasPreviousPage: Boolean!
        startCursor: String
        endCursor: String
      }

      type UserEdge {
        node: User
        cursor: String!
      }

      interface Node {
        id: ID!
      }

			type Ghost {
				name: String!
				aka: String!
				believers: [User!]!
				friends: [Ghost!]!
				cats: [Cat!]!
			}

			type Cat {
				id: ID!
				"""
				The name of the cat
				"""
				name: String!
				owner: User!
			}

			type EntityEdge {
				cursor: String!
				node: Entity
			}

			type EntityConnection {
				pageInfo: PageInfo!
				edges: [EntityEdge!]!
			}

			union Entity = User | Cat | Ghost
    `,
		PerformTest: performArtifactTest,
		Tests: []tests.Test[config.PluginConfig]{
			{
				Name: "pagination arguments stripped from key",
				Input: []string{
					`
             fragment PaginatedFragment on User {
                friendsByCursor(first:10, filter: "hello") @paginate {
                    edges {
                        node {
                            id
                        }
                    }
                }
             }
          `,
				},
				Pass: true,
				Extra: map[string]any{
					"PaginatedFragment": tests.Dedent(`const artifact = {
    "name": "PaginatedFragment",
    "kind": "HoudiniFragment",
    "hash": "75c244fe159df1685c5d0b36a0a64e28c3bc8a26ae858c5394c1552977329f97",

    "refetch": {
        "path": ["friendsByCursor"],
        "method": "cursor",
        "pageSize": 10,
        "embedded": true,
        "targetType": "User",
        "paginated": true,
        "direction": "both",
        "mode": "Infinite"
    },

    "raw": ` + "`" + `fragment PaginatedFragment on User {
    friendsByCursor(first: 10, filter: "hello") {
        edges {
            node {
                id
                __typename
            }
            __typename
            cursor
        }
        __typename
        pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
        }
    }
    __typename
    id
}
` + "`" + `,

    "rootType": "User",
    "stripVariables": [] as Array<string>,

    "selection": {
        "fields": {
            "friendsByCursor": {
                "type": "UserConnection",
                "keyRaw": "friendsByCursor(filter: \"hello\")::paginated",
                "nullable": true,

                "directives": [{
                    "name": "paginate",
                    "arguments": {}
                }],


                "selection": {
                    "fields": {
                        "edges": {
                            "type": "UserEdge",
                            "keyRaw": "edges",
                            "updates": ["append", "prepend"],

                            "selection": {
                                "fields": {
                                    "node": {
                                        "type": "User",
                                        "keyRaw": "node",
                                        "nullable": true,

                                        "selection": {
                                            "fields": {
                                                "id": {
                                                    "type": "ID",
                                                    "keyRaw": "id",
                                                    "visible": true,
                                                },

                                                "__typename": {
                                                    "type": "String",
                                                    "keyRaw": "__typename",
                                                },
                                            },
                                        },

                                        "visible": true,
                                    },

                                    "__typename": {
                                        "type": "String",
                                        "keyRaw": "__typename",
                                    },

                                    "cursor": {
                                        "type": "String",
                                        "keyRaw": "cursor",
                                        "visible": true,
                                    },
                                },
                            },

                            "visible": true,
                        },

                        "__typename": {
                            "type": "String",
                            "keyRaw": "__typename",
                        },

                        "pageInfo": {
                            "type": "PageInfo",
                            "keyRaw": "pageInfo",

                            "selection": {
                                "fields": {
                                    "hasNextPage": {
                                        "type": "Boolean",
                                        "keyRaw": "hasNextPage",
                                        "updates": ["append"],
                                        "visible": true,
                                    },

                                    "hasPreviousPage": {
                                        "type": "Boolean",
                                        "keyRaw": "hasPreviousPage",
                                        "updates": ["prepend"],
                                        "visible": true,
                                    },

                                    "startCursor": {
                                        "type": "String",
                                        "keyRaw": "startCursor",
                                        "updates": ["prepend"],
                                        "nullable": true,
                                        "visible": true,
                                    },

                                    "endCursor": {
                                        "type": "String",
                                        "keyRaw": "endCursor",
                                        "updates": ["append"],
                                        "nullable": true,
                                        "visible": true,
                                    },
                                },
                            },

                            "visible": true,
                        },
                    },
                },

                "visible": true,
            },

            "__typename": {
                "type": "String",
                "keyRaw": "__typename",
                "visible": true,
            },

            "id": {
                "type": "ID",
                "keyRaw": "id",
                "visible": true,
            },
        },
    },

    "pluginData": {},
} as const

export default artifact

export type PaginatedFragment$input = never;

export type PaginatedFragment = {
	readonly "shape"?: PaginatedFragment$data;
	readonly " $fragments": {
		"PaginatedFragment": { readonly "expected a PaginatedFragment fragment spread"?: never };
	};
};

export type PaginatedFragment$data = {
	readonly friendsByCursor: {
		readonly edges: ({
			readonly node: {
				readonly id: string;
			} | null;
			readonly cursor: string;
		})[];
		readonly pageInfo: {
			readonly hasNextPage: boolean;
			readonly hasPreviousPage: boolean;
			readonly startCursor: string | null;
			readonly endCursor: string | null;
		};
	} | null;
};

export type PaginatedFragment$artifact = typeof artifact

"HoudiniHash=75c244fe159df1685c5d0b36a0a64e28c3bc8a26ae858c5394c1552977329f97"`),
				},
			},
			{
				Name: "pagination arguments included in key for SinglePage Mode (per-cursor keys, no ::paginated)",
				Input: []string{
					`
             fragment PaginatedFragment on User {
                friendsByCursor(first:10, filter: "hello") @paginate(mode: SinglePage) {
                    edges {
                        node {
                            id
                        }
                    }
                }
             }
          `,
				},
				Pass: true,
				Extra: map[string]any{
					"PaginatedFragment": tests.Dedent(`const artifact = {
    "name": "PaginatedFragment",
    "kind": "HoudiniFragment",
    "hash": "75c244fe159df1685c5d0b36a0a64e28c3bc8a26ae858c5394c1552977329f97",

    "refetch": {
        "path": ["friendsByCursor"],
        "method": "cursor",
        "pageSize": 10,
        "embedded": true,
        "targetType": "User",
        "paginated": true,
        "direction": "both",
        "mode": "SinglePage"
    },

    "raw": ` + "`" + `fragment PaginatedFragment on User {
    friendsByCursor(first: 10, filter: "hello") {
        edges {
            node {
                id
                __typename
            }
            __typename
            cursor
        }
        __typename
        pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
        }
    }
    __typename
    id
}
` + "`" + `,

    "rootType": "User",
    "stripVariables": [] as Array<string>,

    "selection": {
        "fields": {
            "friendsByCursor": {
                "type": "UserConnection",
                "keyRaw": "friendsByCursor(first: 10, after: null, last: null, before: null, filter: \"hello\")",
                "nullable": true,

                "directives": [{
                    "name": "paginate",
                    "arguments": {
                        "mode": {
                            "kind": "EnumValue",
                            "value": "SinglePage"
                        }
                    }
                }],


                "selection": {
                    "fields": {
                        "edges": {
                            "type": "UserEdge",
                            "keyRaw": "edges",

                            "selection": {
                                "fields": {
                                    "node": {
                                        "type": "User",
                                        "keyRaw": "node",
                                        "nullable": true,

                                        "selection": {
                                            "fields": {
                                                "id": {
                                                    "type": "ID",
                                                    "keyRaw": "id",
                                                    "visible": true,
                                                },

                                                "__typename": {
                                                    "type": "String",
                                                    "keyRaw": "__typename",
                                                },
                                            },
                                        },

                                        "visible": true,
                                    },

                                    "__typename": {
                                        "type": "String",
                                        "keyRaw": "__typename",
                                    },

                                    "cursor": {
                                        "type": "String",
                                        "keyRaw": "cursor",
                                        "visible": true,
                                    },
                                },
                            },

                            "visible": true,
                        },

                        "__typename": {
                            "type": "String",
                            "keyRaw": "__typename",
                        },

                        "pageInfo": {
                            "type": "PageInfo",
                            "keyRaw": "pageInfo",

                            "selection": {
                                "fields": {
                                    "hasNextPage": {
                                        "type": "Boolean",
                                        "keyRaw": "hasNextPage",
                                        "visible": true,
                                    },

                                    "hasPreviousPage": {
                                        "type": "Boolean",
                                        "keyRaw": "hasPreviousPage",
                                        "visible": true,
                                    },

                                    "startCursor": {
                                        "type": "String",
                                        "keyRaw": "startCursor",
                                        "nullable": true,
                                        "visible": true,
                                    },

                                    "endCursor": {
                                        "type": "String",
                                        "keyRaw": "endCursor",
                                        "nullable": true,
                                        "visible": true,
                                    },
                                },
                            },

                            "visible": true,
                        },
                    },
                },

                "visible": true,
            },

            "__typename": {
                "type": "String",
                "keyRaw": "__typename",
                "visible": true,
            },

            "id": {
                "type": "ID",
                "keyRaw": "id",
                "visible": true,
            },
        },
    },

    "pluginData": {},
} as const

export default artifact

export type PaginatedFragment$input = never;

export type PaginatedFragment = {
	readonly "shape"?: PaginatedFragment$data;
	readonly " $fragments": {
		"PaginatedFragment": { readonly "expected a PaginatedFragment fragment spread"?: never };
	};
};

export type PaginatedFragment$data = {
	readonly friendsByCursor: {
		readonly edges: ({
			readonly node: {
				readonly id: string;
			} | null;
			readonly cursor: string;
		})[];
		readonly pageInfo: {
			readonly hasNextPage: boolean;
			readonly hasPreviousPage: boolean;
			readonly startCursor: string | null;
			readonly endCursor: string | null;
		};
	} | null;
};

export type PaginatedFragment$artifact = typeof artifact

"HoudiniHash=75c244fe159df1685c5d0b36a0a64e28c3bc8a26ae858c5394c1552977329f97"`),
				},
			},
			{
				Name: "offset based pagination marks appropriate field",
				Input: []string{
					`
            fragment PaginatedFragment on User {
                friendsByOffset(limit:10, filter: "hello") @paginate {
					        id
                }
            }
          `,
				},
				Pass: true,
				Extra: map[string]any{
					"PaginatedFragment": tests.Dedent(`const artifact = {
    "name": "PaginatedFragment",
    "kind": "HoudiniFragment",
    "hash": "1597445f56596d6d12bcb090d3455b4cef0fd38128e7312bc313e9c5e0685294",

    "refetch": {
        "path": ["friendsByOffset"],
        "method": "offset",
        "pageSize": 10,
        "embedded": true,
        "targetType": "User",
        "paginated": true,
        "direction": "forward",
        "mode": "Infinite"
    },

    "raw": ` + "`" + `fragment PaginatedFragment on User {
    friendsByOffset(limit: 10, filter: "hello") {
        id
        __typename
    }
    __typename
    id
}
` + "`" + `,

    "rootType": "User",
    "stripVariables": [] as Array<string>,

    "selection": {
        "fields": {
            "friendsByOffset": {
                "type": "User",
                "keyRaw": "friendsByOffset(filter: \"hello\")::paginated",
                "updates": ["append"],

                "directives": [{
                    "name": "paginate",
                    "arguments": {}
                }],


                "selection": {
                    "fields": {
                        "id": {
                            "type": "ID",
                            "keyRaw": "id",
                            "visible": true,
                        },

                        "__typename": {
                            "type": "String",
                            "keyRaw": "__typename",
                        },
                    },
                },

                "visible": true,
            },

            "__typename": {
                "type": "String",
                "keyRaw": "__typename",
                "visible": true,
            },

            "id": {
                "type": "ID",
                "keyRaw": "id",
                "visible": true,
            },
        },
    },

    "pluginData": {},
} as const

export default artifact

export type PaginatedFragment$input = never;

export type PaginatedFragment = {
	readonly "shape"?: PaginatedFragment$data;
	readonly " $fragments": {
		"PaginatedFragment": { readonly "expected a PaginatedFragment fragment spread"?: never };
	};
};

export type PaginatedFragment$data = {
	readonly friendsByOffset: ({
		readonly id: string;
	})[];
};

export type PaginatedFragment$artifact = typeof artifact

"HoudiniHash=1597445f56596d6d12bcb090d3455b4cef0fd38128e7312bc313e9c5e0685294"`),
				},
			},
			{
				Name: "cursor as scalar gets the right pagination query argument types",
				Input: []string{
					`
            query ScalarPagination {
              user {
                friendsByCursorScalar(first:10, filter: "hello") @paginate {
                  edges {
                    node {
                      friendsByCursor {
                        edges {
                          node {
                            id
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          `,
				},
				Pass: true,
				Extra: map[string]any{
					"ScalarPagination": tests.Dedent(`const artifact = {
    "name": "ScalarPagination",
    "kind": "HoudiniQuery",
    "hash": "e6262d66ee80a4cec14b10ec68a46cae9ad74079f8286b94f77a7b13a0eeab96",

    "refetch": {
        "path": ["user","friendsByCursorScalar"],
        "method": "cursor",
        "pageSize": 10,
        "embedded": false,
        "targetType": "Query",
        "paginated": true,
        "direction": "both",
        "mode": "Infinite"
    },

    "raw": ` + "`" + `query ScalarPagination($after: Cursor, $before: Cursor, $first: Int = 10, $last: Int) {
    user {
        friendsByCursorScalar(filter: "hello", first: $first, after: $after, last: $last, before: $before) {
            edges {
                node {
                    friendsByCursor {
                        edges {
                            node {
                                id
                                __typename
                            }
                            __typename
                        }
                        __typename
                    }
                    __typename
                    id
                }
                __typename
                cursor
            }
            __typename
            pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
            }
        }
        __typename
        id
    }
}
` + "`" + `,

    "rootType": "Query",
    "stripVariables": [] as Array<string>,

    "selection": {
        "fields": {
            "user": {
                "type": "User",
                "keyRaw": "user",

                "selection": {
                    "fields": {
                        "friendsByCursorScalar": {
                            "type": "UserConnection",
                            "keyRaw": "friendsByCursorScalar(filter: \"hello\")::paginated",

                            "directives": [{
                                "name": "paginate",
                                "arguments": {}
                            }],


                            "selection": {
                                "fields": {
                                    "edges": {
                                        "type": "UserEdge",
                                        "keyRaw": "edges",
                                        "updates": ["append", "prepend"],

                                        "selection": {
                                            "fields": {
                                                "node": {
                                                    "type": "User",
                                                    "keyRaw": "node",
                                                    "nullable": true,

                                                    "selection": {
                                                        "fields": {
                                                            "friendsByCursor": {
                                                                "type": "UserConnection",
                                                                "keyRaw": "friendsByCursor",
                                                                "nullable": true,

                                                                "selection": {
                                                                    "fields": {
                                                                        "edges": {
                                                                            "type": "UserEdge",
                                                                            "keyRaw": "edges",

                                                                            "selection": {
                                                                                "fields": {
                                                                                    "node": {
                                                                                        "type": "User",
                                                                                        "keyRaw": "node",
                                                                                        "nullable": true,

                                                                                        "selection": {
                                                                                            "fields": {
                                                                                                "id": {
                                                                                                    "type": "ID",
                                                                                                    "keyRaw": "id",
                                                                                                    "visible": true,
                                                                                                },

                                                                                                "__typename": {
                                                                                                    "type": "String",
                                                                                                    "keyRaw": "__typename",
                                                                                                },
                                                                                            },
                                                                                        },

                                                                                        "visible": true,
                                                                                    },

                                                                                    "__typename": {
                                                                                        "type": "String",
                                                                                        "keyRaw": "__typename",
                                                                                    },
                                                                                },
                                                                            },

                                                                            "visible": true,
                                                                        },

                                                                        "__typename": {
                                                                            "type": "String",
                                                                            "keyRaw": "__typename",
                                                                        },
                                                                    },
                                                                },

                                                                "visible": true,
                                                            },

                                                            "__typename": {
                                                                "type": "String",
                                                                "keyRaw": "__typename",
                                                            },

                                                            "id": {
                                                                "type": "ID",
                                                                "keyRaw": "id",
                                                            },
                                                        },
                                                    },

                                                    "visible": true,
                                                },

                                                "__typename": {
                                                    "type": "String",
                                                    "keyRaw": "__typename",
                                                },

                                                "cursor": {
                                                    "type": "String",
                                                    "keyRaw": "cursor",
                                                    "visible": true,
                                                },
                                            },
                                        },

                                        "visible": true,
                                    },

                                    "__typename": {
                                        "type": "String",
                                        "keyRaw": "__typename",
                                    },

                                    "pageInfo": {
                                        "type": "PageInfo",
                                        "keyRaw": "pageInfo",

                                        "selection": {
                                            "fields": {
                                                "hasNextPage": {
                                                    "type": "Boolean",
                                                    "keyRaw": "hasNextPage",
                                                    "updates": ["append"],
                                                    "visible": true,
                                                },

                                                "hasPreviousPage": {
                                                    "type": "Boolean",
                                                    "keyRaw": "hasPreviousPage",
                                                    "updates": ["prepend"],
                                                    "visible": true,
                                                },

                                                "startCursor": {
                                                    "type": "String",
                                                    "keyRaw": "startCursor",
                                                    "updates": ["prepend"],
                                                    "nullable": true,
                                                    "visible": true,
                                                },

                                                "endCursor": {
                                                    "type": "String",
                                                    "keyRaw": "endCursor",
                                                    "updates": ["append"],
                                                    "nullable": true,
                                                    "visible": true,
                                                },
                                            },
                                        },

                                        "visible": true,
                                    },
                                },
                            },

                            "visible": true,
                        },

                        "__typename": {
                            "type": "String",
                            "keyRaw": "__typename",
                        },

                        "id": {
                            "type": "ID",
                            "keyRaw": "id",
                        },
                    },
                },

                "visible": true,
            },
        },
    },

    "pluginData": {},

    "dedupe": {
        "cancel": "last",
        "match": "Variables"
    },

    "input": {
        "fields": {
            "first": "Int",
            "after": "Cursor",
            "last": "Int",
            "before": "Cursor",
        },

        "types": {},

        "defaults": {
            "first": 10,
        },

        "runtimeScalars": {},
    },

    "policy": "CacheOrNetwork",
    "partial": false
} as const

export default artifact

export type ScalarPagination = {
	readonly "input": ScalarPagination$input;
	readonly "result": ScalarPagination$result | undefined;
};

export type ScalarPagination$result = {
	readonly user: {
		readonly friendsByCursorScalar: {
			readonly edges: ({
				readonly node: {
					readonly friendsByCursor: {
						readonly edges: ({
							readonly node: {
								readonly id: string;
							} | null;
						})[];
					} | null;
				} | null;
				readonly cursor: string;
			})[];
			readonly pageInfo: {
				readonly hasNextPage: boolean;
				readonly hasPreviousPage: boolean;
				readonly startCursor: string | null;
				readonly endCursor: string | null;
			};
		};
	};
};

export type ScalarPagination$input = {
	first?: number | null;
	after?: Cursor | null;
	last?: number | null;
	before?: Cursor | null;
};

export type ScalarPagination$unmasked = {
	readonly user: {
		readonly friendsByCursorScalar: {
			readonly edges: ({
				readonly node: {
					readonly friendsByCursor: {
						readonly edges: ({
							readonly node: {
								readonly id: string;
								readonly __typename: "User";
							} | null;
							readonly __typename: "UserEdge";
						})[];
						readonly __typename: "UserConnection";
					} | null;
					readonly __typename: "User";
					readonly id: string;
				} | null;
				readonly __typename: "UserEdge";
				readonly cursor: string;
			})[];
			readonly __typename: "UserConnection";
			readonly pageInfo: {
				readonly hasNextPage: boolean;
				readonly hasPreviousPage: boolean;
				readonly startCursor: string | null;
				readonly endCursor: string | null;
			};
		};
		readonly __typename: "User";
		readonly id: string;
	};
};

export type ScalarPagination$artifact = typeof artifact

"HoudiniHash=e6262d66ee80a4cec14b10ec68a46cae9ad74079f8286b94f77a7b13a0eeab96"`),
				},
			},
			{
				Name: "sibling aliases don't get marked",
				Input: []string{
					`
              fragment PaginatedFragment on User {
                  friendsByCursor(first:10, filter: "hello") @paginate {
                      edges {
                          node {
                            friendsByCursor {
                              edges {
                                node {
                                  id
                                }
                              }
                            }
                          }
                      }
                  }
                  friends: friendsByCursor(first:10, filter: "hello") {
                      edges {
                          node {
                              friendsByCursor {
                                edges {
                                  node {
                                    id
                                  }
                                }
                              }
                          }
                      }
                  }
              }
          `,
				},
				Pass: true,
				Extra: map[string]any{
					"PaginatedFragment": tests.Dedent(`const artifact = {
    "name": "PaginatedFragment",
    "kind": "HoudiniFragment",
    "hash": "78b80c2614cff7e081e6fe51e406113e0133a05c144e66959fbda996cfac5217",

    "refetch": {
        "path": ["friendsByCursor"],
        "method": "cursor",
        "pageSize": 10,
        "embedded": true,
        "targetType": "User",
        "paginated": true,
        "direction": "both",
        "mode": "Infinite"
    },

    "raw": ` + "`" + `fragment PaginatedFragment on User {
    friendsByCursor(first: 10, filter: "hello") {
        edges {
            node {
                friendsByCursor {
                    edges {
                        node {
                            id
                            __typename
                        }
                        __typename
                    }
                    __typename
                }
                __typename
                id
            }
            __typename
            cursor
        }
        __typename
        pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
        }
    }
    friends: friendsByCursor(first: 10, filter: "hello") {
        edges {
            node {
                friendsByCursor {
                    edges {
                        node {
                            id
                            __typename
                        }
                        __typename
                    }
                    __typename
                }
                __typename
                id
            }
            __typename
        }
        __typename
    }
    __typename
    id
}
` + "`" + `,

    "rootType": "User",
    "stripVariables": [] as Array<string>,

    "selection": {
        "fields": {
            "friendsByCursor": {
                "type": "UserConnection",
                "keyRaw": "friendsByCursor(filter: \"hello\")::paginated",
                "nullable": true,

                "directives": [{
                    "name": "paginate",
                    "arguments": {}
                }],


                "selection": {
                    "fields": {
                        "edges": {
                            "type": "UserEdge",
                            "keyRaw": "edges",
                            "updates": ["append", "prepend"],

                            "selection": {
                                "fields": {
                                    "node": {
                                        "type": "User",
                                        "keyRaw": "node",
                                        "nullable": true,

                                        "selection": {
                                            "fields": {
                                                "friendsByCursor": {
                                                    "type": "UserConnection",
                                                    "keyRaw": "friendsByCursor",
                                                    "nullable": true,

                                                    "selection": {
                                                        "fields": {
                                                            "edges": {
                                                                "type": "UserEdge",
                                                                "keyRaw": "edges",

                                                                "selection": {
                                                                    "fields": {
                                                                        "node": {
                                                                            "type": "User",
                                                                            "keyRaw": "node",
                                                                            "nullable": true,

                                                                            "selection": {
                                                                                "fields": {
                                                                                    "id": {
                                                                                        "type": "ID",
                                                                                        "keyRaw": "id",
                                                                                        "visible": true,
                                                                                    },

                                                                                    "__typename": {
                                                                                        "type": "String",
                                                                                        "keyRaw": "__typename",
                                                                                    },
                                                                                },
                                                                            },

                                                                            "visible": true,
                                                                        },

                                                                        "__typename": {
                                                                            "type": "String",
                                                                            "keyRaw": "__typename",
                                                                        },
                                                                    },
                                                                },

                                                                "visible": true,
                                                            },

                                                            "__typename": {
                                                                "type": "String",
                                                                "keyRaw": "__typename",
                                                            },
                                                        },
                                                    },

                                                    "visible": true,
                                                },

                                                "__typename": {
                                                    "type": "String",
                                                    "keyRaw": "__typename",
                                                },

                                                "id": {
                                                    "type": "ID",
                                                    "keyRaw": "id",
                                                },
                                            },
                                        },

                                        "visible": true,
                                    },

                                    "__typename": {
                                        "type": "String",
                                        "keyRaw": "__typename",
                                    },

                                    "cursor": {
                                        "type": "String",
                                        "keyRaw": "cursor",
                                        "visible": true,
                                    },
                                },
                            },

                            "visible": true,
                        },

                        "__typename": {
                            "type": "String",
                            "keyRaw": "__typename",
                        },

                        "pageInfo": {
                            "type": "PageInfo",
                            "keyRaw": "pageInfo",

                            "selection": {
                                "fields": {
                                    "hasNextPage": {
                                        "type": "Boolean",
                                        "keyRaw": "hasNextPage",
                                        "updates": ["append"],
                                        "visible": true,
                                    },

                                    "hasPreviousPage": {
                                        "type": "Boolean",
                                        "keyRaw": "hasPreviousPage",
                                        "updates": ["prepend"],
                                        "visible": true,
                                    },

                                    "startCursor": {
                                        "type": "String",
                                        "keyRaw": "startCursor",
                                        "updates": ["prepend"],
                                        "nullable": true,
                                        "visible": true,
                                    },

                                    "endCursor": {
                                        "type": "String",
                                        "keyRaw": "endCursor",
                                        "updates": ["append"],
                                        "nullable": true,
                                        "visible": true,
                                    },
                                },
                            },

                            "visible": true,
                        },
                    },
                },

                "visible": true,
            },

            "friends": {
                "type": "UserConnection",
                "keyRaw": "friends(first: 10, filter: \"hello\")",
                "nullable": true,

                "selection": {
                    "fields": {
                        "edges": {
                            "type": "UserEdge",
                            "keyRaw": "edges",

                            "selection": {
                                "fields": {
                                    "node": {
                                        "type": "User",
                                        "keyRaw": "node",
                                        "nullable": true,

                                        "selection": {
                                            "fields": {
                                                "friendsByCursor": {
                                                    "type": "UserConnection",
                                                    "keyRaw": "friendsByCursor",
                                                    "nullable": true,

                                                    "selection": {
                                                        "fields": {
                                                            "edges": {
                                                                "type": "UserEdge",
                                                                "keyRaw": "edges",

                                                                "selection": {
                                                                    "fields": {
                                                                        "node": {
                                                                            "type": "User",
                                                                            "keyRaw": "node",
                                                                            "nullable": true,

                                                                            "selection": {
                                                                                "fields": {
                                                                                    "id": {
                                                                                        "type": "ID",
                                                                                        "keyRaw": "id",
                                                                                        "visible": true,
                                                                                    },

                                                                                    "__typename": {
                                                                                        "type": "String",
                                                                                        "keyRaw": "__typename",
                                                                                    },
                                                                                },
                                                                            },

                                                                            "visible": true,
                                                                        },

                                                                        "__typename": {
                                                                            "type": "String",
                                                                            "keyRaw": "__typename",
                                                                        },
                                                                    },
                                                                },

                                                                "visible": true,
                                                            },

                                                            "__typename": {
                                                                "type": "String",
                                                                "keyRaw": "__typename",
                                                            },
                                                        },
                                                    },

                                                    "visible": true,
                                                },

                                                "__typename": {
                                                    "type": "String",
                                                    "keyRaw": "__typename",
                                                },

                                                "id": {
                                                    "type": "ID",
                                                    "keyRaw": "id",
                                                },
                                            },
                                        },

                                        "visible": true,
                                    },

                                    "__typename": {
                                        "type": "String",
                                        "keyRaw": "__typename",
                                    },
                                },
                            },

                            "visible": true,
                        },

                        "__typename": {
                            "type": "String",
                            "keyRaw": "__typename",
                        },
                    },
                },

                "visible": true,
            },

            "__typename": {
                "type": "String",
                "keyRaw": "__typename",
                "visible": true,
            },

            "id": {
                "type": "ID",
                "keyRaw": "id",
                "visible": true,
            },
        },
    },

    "pluginData": {},
} as const

export default artifact

export type PaginatedFragment$input = never;

export type PaginatedFragment = {
	readonly "shape"?: PaginatedFragment$data;
	readonly " $fragments": {
		"PaginatedFragment": { readonly "expected a PaginatedFragment fragment spread"?: never };
	};
};

export type PaginatedFragment$data = {
	readonly friendsByCursor: {
		readonly edges: ({
			readonly node: {
				readonly friendsByCursor: {
					readonly edges: ({
						readonly node: {
							readonly id: string;
						} | null;
					})[];
				} | null;
			} | null;
			readonly cursor: string;
		})[];
		readonly pageInfo: {
			readonly hasNextPage: boolean;
			readonly hasPreviousPage: boolean;
			readonly startCursor: string | null;
			readonly endCursor: string | null;
		};
	} | null;
	readonly friends: {
		readonly edges: ({
			readonly node: {
				readonly friendsByCursor: {
					readonly edges: ({
						readonly node: {
							readonly id: string;
						} | null;
					})[];
				} | null;
			} | null;
		})[];
	} | null;
};

export type PaginatedFragment$artifact = typeof artifact

"HoudiniHash=78b80c2614cff7e081e6fe51e406113e0133a05c144e66959fbda996cfac5217"`),
				},
			},
			{
				Name: "paginate over unions",
				Input: []string{
					`
            query TestQuery {
              entitiesByCursor(first: 10) @paginate(name: "All_Users") {
                edges {
                  node {
                    ... on User {
                      firstName
                    }
                  }
                }
              }
            }
          `,
				},
				Pass: true,
				Extra: map[string]any{
					"TestQuery": tests.Dedent(`const artifact = {
    "name": "TestQuery",
    "kind": "HoudiniQuery",
    "hash": "65dcad7518a83fd849c7da587f62a08ba62b9eb6e226eb95fb1c9a276575b9c1",

    "refetch": {
        "path": ["entitiesByCursor"],
        "method": "cursor",
        "pageSize": 10,
        "embedded": false,
        "targetType": "Query",
        "paginated": true,
        "direction": "both",
        "mode": "Infinite"
    },

    "raw": ` + "`" + `query TestQuery($after: String, $before: String, $first: Int = 10, $last: Int) {
    entitiesByCursor(first: $first, after: $after, last: $last, before: $before) {
        edges {
            node {
                ... on User {
                    firstName
                    __typename
                    id
                }
                __typename
            }
            __typename
            cursor
        }
        __typename
        pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
        }
    }
}
` + "`" + `,

    "rootType": "Query",
    "stripVariables": [] as Array<string>,

    "selection": {
        "fields": {
            "entitiesByCursor": {
                "type": "EntityConnection",
                "keyRaw": "entitiesByCursor::paginated",

                "directives": [{
                    "name": "paginate",
                    "arguments": {
                        "name": {
                            "kind": "StringValue",
                            "value": "All_Users"
                        }
                    }
                }],

                "list": {
                    "name": "All_Users",
                    "connection": true,
                    "type": "Entity"
                },

                "selection": {
                    "fields": {
                        "edges": {
                            "type": "EntityEdge",
                            "keyRaw": "edges",
                            "updates": ["append", "prepend"],

                            "selection": {
                                "fields": {
                                    "node": {
                                        "type": "Entity",
                                        "keyRaw": "node",
                                        "nullable": true,

                                        "selection": {
                                            "fields": {
                                                "__typename": {
                                                    "type": "String",
                                                    "keyRaw": "__typename",
                                                },
                                            },
                                            "abstractFields": {
                                                "fields": {
                                                    "User": {
                                                        "firstName": {
                                                            "type": "String",
                                                            "keyRaw": "firstName",
                                                            "visible": true,
                                                        },
                                                        "__typename": {
                                                            "type": "String",
                                                            "keyRaw": "__typename",
                                                        },
                                                        "id": {
                                                            "type": "ID",
                                                            "keyRaw": "id",
                                                        },
                                                    },
                                                },

                                                "typeMap": {},
                                            },
                                        },

                                        "abstract": true,
                                        "visible": true,
                                    },

                                    "__typename": {
                                        "type": "String",
                                        "keyRaw": "__typename",
                                    },

                                    "cursor": {
                                        "type": "String",
                                        "keyRaw": "cursor",
                                        "visible": true,
                                    },
                                },
                            },

                            "visible": true,
                        },

                        "__typename": {
                            "type": "String",
                            "keyRaw": "__typename",
                        },

                        "pageInfo": {
                            "type": "PageInfo",
                            "keyRaw": "pageInfo",

                            "selection": {
                                "fields": {
                                    "hasNextPage": {
                                        "type": "Boolean",
                                        "keyRaw": "hasNextPage",
                                        "updates": ["append"],
                                        "visible": true,
                                    },

                                    "hasPreviousPage": {
                                        "type": "Boolean",
                                        "keyRaw": "hasPreviousPage",
                                        "updates": ["prepend"],
                                        "visible": true,
                                    },

                                    "startCursor": {
                                        "type": "String",
                                        "keyRaw": "startCursor",
                                        "updates": ["prepend"],
                                        "nullable": true,
                                        "visible": true,
                                    },

                                    "endCursor": {
                                        "type": "String",
                                        "keyRaw": "endCursor",
                                        "updates": ["append"],
                                        "nullable": true,
                                        "visible": true,
                                    },
                                },
                            },

                            "visible": true,
                        },
                    },
                },

                "filters": {
                    "first": {
                        "kind": "Variable",
                        "value": "first"
                    },
                    "after": {
                        "kind": "Variable",
                        "value": "after"
                    },
                    "last": {
                        "kind": "Variable",
                        "value": "last"
                    },
                    "before": {
                        "kind": "Variable",
                        "value": "before"
                    },
                },
                "visible": true,
            },
        },
    },

    "pluginData": {},

    "dedupe": {
        "cancel": "last",
        "match": "Variables"
    },

    "input": {
        "fields": {
            "first": "Int",
            "after": "String",
            "last": "Int",
            "before": "String",
        },

        "types": {},

        "defaults": {
            "first": 10,
        },

        "runtimeScalars": {},
    },

    "policy": "CacheOrNetwork",
    "partial": false
} as const

export default artifact

export type TestQuery = {
	readonly "input": TestQuery$input;
	readonly "result": TestQuery$result | undefined;
};

export type TestQuery$result = {
	readonly entitiesByCursor: {
		readonly edges: ({
			readonly node: {} & (({
				readonly firstName: string;
				readonly __typename: "User";
			}) | ({
				readonly " $fragments"?: {};
				readonly __typename: "non-exhaustive; don't match this";
			})) | null;
			readonly cursor: string;
		})[];
		readonly pageInfo: {
			readonly hasNextPage: boolean;
			readonly hasPreviousPage: boolean;
			readonly startCursor: string | null;
			readonly endCursor: string | null;
		};
	};
};

export type TestQuery$input = {
	first?: number | null;
	after?: string | null;
	last?: number | null;
	before?: string | null;
};

export type TestQuery$unmasked = {
	readonly entitiesByCursor: {
		readonly edges: ({
			readonly node: {} & (({
				readonly firstName: string;
				readonly id: string;
				readonly __typename: "User";
			}) | ({
				readonly " $fragments"?: {};
				readonly __typename: "non-exhaustive; don't match this";
			})) | null;
			readonly __typename: "EntityEdge";
			readonly cursor: string;
		})[];
		readonly __typename: "EntityConnection";
		readonly pageInfo: {
			readonly hasNextPage: boolean;
			readonly hasPreviousPage: boolean;
			readonly startCursor: string | null;
			readonly endCursor: string | null;
		};
	};
};

export type TestQuery$artifact = typeof artifact

"HoudiniHash=65dcad7518a83fd849c7da587f62a08ba62b9eb6e226eb95fb1c9a276575b9c1"`),
				},
			},
			{
				Name: "paginate on nested field with argument-bearing parent has correct path",
				Input: []string{
					`
					query Info($id: Int = 1) {
						species(id: $id) {
							id
							moves(first: 1) @paginate(mode: SinglePage) {
								edges {
									node { id }
								}
								pageInfo {
									hasNextPage
									hasPreviousPage
								}
							}
						}
					}
					`,
				},
				Pass: true,
				Extra: map[string]any{
					"Info": tests.Dedent(`const artifact = {
    "name": "Info",
    "kind": "HoudiniQuery",
    "hash": "209cda5570b08d7a05a24baf7296a43a140c8f832e2628e54ae4710c838b736f",

    "refetch": {
        "path": ["species","moves"],
        "method": "cursor",
        "pageSize": 1,
        "embedded": false,
        "targetType": "Query",
        "paginated": true,
        "direction": "forward",
        "mode": "SinglePage"
    },

    "raw": ` + "`" + `query Info($after: String, $first: Int = 1, $id: Int = 1) {
    species(id: $id) {
        id
        moves(first: $first, after: $after) {
            edges {
                node {
                    id
                    __typename
                }
                __typename
                cursor
            }
            pageInfo {
                hasNextPage
                hasPreviousPage
                __typename
                startCursor
                endCursor
            }
            __typename
        }
        __typename
    }
}
` + "`" + `,

    "rootType": "Query",
    "stripVariables": [] as Array<string>,

    "selection": {
        "fields": {
            "species": {
                "type": "Species",
                "keyRaw": "species(id: $id)",
                "nullable": true,

                "selection": {
                    "fields": {
                        "id": {
                            "type": "Int",
                            "keyRaw": "id",
                            "visible": true,
                        },

                        "moves": {
                            "type": "SpeciesMoveConnection",
                            "keyRaw": "moves(first: $first, after: $after, last: null, before: null)",

                            "directives": [{
                                "name": "paginate",
                                "arguments": {
                                    "mode": {
                                        "kind": "EnumValue",
                                        "value": "SinglePage"
                                    }
                                }
                            }],


                            "selection": {
                                "fields": {
                                    "edges": {
                                        "type": "SpeciesMoveEdge",
                                        "keyRaw": "edges",

                                        "selection": {
                                            "fields": {
                                                "node": {
                                                    "type": "SpeciesMove",
                                                    "keyRaw": "node",
                                                    "nullable": true,

                                                    "selection": {
                                                        "fields": {
                                                            "id": {
                                                                "type": "Int",
                                                                "keyRaw": "id",
                                                                "visible": true,
                                                            },

                                                            "__typename": {
                                                                "type": "String",
                                                                "keyRaw": "__typename",
                                                            },
                                                        },
                                                    },

                                                    "visible": true,
                                                },

                                                "__typename": {
                                                    "type": "String",
                                                    "keyRaw": "__typename",
                                                },

                                                "cursor": {
                                                    "type": "String",
                                                    "keyRaw": "cursor",
                                                    "visible": true,
                                                },
                                            },
                                        },

                                        "visible": true,
                                    },

                                    "pageInfo": {
                                        "type": "PageInfo",
                                        "keyRaw": "pageInfo",

                                        "selection": {
                                            "fields": {
                                                "hasNextPage": {
                                                    "type": "Boolean",
                                                    "keyRaw": "hasNextPage",
                                                    "visible": true,
                                                },

                                                "hasPreviousPage": {
                                                    "type": "Boolean",
                                                    "keyRaw": "hasPreviousPage",
                                                    "visible": true,
                                                },

                                                "__typename": {
                                                    "type": "String",
                                                    "keyRaw": "__typename",
                                                },

                                                "startCursor": {
                                                    "type": "String",
                                                    "keyRaw": "startCursor",
                                                    "nullable": true,
                                                    "visible": true,
                                                },

                                                "endCursor": {
                                                    "type": "String",
                                                    "keyRaw": "endCursor",
                                                    "nullable": true,
                                                    "visible": true,
                                                },
                                            },
                                        },

                                        "visible": true,
                                    },

                                    "__typename": {
                                        "type": "String",
                                        "keyRaw": "__typename",
                                    },
                                },
                            },

                            "visible": true,
                        },

                        "__typename": {
                            "type": "String",
                            "keyRaw": "__typename",
                        },
                    },
                },

                "visible": true,
            },
        },
    },

    "pluginData": {},

    "dedupe": {
        "cancel": "last",
        "match": "Variables"
    },

    "input": {
        "fields": {
            "id": "Int",
            "first": "Int",
            "after": "String",
        },

        "types": {},

        "defaults": {
            "id": 1,
            "first": 1,
        },

        "runtimeScalars": {},
    },

    "policy": "CacheOrNetwork",
    "partial": false
} as const

export default artifact

export type Info = {
	readonly "input": Info$input;
	readonly "result": Info$result | undefined;
};

export type Info$result = {
	readonly species: {
		readonly id: number;
		readonly moves: {
			readonly edges: ({
				readonly node: {
					readonly id: number;
				} | null;
				readonly cursor: string;
			})[];
			readonly pageInfo: {
				readonly hasNextPage: boolean;
				readonly hasPreviousPage: boolean;
				readonly startCursor: string | null;
				readonly endCursor: string | null;
			};
		};
	} | null;
};

export type Info$input = {
	id?: number | null;
	first?: number | null;
	after?: string | null;
};

export type Info$unmasked = {
	readonly species: {
		readonly id: number;
		readonly moves: {
			readonly edges: ({
				readonly node: {
					readonly id: number;
					readonly __typename: "SpeciesMove";
				} | null;
				readonly __typename: "SpeciesMoveEdge";
				readonly cursor: string;
			})[];
			readonly pageInfo: {
				readonly hasNextPage: boolean;
				readonly hasPreviousPage: boolean;
				readonly __typename: "PageInfo";
				readonly startCursor: string | null;
				readonly endCursor: string | null;
			};
			readonly __typename: "SpeciesMoveConnection";
		};
		readonly __typename: "Species";
	} | null;
};

export type Info$artifact = typeof artifact

"HoudiniHash=209cda5570b08d7a05a24baf7296a43a140c8f832e2628e54ae4710c838b736f"`),
				},
			},
		},
	})
}
