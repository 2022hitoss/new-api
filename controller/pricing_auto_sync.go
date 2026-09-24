package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

const (
	officialRatioPresetEndpoint = "/llm-metadata/api/newapi/ratio_config-v1-base.json"
	modelsDevPresetEndpoint     = "https://models.dev/api.json"
)

// pricingSyncOptionKeys maps upstream sync fields to model pricing option keys.
var pricingSyncOptionKeys = map[string]string{
	"model_ratio":            "ModelRatio",
	"completion_ratio":       "CompletionRatio",
	"cache_ratio":            "CacheRatio",
	"create_cache_ratio":     "CreateCacheRatio",
	"image_ratio":            "ImageRatio",
	"audio_ratio":            "AudioRatio",
	"audio_completion_ratio": "AudioCompletionRatio",
	"model_price":            "ModelPrice",
}

type pricingAutoSyncSummary struct {
	Sources []dto.TestResult `json:"sources"`
	// Updated maps each changed model to the source whose price was applied.
	Updated map[string]string `json:"updated"`
	// Invalid maps models whose upstream price failed validation to the reason.
	Invalid map[string]string `json:"invalid,omitempty"`
	// Unpriced lists enabled models that no source has a trusted price for.
	Unpriced []string `json:"unpriced,omitempty"`
}

// pricingAutoSyncHandler applies upstream prices to every model served by an
// enabled channel on the configured interval. Sources are ordered by priority
// and the chosen upstream price overwrites the local configuration.
type pricingAutoSyncHandler struct{}

func (pricingAutoSyncHandler) Type() string { return model.SystemTaskTypePricingAutoSync }

func (pricingAutoSyncHandler) Enabled() bool {
	setting := operation_setting.GetPricingAutoSyncSetting()
	return setting.Enabled && len(setting.Sources) > 0
}

func (pricingAutoSyncHandler) Interval() time.Duration {
	minutes := max(operation_setting.GetPricingAutoSyncSetting().IntervalMinutes, operation_setting.PricingAutoSyncMinIntervalMinutes)
	return time.Duration(minutes) * time.Minute
}

func (pricingAutoSyncHandler) NewPayload() any { return nil }

func (pricingAutoSyncHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	summary, err := runPricingAutoSync(ctx)
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, summary, err)
		return
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

// TriggerPricingAutoSync enqueues an immediate run with the saved sources,
// independent of whether the schedule is enabled.
func TriggerPricingAutoSync(c *gin.Context) {
	if len(operation_setting.GetPricingAutoSyncSetting().Sources) == 0 {
		common.ApiErrorI18n(c, i18n.MsgPricingSyncNoSources)
		return
	}
	task, created, err := service.EnqueueSystemTask(model.SystemTaskTypePricingAutoSync, nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !created {
		c.JSON(http.StatusConflict, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgPricingSyncTaskRunning),
			"data":    gin.H{"task_id": task.TaskID, "status": task.Status, "type": task.Type},
		})
		return
	}
	common.ApiSuccess(c, gin.H{"task_id": task.TaskID, "status": task.Status})
}

func runPricingAutoSync(ctx context.Context) (*pricingAutoSyncSummary, error) {
	setting := operation_setting.GetPricingAutoSyncSetting()
	if len(setting.Sources) == 0 {
		return nil, errors.New("no price sync sources are configured")
	}
	upstreams, unresolved, err := resolveSyncUpstreams(setting.Sources)
	if err != nil {
		return nil, err
	}
	results := fetchUpstreamPricing(ctx, upstreams, defaultTimeoutSeconds)
	models := model.GetEnabledModels()
	snapshot, err := model.GetModelPricingSnapshot(models)
	if err != nil {
		return nil, err
	}
	changes, summary := planPricingAutoSync(snapshot, getLocalPricingSyncData(), results, models)
	summary.Sources = append(unresolved, summary.Sources...)
	if !slices.ContainsFunc(summary.Sources, func(result dto.TestResult) bool { return result.Status == "success" }) {
		return summary, errors.New("every price sync source failed")
	}
	if len(changes) == 0 {
		return summary, nil
	}
	if err := model.UpdateModelPricing(changes); err != nil {
		return summary, err
	}
	common.SysLog(fmt.Sprintf("pricing auto sync updated %d models", len(changes)))
	return summary, nil
}

