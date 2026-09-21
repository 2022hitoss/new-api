package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetUserUsageStats returns per-user consume totals (requests, tokens, quota)
// inside the optional [start_timestamp, end_timestamp] range. Admin only.
func GetUserUsageStats(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if startTimestamp < 0 || endTimestamp < 0 {
		common.ApiErrorMsg(c, "invalid time range")
		return
	}
	if startTimestamp != 0 && endTimestamp != 0 && endTimestamp < startTimestamp {
		common.ApiErrorMsg(c, "end_timestamp must not be earlier than start_timestamp")
		return
	}
	stats, err := model.GetUserUsageStats(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stats)
}
