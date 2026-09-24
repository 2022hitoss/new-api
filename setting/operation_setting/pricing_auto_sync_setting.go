package operation_setting

import (
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const (
	PricingAutoSyncSettingName = "pricing_auto_sync_setting"

	PricingAutoSyncIntervalOptionKey = PricingAutoSyncSettingName + ".interval_minutes"
	PricingAutoSyncSourcesOptionKey  = PricingAutoSyncSettingName + ".sources"

	PricingAutoSyncMinIntervalMinutes = 10
	PricingAutoSyncMaxIntervalMinutes = 7 * 24 * 60
	PricingAutoSyncMaxSources         = 20
)

// PricingAutoSyncSource is one upstream the scheduled price sync reads from.
// ID is a channel id, or one of the negative built-in preset ids exposed by
// GET /api/ratio_sync/channels. Endpoint uses the same values as the manual
// upstream sync dialog; empty means the default for that source.
type PricingAutoSyncSource struct {
	ID       int    `json:"id"`
	Endpoint string `json:"endpoint"`
}

// PricingAutoSyncSetting configures the scheduled upstream price sync. Sources
// are ordered by priority: for each model the first source with a trusted
// price wins, and that price overwrites the local configuration.
type PricingAutoSyncSetting struct {
	Enabled         bool                    `json:"enabled"`
	IntervalMinutes int                     `json:"interval_minutes"`
	Sources         []PricingAutoSyncSource `json:"sources"`
}

var pricingAutoSyncSetting = PricingAutoSyncSetting{
	IntervalMinutes: 360,
	Sources:         []PricingAutoSyncSource{},
}

func init() {
	config.GlobalConfig.Register(PricingAutoSyncSettingName, &pricingAutoSyncSetting)
}

// GetPricingAutoSyncSetting returns a snapshot so a running sync never sees a
// source list that is replaced halfway through by an option update.
func GetPricingAutoSyncSetting() PricingAutoSyncSetting {
	snapshot := pricingAutoSyncSetting
	snapshot.Sources = slices.Clone(pricingAutoSyncSetting.Sources)
	return snapshot
}

// ValidatePricingAutoSyncOption rejects invalid values before they are
// persisted; the generic config loader silently ignores malformed values.
func ValidatePricingAutoSyncOption(key, value string) error {
	switch key {
	case PricingAutoSyncIntervalOptionKey:
		minutes, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || minutes < PricingAutoSyncMinIntervalMinutes || minutes > PricingAutoSyncMaxIntervalMinutes {
			return fmt.Errorf("%s must be an integer between %d and %d", key, PricingAutoSyncMinIntervalMinutes, PricingAutoSyncMaxIntervalMinutes)
		}
	case PricingAutoSyncSourcesOptionKey:
		var sources []PricingAutoSyncSource
		if err := common.UnmarshalJsonStr(value, &sources); err != nil {
			return fmt.Errorf("%s must be a JSON array of {id, endpoint}", key)
		}
		if len(sources) > PricingAutoSyncMaxSources {
			return fmt.Errorf("%s allows at most %d sources", key, PricingAutoSyncMaxSources)
		}
		seen := make(map[int]bool, len(sources))
		for _, source := range sources {
			if source.ID == 0 {
				return fmt.Errorf("%s contains a source without an id", key)
			}
			if seen[source.ID] {
				return fmt.Errorf("%s contains source %d more than once", key, source.ID)
			}
			seen[source.ID] = true
			endpoint := strings.TrimSpace(source.Endpoint)
			if endpoint != "" && endpoint != "openrouter" && !strings.HasPrefix(endpoint, "/") &&
				!strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
				return fmt.Errorf("%s: endpoint %q of source %d must be empty, openrouter, a path or an http(s) URL", key, source.Endpoint, source.ID)
			}
		}
	}
	return nil
}
