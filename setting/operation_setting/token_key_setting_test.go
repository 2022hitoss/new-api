package operation_setting

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateTokenKeyOption(t *testing.T) {
	for _, tc := range []struct {
		name    string
		key     string
		value   string
		wantErr bool
	}{
		{name: "other keys are ignored", key: "token_key_setting.other", value: "!!!", wantErr: false},
		{name: "empty prefix disables the feature", key: TokenKeyCustomPrefixOptionKey, value: "", wantErr: false},
		{name: "letters digits and underscore are accepted", key: TokenKeyCustomPrefixOptionKey, value: "Team_01", wantErr: false},
		{name: "32 characters are accepted", key: TokenKeyCustomPrefixOptionKey, value: "abcdefghijklmnopqrstuvwxyz012345", wantErr: false},
		{name: "33 characters are rejected", key: TokenKeyCustomPrefixOptionKey, value: "abcdefghijklmnopqrstuvwxyz0123456", wantErr: true},
		{name: "hyphen is rejected because it separates the channel id", key: TokenKeyCustomPrefixOptionKey, value: "ab-cd", wantErr: true},
		{name: "spaces are rejected", key: TokenKeyCustomPrefixOptionKey, value: "ab cd", wantErr: true},
		{name: "sk marker is not allowed inside the prefix", key: TokenKeyCustomPrefixOptionKey, value: "sk-abcd", wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateTokenKeyOption(tc.key, tc.value)
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			assert.NoError(t, err)
		})
	}
}

func TestGenerateTokenKeyAppliesConfiguredPrefix(t *testing.T) {
	previous := tokenKeySetting.CustomPrefix
	t.Cleanup(func() { tokenKeySetting.CustomPrefix = previous })

	randomPart := regexp.MustCompile(`^[A-Za-z0-9]{48}$`)

	tokenKeySetting.CustomPrefix = ""
	key, err := GenerateTokenKey()
	require.NoError(t, err)
	assert.Regexp(t, randomPart, key, "an empty prefix keeps the legacy 48-character key")

	tokenKeySetting.CustomPrefix = "abcd"
	key, err = GenerateTokenKey()
	require.NoError(t, err)
	require.Len(t, key, len("abcd-")+48)
	assert.Equal(t, "abcd-", key[:5])
	assert.Regexp(t, randomPart, key[5:], "the random part keeps its full length after the prefix")
}
