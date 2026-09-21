package operation_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestServiceTierPolicySettingIsBlocked(t *testing.T) {
	for _, tc := range []struct {
		name    string
		blocked string
		tier    string
		want    bool
	}{
		{name: "default list blocks fast", blocked: "fast\npriority", tier: "fast", want: true},
		{name: "default list blocks priority sent by codex", blocked: "fast\npriority", tier: "priority", want: true},
		{name: "matching ignores case and whitespace", blocked: "fast\npriority", tier: "  PRIORITY ", want: true},
		{name: "list entries are trimmed", blocked: " fast \r\n priority ", tier: "fast", want: true},
		{name: "custom tier can be blocked", blocked: "flex", tier: "flex", want: true},
		{name: "other tiers pass", blocked: "fast\npriority", tier: "default", want: false},
		{name: "empty tier never blocked", blocked: "fast\npriority", tier: "", want: false},
		{name: "whitespace tier never blocked", blocked: "fast\npriority", tier: "  ", want: false},
		{name: "empty list blocks nothing", blocked: "", tier: "fast", want: false},
		{name: "blank lines do not match empty tier", blocked: "\n\n", tier: "", want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			policy := ServiceTierPolicySetting{RejectEnabled: true, BlockedTiers: tc.blocked}
			assert.Equal(t, tc.want, policy.IsBlocked(tc.tier))
		})
	}
}
