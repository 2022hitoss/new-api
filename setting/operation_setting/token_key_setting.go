package operation_setting

import (
	"fmt"
	"regexp"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const (
	TokenKeySettingName = "token_key_setting"

	TokenKeyCustomPrefixOptionKey = TokenKeySettingName + ".custom_prefix"

	tokenKeyCustomPrefixMaxLength = 32
)

// tokenKeyCustomPrefixPattern limits the prefix to characters that cannot be
// confused with the "sk-" marker or the "-<channel id>" suffix an admin may
// append to a key. The token key column is varchar(128), so a 32-character
// prefix plus the 48-character random part always fits.
var tokenKeyCustomPrefixPattern = regexp.MustCompile(`^[A-Za-z0-9_]*$`)

// TokenKeySetting controls the shape of newly generated API token keys. It is
// edited through the site settings page.
type TokenKeySetting struct {
	// CustomPrefix is inserted between "sk-" and the random part of every new
	// token key, producing "sk-<prefix>-<random>". Empty keeps the plain
	// "sk-<random>" shape. Existing keys are never rewritten.
	CustomPrefix string `json:"custom_prefix"`
}

var tokenKeySetting = TokenKeySetting{}

func init() {
	config.GlobalConfig.Register(TokenKeySettingName, &tokenKeySetting)
}

func GetTokenKeySetting() *TokenKeySetting {
	return &tokenKeySetting
}

// ValidateTokenKeyOption rejects a malformed prefix before it is persisted, so
// a bad value never reaches the option table or the running setting.
func ValidateTokenKeyOption(key, value string) error {
	if key != TokenKeyCustomPrefixOptionKey {
		return nil
	}
	if len(value) > tokenKeyCustomPrefixMaxLength {
		return fmt.Errorf("%s must be at most %d characters", key, tokenKeyCustomPrefixMaxLength)
	}
	if !tokenKeyCustomPrefixPattern.MatchString(value) {
		return fmt.Errorf("%s may only contain letters, digits and underscores", key)
	}
	return nil
}

// GenerateTokenKey returns the stored form of a new API token key. The value
// is shown to users as "sk-" + key, so the configured prefix becomes visible
// as "sk-<prefix>-<random>".
func GenerateTokenKey() (string, error) {
	randomPart, err := common.GenerateKey()
	if err != nil {
		return "", err
	}
	prefix := GetTokenKeySetting().CustomPrefix
	if prefix == "" {
		return randomPart, nil
	}
	return prefix + "-" + randomPart, nil
}
