package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
)

// UserUsageStat is the aggregated consume usage of one user within a time range.
type UserUsageStat struct {
	UserId           int    `json:"user_id" gorm:"column:user_id"`
	Username         string `json:"username" gorm:"column:username"`
	RequestCount     int64  `json:"request_count" gorm:"column:request_count"`
	PromptTokens     int64  `json:"prompt_tokens" gorm:"column:prompt_tokens"`
	CompletionTokens int64  `json:"completion_tokens" gorm:"column:completion_tokens"`
	TotalTokens      int64  `json:"total_tokens" gorm:"column:total_tokens"`
	Quota            int64  `json:"quota" gorm:"column:quota"`
}

// GetUserUsageStats sums consume logs per user inside [startTimestamp, endTimestamp]
// (unix seconds, both ends inclusive). A zero bound leaves that side unbounded.
// Rows are grouped by user_id so a renamed user still yields a single row; the
// latest username is reported via MAX(username). Only LogTypeConsume rows count.
func GetUserUsageStats(startTimestamp int64, endTimestamp int64) ([]UserUsageStat, error) {
	tx := LOG_DB.Table("logs").
		Select("user_id, "+
			"MAX(username) AS username, "+
			"COUNT(*) AS request_count, "+
			"COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens, "+
			"COALESCE(SUM(completion_tokens), 0) AS completion_tokens, "+
			"COALESCE(SUM(prompt_tokens), 0) + COALESCE(SUM(completion_tokens), 0) AS total_tokens, "+
			"COALESCE(SUM(quota), 0) AS quota").
		Where("type = ?", LogTypeConsume)
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}

	stats := make([]UserUsageStat, 0)
	if err := tx.Group("user_id").Order("user_id").Scan(&stats).Error; err != nil {
		common.SysError("failed to query user usage stats: " + err.Error())
		return nil, errors.New("查询用户用量统计失败")
	}
	return stats, nil
}
