package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
)

func TestPricingSyncExpressionPriority(t *testing.T) {
	expression := `tier("base", p * 2 + c * 8 + cr * 0)`
	cases := []struct {
		name       string
		local      map[string]any
		source     map[string]any
		wantFields []string
	}{
		{"equal expressions suppress stale ratios", map[string]any{"billing_mode": map[string]string{"m": "tiered_expr"}, "billing_expr": map[string]string{"m": expression}}, map[string]any{"billing_mode": map[string]string{"m": "tiered_expr"}, "billing_expr": map[string]string{"m": expression}, "model_ratio": map[string]float64{"m": 3}, "model_price": map[string]float64{"m": 2}}, nil},
		{"local expression excludes legacy-only source", map[string]any{"billing_mode": map[string]string{"m": "tiered_expr"}, "billing_expr": map[string]string{"m": expression}}, map[string]any{"model_ratio": map[string]float64{"m": 3}, "completion_ratio": map[string]float64{"m": 2}}, nil},
		{"expression imports without legacy conflicts", map[string]any{"model_ratio": map[string]float64{"m": 1}}, map[string]any{"billing_mode": map[string]string{"m": "tiered_expr"}, "billing_expr": map[string]string{"m": expression}, "model_ratio": map[string]float64{"m": 3}, "model_price": map[string]float64{"m": 2}}, []string{"billing_mode", "billing_expr"}},
		{"inactive expression follows explicit ratio mode", map[string]any{"model_ratio": map[string]float64{"m": 1}}, map[string]any{"billing_mode": map[string]string{"m": "ratio"}, "billing_expr": map[string]string{"m": expression}, "model_ratio": map[string]float64{"m": 3}}, []string{"model_ratio"}},
		{"empty active expression never imports a false free price", map[string]any{}, map[string]any{"billing_mode": map[string]string{"m": "tiered_expr"}, "billing_expr": map[string]string{"m": " "}, "model_ratio": map[string]float64{"m": 0}}, nil},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			diff := buildDifferences(tt.local, []struct {
				name string
				data map[string]any
			}{{"source", tt.source}})
			fields := make([]string, 0, len(diff["m"]))
			for field := range diff["m"] {
				fields = append(fields, field)
			}
			assert.ElementsMatch(t, tt.wantFields, fields)
		})
	}
}

