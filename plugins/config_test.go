package plugins_test

import (
	"context"
	"testing"

	"code.houdinigraphql.com/plugins"
	"code.houdinigraphql.com/plugins/tests"
	"github.com/stretchr/testify/require"
)

func TestReloadFieldReactivityConfig(t *testing.T) {
	db, err := plugins.NewTestPool[struct{}]()
	require.NoError(t, err)
	defer db.Close()
	ctx := context.Background()
	conn, err := db.Take(ctx)
	require.NoError(t, err)
	require.NoError(t, tests.WriteDatabaseSchema(conn))
	stmt, err := conn.Prepare(`INSERT INTO config (include, exclude, schema_path, default_keys, persisted_queries_path)
		VALUES ('[]', '[]', 'schema.graphql', '["id"]', 'queries.json')`)
	require.NoError(t, err)
	_, err = stmt.Step()
	require.NoError(t, err)
	require.NoError(t, stmt.Finalize())
	db.Put(conn)
	for _, enabled := range []bool{false, true, false} {
		conn, err := db.Take(ctx)
		require.NoError(t, err)
		stmt, err := conn.Prepare(`UPDATE config SET experimental_field_reactivity = ?1`)
		require.NoError(t, err)
		value := 0
		if enabled {
			value = 1
		}
		stmt.BindInt64(1, int64(value))
		_, err = stmt.Step()
		require.NoError(t, err)
		require.NoError(t, stmt.Finalize())
		db.Put(conn)
		require.NoError(t, db.ReloadProjectConfig(ctx))
		config, err := db.ProjectConfig(ctx)
		require.NoError(t, err)
		require.Equal(t, enabled, config.ExperimentalFieldReactivity)
	}
}
