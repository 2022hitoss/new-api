package model

import (
	"context"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createQuotaRefillTestUser(t *testing.T, username, group string, status, quota int) *User {
	t.Helper()
	user := &User{Username: username, Password: "test-password", AffCode: "aff-" + username, Group: group, Status: status, Role: common.RoleCommonUser, Quota: quota}
	require.NoError(t, DB.Create(user).Error)
	return user
}

func quotaRefillTestUserQuota(t *testing.T, id int) int {
	t.Helper()
	var user User
	require.NoError(t, DB.First(&user, id).Error)
	return user.Quota
}

func TestSelfRefillUserQuotaBelowThresholdOverridesToTarget(t *testing.T) {
	truncateTables(t)
	user := createQuotaRefillTestUser(t, "refill-eligible", "default", common.UserStatusEnabled, 5)

	adjustment, err := SelfRefillUserQuota(user.Id, 10, 100)

	require.NoError(t, err)
	assert.Equal(t, 5, adjustment.Before)
	assert.Equal(t, 100, adjustment.After)
	assert.Equal(t, 100, quotaRefillTestUserQuota(t, user.Id))
}

func TestSelfRefillUserQuotaRejectsWhenNotEligible(t *testing.T) {
	cases := []struct {
		name      string
		quota     int
		threshold int
		target    int
	}{
		{name: "balance equals threshold", quota: 10, threshold: 10, target: 100},
		{name: "balance above threshold", quota: 50, threshold: 10, target: 100},
		{name: "target not above balance", quota: 5, threshold: 10, target: 5},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			truncateTables(t)
			user := createQuotaRefillTestUser(t, "refill-"+tc.name, "default", common.UserStatusEnabled, tc.quota)

			adjustment, err := SelfRefillUserQuota(user.Id, tc.threshold, tc.target)

			require.ErrorIs(t, err, ErrSelfRefillNotEligible)
			assert.Nil(t, adjustment)
			assert.Equal(t, tc.quota, quotaRefillTestUserQuota(t, user.Id))
		})
	}
}

func TestSelfRefillUserQuotaSecondCallIsRejected(t *testing.T) {
	truncateTables(t)
	user := createQuotaRefillTestUser(t, "refill-twice", "default", common.UserStatusEnabled, 5)

	_, err := SelfRefillUserQuota(user.Id, 10, 100)
	require.NoError(t, err)
	_, err = SelfRefillUserQuota(user.Id, 10, 100)

	require.ErrorIs(t, err, ErrSelfRefillNotEligible)
	assert.Equal(t, 100, quotaRefillTestUserQuota(t, user.Id))
}

func TestSelfRefillUserQuotaRejectsDisabledUser(t *testing.T) {
	truncateTables(t)
	user := createQuotaRefillTestUser(t, "refill-disabled", "default", common.UserStatusDisabled, 5)

	_, err := SelfRefillUserQuota(user.Id, 10, 100)

	require.Error(t, err)
	assert.NotErrorIs(t, err, ErrSelfRefillNotEligible)
	assert.Equal(t, 5, quotaRefillTestUserQuota(t, user.Id))
}

func TestResetGroupQuotasOverridesOnlyConfiguredEnabledUsers(t *testing.T) {
	truncateTables(t)
	defaultLow := createQuotaRefillTestUser(t, "default-low", "default", common.UserStatusEnabled, 5)
	vipHigh := createQuotaRefillTestUser(t, "vip-high", "vip", common.UserStatusEnabled, 999)
	defaultDisabled := createQuotaRefillTestUser(t, "default-disabled", "default", common.UserStatusDisabled, 5)
	otherGroup := createQuotaRefillTestUser(t, "other-group", "other", common.UserStatusEnabled, 5)
	defaultAtTarget := createQuotaRefillTestUser(t, "default-at-target", "default", common.UserStatusEnabled, 100)

	summary, err := ResetGroupQuotas(context.Background(), map[string]int{"vip": 200, "default": 100}, "2026-09")

	require.NoError(t, err)
	assert.Equal(t, "2026-09", summary.Period)
	assert.Equal(t, []string{"default", "vip"}, summary.Groups)
	assert.Equal(t, 2, summary.ResetCount)
	assert.Equal(t, 1, summary.SkippedUnchanged)
	assert.Equal(t, 0, summary.FailedCount)
	assert.Empty(t, summary.FailedUserIDs)

	assert.Equal(t, 100, quotaRefillTestUserQuota(t, defaultLow.Id))
	assert.Equal(t, 200, quotaRefillTestUserQuota(t, vipHigh.Id))
	assert.Equal(t, 5, quotaRefillTestUserQuota(t, defaultDisabled.Id))
	assert.Equal(t, 5, quotaRefillTestUserQuota(t, otherGroup.Id))
	assert.Equal(t, 100, quotaRefillTestUserQuota(t, defaultAtTarget.Id))

	var logCount int64
	require.NoError(t, DB.Model(&Log{}).Where("type = ? AND user_id IN ?", LogTypeSystem, []int{defaultLow.Id, vipHigh.Id}).Count(&logCount).Error)
	assert.Equal(t, int64(2), logCount)
	require.NoError(t, DB.Model(&Log{}).Where("type = ? AND user_id = ?", LogTypeSystem, defaultAtTarget.Id).Count(&logCount).Error)
	assert.Equal(t, int64(0), logCount)
}

func TestResetGroupQuotasStopsOnCancelledContext(t *testing.T) {
	truncateTables(t)
	user := createQuotaRefillTestUser(t, "cancelled", "default", common.UserStatusEnabled, 5)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	summary, err := ResetGroupQuotas(ctx, map[string]int{"default": 100}, "2026-09")

	require.ErrorIs(t, err, context.Canceled)
	assert.Equal(t, 0, summary.ResetCount)
	assert.Equal(t, 5, quotaRefillTestUserQuota(t, user.Id))
}
