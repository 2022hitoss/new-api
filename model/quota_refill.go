package model

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"gorm.io/gorm"
)

var ErrSelfRefillNotEligible = errors.New("self refill not eligible")

const groupQuotaResetBatchSize = 200

// SelfRefillUserQuota sets the user's wallet to target when, and only when, the
// balance is still below threshold. The eligibility check runs inside the
// row-locked transaction, and the UPDATE is guarded by the balance it observed
// (SQLite acquires no row lock), so concurrent requests cannot refill twice.
func SelfRefillUserQuota(userID, threshold, target int) (*UserQuotaAdjustment, error) {
	if userID <= 0 || threshold < 0 || target < 0 {
		return nil, ErrInvalidUserQuotaAdjustment
	}
	if target > common.MaxWalletQuota {
		return nil, ErrWalletQuotaLimitExceeded
	}

	var adjustment UserQuotaAdjustment
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).First(&user, userID).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return gorm.ErrRecordNotFound
		}
		if user.Quota >= threshold || user.Quota >= target {
			return ErrSelfRefillNotEligible
		}
		result := tx.Model(&User{}).Where("id = ? AND quota = ?", userID, user.Quota).Update("quota", target)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrSelfRefillNotEligible
		}
		adjustment = UserQuotaAdjustment{UserID: user.Id, Username: user.Username, Before: user.Quota, After: target}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Apply only the committed difference, preserving outstanding reservations.
	if err := cacheIncrUserQuota(userID, int64(adjustment.After)-int64(adjustment.Before)); err != nil {
		common.SysError(fmt.Sprintf("failed to sync self refill for user %d: %s", userID, err))
	}
	return &adjustment, nil
}

// GroupQuotaResetSummary is the persisted result of one monthly reset run.
type GroupQuotaResetSummary struct {
	Period           string   `json:"period"`
	Groups           []string `json:"groups"`
	ResetCount       int      `json:"reset_count"`
	SkippedUnchanged int      `json:"skipped_unchanged"`
	FailedCount      int      `json:"failed_count"`
	FailedUserIDs    []int    `json:"failed_user_ids"`
}

// ResetGroupQuotas overrides the wallet of every enabled user in each configured
// group to that group's quota. Per-user failures are recorded in the summary
// and do not stop the pass; a failed batch query or a cancelled context aborts
// the pass and returns the error together with the partial summary.
func ResetGroupQuotas(ctx context.Context, groupQuota map[string]int, period string) (*GroupQuotaResetSummary, error) {
	summary := &GroupQuotaResetSummary{Period: period, Groups: make([]string, 0, len(groupQuota)), FailedUserIDs: []int{}}
	groups := make([]string, 0, len(groupQuota))
	for group := range groupQuota {
		groups = append(groups, group)
	}
	slices.Sort(groups)

	for _, group := range groups {
		quota := groupQuota[group]
		if quota < 0 || quota > common.MaxWalletQuota {
			common.SysError(fmt.Sprintf("monthly quota reset skipped group %q: quota %d out of range", group, quota))
			continue
		}
		summary.Groups = append(summary.Groups, group)
		lastID := 0
		for {
			if err := ctx.Err(); err != nil {
				return summary, err
			}
			var userIDs []int
			err := DB.Model(&User{}).
				Where(commonGroupCol+" = ? AND status = ? AND id > ?", group, common.UserStatusEnabled, lastID).
				Order("id").
				Limit(groupQuotaResetBatchSize).
				Pluck("id", &userIDs).Error
			if err != nil {
				return summary, err
			}
			if len(userIDs) == 0 {
				break
			}
			for _, userID := range userIDs {
				lastID = userID
				adjustment, err := AdjustUserQuota(userID, common.RoleRootUser, "override", quota)
				if err != nil {
					summary.FailedCount++
					summary.FailedUserIDs = append(summary.FailedUserIDs, userID)
					common.SysError(fmt.Sprintf("monthly quota reset failed for user %d (group %q): %s", userID, group, err))
					continue
				}
				if adjustment.Before == adjustment.After {
					summary.SkippedUnchanged++
					continue
				}
				summary.ResetCount++
				RecordLog(userID, LogTypeSystem, fmt.Sprintf("月度额度重置（%s，分组 %s）：%s -> %s", period, group, logger.LogQuota(adjustment.Before), logger.LogQuota(adjustment.After)))
			}
			if len(userIDs) < groupQuotaResetBatchSize {
				break
			}
		}
	}
	return summary, nil
}
