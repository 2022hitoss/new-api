package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedUsageLog(t *testing.T, log Log) {
	t.Helper()
	require.NoError(t, LOG_DB.Create(&log).Error)
}

func seedUsageUser(t *testing.T, id int, username string, displayName string) {
	t.Helper()
	require.NoError(t, DB.Create(&User{Id: id, Username: username, DisplayName: displayName, AffCode: username}).Error)
}

func TestGetUserUsageStatsAggregatesPerUser(t *testing.T) {
	truncateTables(t)
	seedUsageUser(t, 1, "alice", "Alice Liddell")
	seedUsageUser(t, 2, "bob", "")
	seedUsageLog(t, Log{UserId: 1, Username: "alice", Type: LogTypeConsume, CreatedAt: 1000, Quota: 100, PromptTokens: 10, CompletionTokens: 5})
	seedUsageLog(t, Log{UserId: 1, Username: "alice", Type: LogTypeConsume, CreatedAt: 1500, Quota: 50, PromptTokens: 20, CompletionTokens: 5})
	seedUsageLog(t, Log{UserId: 2, Username: "bob", Type: LogTypeConsume, CreatedAt: 1200, Quota: 300, PromptTokens: 7, CompletionTokens: 3})

	stats, err := GetUserUsageStats(1000, 2000)
	require.NoError(t, err)
	require.Len(t, stats, 2)

	assert.Equal(t, UserUsageStat{UserId: 1, Username: "alice", DisplayName: "Alice Liddell", RequestCount: 2, PromptTokens: 30, CompletionTokens: 10, TotalTokens: 40, Quota: 150}, stats[0])
	assert.Equal(t, UserUsageStat{UserId: 2, Username: "bob", RequestCount: 1, PromptTokens: 7, CompletionTokens: 3, TotalTokens: 10, Quota: 300}, stats[1])
}

func TestGetUserUsageStatsCountsOnlyConsumeLogs(t *testing.T) {
	truncateTables(t)
	seedUsageLog(t, Log{UserId: 1, Username: "alice", Type: LogTypeConsume, CreatedAt: 1000, Quota: 100, PromptTokens: 10, CompletionTokens: 5})
	for _, logType := range []int{LogTypeTopup, LogTypeManage, LogTypeSystem, LogTypeError, LogTypeRefund, LogTypeLogin} {
		seedUsageLog(t, Log{UserId: 1, Username: "alice", Type: logType, CreatedAt: 1100, Quota: 999, PromptTokens: 99, CompletionTokens: 99})
	}

	stats, err := GetUserUsageStats(1000, 2000)
	require.NoError(t, err)
	require.Len(t, stats, 1)
	assert.Equal(t, int64(1), stats[0].RequestCount)
	assert.Equal(t, int64(100), stats[0].Quota)
	assert.Equal(t, int64(15), stats[0].TotalTokens)
}

func TestGetUserUsageStatsTimeRangeIsInclusiveAndZeroMeansUnbounded(t *testing.T) {
	truncateTables(t)
	for _, createdAt := range []int64{999, 1000, 2000, 2001} {
		seedUsageLog(t, Log{UserId: 1, Username: "alice", Type: LogTypeConsume, CreatedAt: createdAt, Quota: 1})
	}

	tests := []struct {
		name  string
		start int64
		end   int64
		count int64
	}{
		{name: "inclusive bounds", start: 1000, end: 2000, count: 2},
		{name: "open end", start: 2000, end: 0, count: 2},
		{name: "open start", start: 0, end: 1000, count: 2},
		{name: "unbounded", start: 0, end: 0, count: 4},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			stats, err := GetUserUsageStats(tc.start, tc.end)
			require.NoError(t, err)
			require.Len(t, stats, 1)
			assert.Equal(t, tc.count, stats[0].RequestCount)
		})
	}
}

func TestGetUserUsageStatsReturnsEmptySliceWithoutRows(t *testing.T) {
	truncateTables(t)

	stats, err := GetUserUsageStats(1000, 2000)
	require.NoError(t, err)
	assert.NotNil(t, stats)
	assert.Empty(t, stats)
}

func TestGetUserUsageStatsReportsCurrentUsernameAndDisplayName(t *testing.T) {
	truncateTables(t)
	seedUsageUser(t, 1, "alice", "Alice Liddell")
	seedUsageLog(t, Log{UserId: 1, Username: "old-name", Type: LogTypeConsume, CreatedAt: 1000, Quota: 10})
	seedUsageLog(t, Log{UserId: 1, Username: "zz-older-name", Type: LogTypeConsume, CreatedAt: 1100, Quota: 20})

	stats, err := GetUserUsageStats(1000, 2000)
	require.NoError(t, err)
	require.Len(t, stats, 1)
	assert.Equal(t, 1, stats[0].UserId)
	assert.Equal(t, "alice", stats[0].Username)
	assert.Equal(t, "Alice Liddell", stats[0].DisplayName)
	assert.Equal(t, int64(30), stats[0].Quota)
	assert.Equal(t, int64(2), stats[0].RequestCount)
}

func TestGetUserUsageStatsKeepsLogUsernameForMissingOrDeletedUsers(t *testing.T) {
	truncateTables(t)
	seedUsageUser(t, 2, "carol", "Carol")
	require.NoError(t, DB.Delete(&User{}, 2).Error)
	seedUsageLog(t, Log{UserId: 1, Username: "ghost", Type: LogTypeConsume, CreatedAt: 1000, Quota: 10})
	seedUsageLog(t, Log{UserId: 2, Username: "carol-old", Type: LogTypeConsume, CreatedAt: 1000, Quota: 10})

	stats, err := GetUserUsageStats(1000, 2000)
	require.NoError(t, err)
	require.Len(t, stats, 2)
	assert.Equal(t, "ghost", stats[0].Username)
	assert.Empty(t, stats[0].DisplayName)
	assert.Equal(t, "carol", stats[1].Username)
	assert.Equal(t, "Carol", stats[1].DisplayName)
}
