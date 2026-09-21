package operation_setting

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/types"
)

const (
	QuotaRefillSettingName = "quota_refill_setting"

	QuotaRefillMonthlyResetEnabledOptionKey    = QuotaRefillSettingName + ".monthly_reset_enabled"
	QuotaRefillMonthlyResetGroupQuotaOptionKey = QuotaRefillSettingName + ".monthly_reset_group_quota"
	QuotaRefillLastPeriodOptionKey             = QuotaRefillSettingName + ".monthly_reset_last_period"
	QuotaRefillSelfRefillEnabledOptionKey      = QuotaRefillSettingName + ".self_refill_enabled"
	QuotaRefillSelfRefillThresholdOptionKey    = QuotaRefillSettingName + ".self_refill_threshold"
	QuotaRefillSelfRefillTargetOptionKey       = QuotaRefillSettingName + ".self_refill_target"

	// QuotaRefillPeriodLayout is the calendar-month key written by the monthly
	// reset task, e.g. "2026-09".
	QuotaRefillPeriodLayout = "2006-01"
)

// QuotaRefillSetting configures the monthly per-group quota reset task and the
// user self refill action. All quota values are stored in internal quota units.
type QuotaRefillSetting struct {
	MonthlyResetEnabled    bool                      `json:"monthly_reset_enabled"`
	MonthlyResetGroupQuota *types.RWMap[string, int] `json:"monthly_reset_group_quota"` // group -> quota every user in the group is reset to
	MonthlyResetLastPeriod string                    `json:"monthly_reset_last_period"` // last completed period, written by the task
	SelfRefillEnabled      bool                      `json:"self_refill_enabled"`
	SelfRefillThreshold    int                       `json:"self_refill_threshold"` // refill is allowed only while quota is below this
	SelfRefillTarget       int                       `json:"self_refill_target"`    // quota is set to this value on refill
}

var quotaRefillSetting = QuotaRefillSetting{
	MonthlyResetGroupQuota: types.NewRWMap[string, int](),
}

func init() {
	config.GlobalConfig.Register(QuotaRefillSettingName, &quotaRefillSetting)
}

func GetQuotaRefillSetting() *QuotaRefillSetting {
	if quotaRefillSetting.MonthlyResetGroupQuota == nil {
		quotaRefillSetting.MonthlyResetGroupQuota = types.NewRWMap[string, int]()
	}
	return &quotaRefillSetting
}

// ValidateQuotaRefillOption rejects invalid values before they are persisted.
// The generic config loader silently ignores malformed values, which would
// otherwise leave a bad option row in the database that never takes effect.
func ValidateQuotaRefillOption(key, value string) error {
	if !strings.HasPrefix(key, QuotaRefillSettingName+".") {
		return nil
	}
	switch key {
	case QuotaRefillSelfRefillThresholdOptionKey, QuotaRefillSelfRefillTargetOptionKey:
		number, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
		if err != nil || number < 0 || number > int64(common.MaxWalletQuota) {
			return fmt.Errorf("%s must be an integer between 0 and %d", key, common.MaxWalletQuota)
		}
	case QuotaRefillMonthlyResetGroupQuotaOptionKey:
		groupQuota := map[string]int64{}
		if err := common.UnmarshalJsonStr(value, &groupQuota); err != nil {
			return fmt.Errorf("%s must be a JSON object of group to integer quota", key)
		}
		for group, quota := range groupQuota {
			if strings.TrimSpace(group) == "" {
				return fmt.Errorf("%s contains an empty group name", key)
			}
			if quota < 0 || quota > int64(common.MaxWalletQuota) {
				return fmt.Errorf("%s: quota for group %q must be between 0 and %d", key, group, common.MaxWalletQuota)
			}
		}
	case QuotaRefillLastPeriodOptionKey:
		if value == "" {
			return nil
		}
		if _, err := time.Parse(QuotaRefillPeriodLayout, value); err != nil {
			return fmt.Errorf("%s must be empty or formatted as YYYY-MM", key)
		}
	}
	return nil
}