func TestRatioConfigExportsEffectiveExpressions(t *testing.T) {
	before := config.GlobalConfig.ExportAllConfigs()
	expose := ratio_setting.IsExposeRatioEnabled()
	t.Cleanup(func() {
		config.UpdateConfigFromMap(config.GlobalConfig.Get("billing_setting"), map[string]string{"billing_mode": before["billing_setting.billing_mode"], "billing_expr": before["billing_setting.billing_expr"]})
		ratio_setting.SetExposeRatioEnabled(expose)
	})
	config.UpdateConfigFromMap(config.GlobalConfig.Get("billing_setting"), map[string]string{"billing_mode": `{"sync-export":"tiered_expr"}`, "billing_expr": `{"sync-export":"tier(\"base\", p * 2)"}`})
	ratio_setting.SetExposeRatioEnabled(true)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/ratio_config", nil)
	GetRatioConfig(c)
	var response struct {
		Success bool
		Data    map[string]any
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.Equal(t, billing_setting.BillingModeTieredExpr, valueMap(response.Data["billing_mode"])["sync-export"])
	assert.Equal(t, `tier("base", p * 2)`, valueMap(response.Data["billing_expr"])["sync-export"])
}

func TestPricingSyncCompleteSourcesAndArrayFormats(t *testing.T) {
	before := config.GlobalConfig.ExportAllConfigs()
	oldRatios, oldCompletion := ratio_setting.ModelRatio2JSONString(), ratio_setting.CompletionRatio2JSONString()
	t.Cleanup(func() {
		config.UpdateConfigFromMap(config.GlobalConfig.Get("billing_setting"), map[string]string{"billing_mode": before["billing_setting.billing_mode"], "billing_expr": before["billing_setting.billing_expr"]})
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(oldRatios))
		require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(oldCompletion))
	})
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"sync-token":1}`))
	require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{"sync-token":2}`))
	expression := `len <= 200000 ? tier("short", p * 2 + c * 8 + cr * 0) : tier("long", p * 4 + c * 12)`
	expressions, err := common.Marshal(map[string]string{"sync-already": expression})
	require.NoError(t, err)
	config.UpdateConfigFromMap(config.GlobalConfig.Get("billing_setting"), map[string]string{"billing_mode": `{"sync-already":"tiered_expr"}`, "billing_expr": string(expressions)})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var data any
		if r.URL.Path == "/ratio_config" {
			data = map[string]any{
				"billing_mode":     map[string]string{"sync-already": "tiered_expr", "sync-expression": "tiered_expr"},
				"billing_expr":     map[string]string{"sync-already": expression, "sync-expression": expression},
				"model_ratio":      map[string]float64{"sync-already": 9, "sync-expression": 9, "sync-token": 1},
				"model_price":      map[string]float64{"sync-expression": 4},
				"completion_ratio": map[string]float64{"sync-token": 4},
				"cache_ratio":      map[string]float64{"sync-token": 0},
			}
		} else {
			data = []map[string]any{
				{"model_name": "sync-already", "model_ratio": 5, "completion_ratio": 3},
				{"model_name": "sync-expression", "model_ratio": 2, "model_price": 1},
				{"model_name": "sync-array-expression", "billing_mode": "tiered_expr", "billing_expr": expression, "quota_type": 1, "model_price": 0},
				{"model_name": "sync-unpriced"},
				{"model_name": "sync-invalid-expression", "billing_mode": "tiered_expr", "billing_expr": "", "model_ratio": 0},
				{"model_name": "sync-free", "model_ratio": 0, "completion_ratio": 0},
			}
		}
		encoded, err := common.Marshal(map[string]any{"success": true, "data": data})
		require.NoError(t, err)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(encoded)
	}))
	defer server.Close()
	var response struct {
		Success bool
		Data    struct {
			Differences map[string]map[string]dto.DifferenceItem
			Prices      map[string]struct {
				Current   map[string]any
				Upstreams map[string]map[string]any
			}
			TestResults []dto.TestResult `json:"test_results"`
		}
	}
	body := map[string]any{"upstreams": []map[string]any{
		{"id": 1, "name": "Expressions", "base_url": server.URL, "endpoint": "/ratio_config"},
		{"id": 2, "name": "Legacy", "base_url": server.URL, "endpoint": "/pricing"},
	}}
	recorder := modelManagementRequest(t, FetchUpstreamRatios, http.MethodPost, "/api/channel/fetch_upstream_ratios", body, &response)
	require.True(t, response.Success, recorder.Body.String())
	require.Len(t, response.Data.TestResults, 2)
	for _, result := range response.Data.TestResults {
		require.Equal(t, "success", result.Status, result.Error)
	}
	assert.NotContains(t, response.Data.Differences, "sync-already")
	assert.NotContains(t, response.Data.Differences, "sync-unpriced")
	assert.NotContains(t, response.Data.Differences, "sync-invalid-expression")
	assert.Equal(t, map[string]any{"billing_mode": "tiered_expr", "billing_expr": expression}, response.Data.Prices["sync-expression"].Upstreams["Expressions(1)"])
	assert.NotContains(t, response.Data.Prices["sync-expression"].Upstreams, "Legacy(2)")
	assert.Equal(t, map[string]any{"billing_mode": "tiered_expr", "billing_expr": expression}, response.Data.Prices["sync-array-expression"].Upstreams["Legacy(2)"])
	assert.Equal(t, float64(1), response.Data.Prices["sync-token"].Upstreams["Expressions(1)"]["model_ratio"], "unchanged base prices are included for a complete price preview")
	assert.Equal(t, float64(4), response.Data.Prices["sync-token"].Upstreams["Expressions(1)"]["completion_ratio"])
	assert.Equal(t, float64(0), response.Data.Prices["sync-token"].Upstreams["Expressions(1)"]["cache_ratio"])
	assert.Equal(t, float64(0), response.Data.Prices["sync-free"].Upstreams["Legacy(2)"]["model_ratio"])
}