// resolveSyncUpstreams turns configured sources into fetchable upstreams in
// priority order. Sources that no longer resolve are reported as errors.
func resolveSyncUpstreams(sources []operation_setting.PricingAutoSyncSource) ([]dto.UpstreamDTO, []dto.TestResult, error) {
	var channelIDs []int
	for _, source := range sources {
		if source.ID > 0 {
			channelIDs = append(channelIDs, source.ID)
		}
	}
	channels := make(map[int]*model.Channel)
	if len(channelIDs) > 0 {
		found, err := model.GetChannelsByIds(channelIDs)
		if err != nil {
			return nil, nil, err
		}
		for _, channel := range found {
			channels[channel.Id] = channel
		}
	}
	var upstreams []dto.UpstreamDTO
	var unresolved []dto.TestResult
	for _, source := range sources {
		endpoint := strings.TrimSpace(source.Endpoint)
		switch source.ID {
		case officialRatioPresetID:
			upstreams = append(upstreams, dto.UpstreamDTO{ID: source.ID, Name: officialRatioPresetName, BaseURL: officialRatioPresetBaseURL,
				Endpoint: lo.Ternary(endpoint == "", officialRatioPresetEndpoint, endpoint)})
			continue
		case modelsDevPresetID:
			upstreams = append(upstreams, dto.UpstreamDTO{ID: source.ID, Name: modelsDevPresetName, BaseURL: modelsDevPresetBaseURL,
				Endpoint: lo.Ternary(endpoint == "", modelsDevPresetEndpoint, endpoint)})
			continue
		}
		channel, ok := channels[source.ID]
		if !ok {
			unresolved = append(unresolved, dto.TestResult{Name: fmt.Sprintf("channel(%d)", source.ID), Status: "error", Error: "channel not found"})
			continue
		}
		base := strings.TrimRight(channel.GetBaseURL(), "/")
		if !strings.HasPrefix(base, "http") {
			unresolved = append(unresolved, dto.TestResult{Name: fmt.Sprintf("%s(%d)", channel.Name, channel.Id), Status: "error", Error: "channel has no http base URL"})
			continue
		}
		if endpoint == "" && channel.Type == constant.ChannelTypeOpenRouter {
			endpoint = "openrouter"
		}
		upstreams = append(upstreams, dto.UpstreamDTO{ID: channel.Id, Name: channel.Name, BaseURL: base, Endpoint: endpoint})
	}
	return upstreams, unresolved, nil
}

// planPricingAutoSync picks, for every enabled model, the price of the first
// source (in priority order) that has a trusted price, and returns a change for
// each model whose local price differs. Changes that fail validation are
// dropped and reported so one bad upstream entry cannot block the batch.
func planPricingAutoSync(snapshot *model.ModelPricingSnapshot, localData map[string]any, results []upstreamResult, models []string) ([]model.ModelPricingChange, *pricingAutoSyncSummary) {
	summary := &pricingAutoSyncSummary{Sources: []dto.TestResult{}, Updated: map[string]string{}, Invalid: map[string]string{}}
	var sources []upstreamResult
	for _, result := range results {
		if result.Err != "" {
			summary.Sources = append(summary.Sources, dto.TestResult{Name: result.Name, Status: "error", Error: result.Err})
			continue
		}
		summary.Sources = append(summary.Sources, dto.TestResult{Name: result.Name, Status: "success"})
		sources = append(sources, upstreamResult{Name: result.Name, Data: effectivePricingSyncData(result.Data)})
	}
	local := effectivePricingSyncData(localData)
	entries := make(map[string]model.ModelPricingEntry, len(snapshot.Entries))
	for _, entry := range snapshot.Entries {
		entries[entry.ModelName] = entry
	}

	names := slices.Clone(models)
	slices.Sort(names)
	names = slices.Compact(names)
	var changes []model.ModelPricingChange
	for _, name := range names {
		var candidate map[string]any
		var sourceName string
		for _, source := range sources {
			values := modelPricingSyncValues(source.Data, name)
			_, hasRatio := values["model_ratio"]
			_, hasPrice := values["model_price"]
			_, hasExpression := values[billing_setting.BillingExprField]
			if !hasRatio && !hasPrice && !hasExpression {
				continue
			}
			// Same rule as buildDifferences: 37.5 / 1 is the placeholder an
			// unpriced self-use deployment exposes, not a real price.
			ratio, _ := values["model_ratio"].(float64)
			completion, hasCompletion := values["completion_ratio"].(float64)
			if hasRatio && hasCompletion && nearlyEqual(ratio, 37.5) && nearlyEqual(completion, 1) {
				continue
			}
			candidate, sourceName = values, source.Name
			break
		}
		if candidate == nil {
			summary.Unpriced = append(summary.Unpriced, name)
			continue
		}
		current := modelPricingSyncValues(local, name)
		if len(current) == len(candidate) && !slices.ContainsFunc(pricingSyncFields, func(field string) bool {
			return !valuesEqual(current[field], candidate[field])
		}) {
			continue
		}

		entry, ok := entries[name]
		if !ok {
			entry = model.ModelPricingEntry{ModelName: name, Version: snapshot.EmptyVersion}
		}
		pricing := model.PricingValues{}
		if variants, exists := entry.Configured[billing_setting.PluginBillingExprOption]; exists {
			pricing[billing_setting.PluginBillingExprOption] = variants
		}
		if expression, ok := candidate[billing_setting.BillingExprField].(string); ok {
			pricing["billing_setting.billing_mode"] = billing_setting.BillingModeTieredExpr
			pricing["billing_setting.billing_expr"] = expression
		} else {
			pricing["billing_setting.billing_mode"] = billing_setting.BillingModeRatio
			for field, key := range pricingSyncOptionKeys {
				if value, exists := candidate[field]; exists {
					pricing[key] = value
				}
			}
		}
		if err := model.ValidateModelPricing(name, pricing); err != nil {
			summary.Invalid[name] = err.Error()
			continue
		}
		changes = append(changes, model.ModelPricingChange{ModelName: name, ExpectedVersion: entry.Version, Pricing: pricing})
		summary.Updated[name] = sourceName
	}
	return changes, summary
}
