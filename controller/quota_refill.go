package controller

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

// GetSelfRefillInfo tells the wallet page whether the current user may refill
// their own balance and to which value.
func GetSelfRefillInfo(c *gin.Context) {
	setting := operation_setting.GetQuotaRefillSetting()
	if !setting.SelfRefillEnabled {
		common.ApiSuccess(c, gin.H{"enabled": false})
		return
	}
	quota, err := model.GetUserQuota(c.GetInt("id"), true)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	common.ApiSuccess(c, gin.H{
		"enabled":   true,
		"threshold": setting.SelfRefillThreshold,
		"target":    setting.SelfRefillTarget,
		"quota":     quota,
		"eligible":  quota < setting.SelfRefillThreshold && quota < setting.SelfRefillTarget,
	})
}

// SelfRefill sets the current user's balance to the configured target while it
// is below the configured threshold.
func SelfRefill(c *gin.Context) {
	setting := operation_setting.GetQuotaRefillSetting()
	if !setting.SelfRefillEnabled {
		common.ApiErrorI18n(c, i18n.MsgFeatureDisabled)
		return
	}
	userId := c.GetInt("id")
	adjustment, err := model.SelfRefillUserQuota(userId, setting.SelfRefillThreshold, setting.SelfRefillTarget)
	if err != nil {
		if errors.Is(err, model.ErrSelfRefillNotEligible) {
			common.ApiErrorI18n(c, i18n.MsgSelfRefillNotEligible)
			return
		}
		logger.LogError(c.Request.Context(), fmt.Sprintf("self refill failed for user %d: %v", userId, err))
		common.ApiErrorI18n(c, i18n.MsgOperationFailed)
		return
	}
	model.RecordLog(userId, model.LogTypeTopup, fmt.Sprintf("自助补充额度：%s -> %s", logger.LogQuota(adjustment.Before), logger.LogQuota(adjustment.After)))
	common.ApiSuccess(c, gin.H{
		"before": adjustment.Before,
		"after":  adjustment.After,
		"quota":  adjustment.After,
	})
}

// monthlyQuotaResetHandler resets every enabled user's wallet to the quota
// configured for their group once per calendar month. Enabled() folds the
// "has this month already been processed?" check into scheduling, so the
// runner creates exactly one task row per month (plus retries after failures)
// and enabling the feature mid-month triggers an immediate first run.
type monthlyQuotaResetHandler struct{}

func (monthlyQuotaResetHandler) Type() string { return model.SystemTaskTypeMonthlyQuotaReset }

func (monthlyQuotaResetHandler) Enabled() bool {
	setting := operation_setting.GetQuotaRefillSetting()
	return setting.MonthlyResetEnabled &&
		setting.MonthlyResetGroupQuota.Len() > 0 &&
		setting.MonthlyResetLastPeriod != time.Now().Format(operation_setting.QuotaRefillPeriodLayout)
}

// Interval only paces retries after a failed run; successful runs are gated by
// Enabled(). It also leaves room for SyncOptions to propagate the completed
// period to other master nodes before they re-evaluate Enabled().
func (monthlyQuotaResetHandler) Interval() time.Duration { return 10 * time.Minute }

func (monthlyQuotaResetHandler) NewPayload() any { return nil }

func (monthlyQuotaResetHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	setting := operation_setting.GetQuotaRefillSetting()
	period := time.Now().Format(operation_setting.QuotaRefillPeriodLayout)
	summary, err := model.ResetGroupQuotas(ctx, setting.MonthlyResetGroupQuota.ReadAll(), period)
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, summary, err)
		return
	}
	if err := model.UpdateOption(operation_setting.QuotaRefillLastPeriodOptionKey, period); err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, summary, err)
		return
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}
