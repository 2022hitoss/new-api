package operation_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// ServiceTierPolicySetting holds the gateway-wide rules for the service_tier
// request field. It is edited through the request policy settings API.
type ServiceTierPolicySetting struct {
	// RejectEnabled rejects a request before channel selection when its
	// service_tier is listed in BlockedTiers.
	RejectEnabled bool `json:"reject_enabled"`
	// BlockedTiers lists one tier per line. Matching ignores case and
	// surrounding whitespace. Codex CLI sends "priority" for its Fast mode and
	// OpenAI treats "fast" and "priority" as the same tier.
	BlockedTiers string `json:"blocked_tiers"`
}

var serviceTierPolicySetting = ServiceTierPolicySetting{
	RejectEnabled: false,
	BlockedTiers:  "fast\npriority",
}

func init() {
	config.GlobalConfig.Register("service_tier_policy", &serviceTierPolicySetting)
}

func GetServiceTierPolicySetting() *ServiceTierPolicySetting {
	return &serviceTierPolicySetting
}

// IsBlocked reports whether the tier requested by the client is in the blocked
// list. An empty or absent tier is never blocked.
func (s *ServiceTierPolicySetting) IsBlocked(tier string) bool {
	tier = strings.ToLower(strings.TrimSpace(tier))
	if tier == "" {
		return false
	}
	for blocked := range strings.SplitSeq(s.BlockedTiers, "\n") {
		if strings.ToLower(strings.TrimSpace(blocked)) == tier {
			return true
		}
	}
	return false
}