func TestPlanPricingAutoSync(t *testing.T) {
	before := config.GlobalConfig.ExportAllConfigs()
	t.Cleanup(func() {
		config.UpdateConfigFromMap(config.GlobalConfig.Get("billing_setting"), map[string]string{"plugin_billing_expr": before["billing_setting.plugin_billing_expr"]})
	})
	pluginExpr := `tier("base", p * 1)`
	config.UpdateConfigFromMap(config.GlobalConfig.Get("billing_setting"), map[string]string{"plugin_billing_expr": `{"legacy-plugin::plugin-model":"tier(\"base\", p * 1)"}`})
	expression := `tier("base", p * 2 + c * 8)`

	local := map[string]any{
		"model_ratio":      map[string]float64{"priced": 1, "same": 2, "plugin-model": 1},
		"completion_ratio": map[string]float64{"same": 3},
	}
	results := []upstreamResult{
		{Name: "down(3)", Err: "502 Bad Gateway"},
		{Name: "first(1)", Data: map[string]any{
			"model_ratio":      map[string]float64{"priced": 5, "same": 2, "untrusted": 37.5, "upstream-only": 1},
			"completion_ratio": map[string]float64{"priced": 2, "same": 3, "untrusted": 1},
			"billing_mode":     map[string]string{"expr": "tiered_expr", "bad-expr": "tiered_expr"},
			"billing_expr":     map[string]string{"expr": expression, "bad-expr": "tier("},
		}},
		{Name: "second(2)", Data: map[string]any{
			"model_price":      map[string]float64{"new-model": 0.05},
			"model_ratio":      map[string]float64{"priced": 9, "untrusted": 4, "plugin-model": 3},
			"completion_ratio": map[string]float64{"untrusted": 2},
		}},
	}
	snapshot := &model.ModelPricingSnapshot{EmptyVersion: "empty", Entries: []model.ModelPricingEntry{
		{ModelName: "priced", Version: "v-priced", Configured: model.PricingValues{"ModelRatio": float64(1)}},
		{ModelName: "plugin-model", Version: "v-plugin", Configured: model.PricingValues{
			"ModelRatio": float64(1), billing_setting.PluginBillingExprOption: map[string]any{"legacy-plugin": pluginExpr},
		}},
	}}
	models := []string{"new-model", "priced", "same", "untrusted", "expr", "bad-expr", "plugin-model", "no-source", "priced"}

	changes, summary := planPricingAutoSync(snapshot, local, results, models)

	got := make(map[string]model.ModelPricingChange, len(changes))
	for _, change := range changes {
		got[change.ModelName] = change
	}
	assert.Equal(t, map[string]model.ModelPricingChange{
		"new-model": {ModelName: "new-model", ExpectedVersion: "empty", Pricing: model.PricingValues{
			"billing_setting.billing_mode": "ratio", "ModelPrice": 0.05}},
		"priced": {ModelName: "priced", ExpectedVersion: "v-priced", Pricing: model.PricingValues{
			"billing_setting.billing_mode": "ratio", "ModelRatio": float64(5), "CompletionRatio": float64(2)}},
		"untrusted": {ModelName: "untrusted", ExpectedVersion: "empty", Pricing: model.PricingValues{
			"billing_setting.billing_mode": "ratio", "ModelRatio": float64(4), "CompletionRatio": float64(2)}},
		"expr": {ModelName: "expr", ExpectedVersion: "empty", Pricing: model.PricingValues{
			"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expression}},
		"plugin-model": {ModelName: "plugin-model", ExpectedVersion: "v-plugin", Pricing: model.PricingValues{
			"billing_setting.billing_mode": "ratio", "ModelRatio": float64(3),
			billing_setting.PluginBillingExprOption: map[string]any{"legacy-plugin": pluginExpr}}},
	}, got, "same price is skipped, first trusted source wins, upstream-only models are ignored")
	assert.Equal(t, map[string]string{"new-model": "second(2)", "priced": "first(1)", "untrusted": "second(2)", "expr": "first(1)", "plugin-model": "second(2)"}, summary.Updated)
	assert.Contains(t, summary.Invalid, "bad-expr")
	assert.Equal(t, []string{"no-source"}, summary.Unpriced)
	assert.Equal(t, []dto.TestResult{
		{Name: "down(3)", Status: "error", Error: "502 Bad Gateway"},
		{Name: "first(1)", Status: "success"},
		{Name: "second(2)", Status: "success"},
	}, summary.Sources)
}

func TestValidatePricingAutoSyncOption(t *testing.T) {
	cases := []struct {
		key, value string
		valid      bool
	}{
		{operation_setting.PricingAutoSyncIntervalOptionKey, "10", true},
		{operation_setting.PricingAutoSyncIntervalOptionKey, "9", false},
		{operation_setting.PricingAutoSyncIntervalOptionKey, "10081", false},
		{operation_setting.PricingAutoSyncIntervalOptionKey, "abc", false},
		{operation_setting.PricingAutoSyncSourcesOptionKey, `[]`, true},
		{operation_setting.PricingAutoSyncSourcesOptionKey, `[{"id":-100,"endpoint":""},{"id":3,"endpoint":"openrouter"},{"id":4,"endpoint":"/api/ratio_config"},{"id":5,"endpoint":"https://example.com/p.json"}]`, true},
		{operation_setting.PricingAutoSyncSourcesOptionKey, `[{"id":3},{"id":3}]`, false},
		{operation_setting.PricingAutoSyncSourcesOptionKey, `[{"id":0}]`, false},
		{operation_setting.PricingAutoSyncSourcesOptionKey, `[{"id":3,"endpoint":"ftp://x"}]`, false},
		{operation_setting.PricingAutoSyncSourcesOptionKey, `{"id":3}`, false},
	}
	for _, tt := range cases {
		err := operation_setting.ValidatePricingAutoSyncOption(tt.key, tt.value)
		assert.Equal(t, tt.valid, err == nil, "%s=%s: %v", tt.key, tt.value, err)
	}
}
