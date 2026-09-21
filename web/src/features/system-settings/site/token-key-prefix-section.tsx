/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { zodResolver } from '@hookform/resolvers/zod'
import i18next from 'i18next'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const TOKEN_KEY_CUSTOM_PREFIX_OPTION_KEY = 'token_key_setting.custom_prefix'

const CUSTOM_PREFIX_MAX_LENGTH = 32
const RANDOM_PART_PLACEHOLDER = 'xxxxxxxxxxxxxxxxxxxxxxxx'

// Mirrors ValidateTokenKeyOption on the server: hyphens are excluded because
// the gateway uses "-<channel id>" as an admin-only suffix on keys.
const tokenKeyPrefixSchema = z.object({
  customPrefix: z
    .string()
    .trim()
    .max(CUSTOM_PREFIX_MAX_LENGTH, {
      error: () =>
        i18next.t('Must be at most {{count}} characters', {
          count: CUSTOM_PREFIX_MAX_LENGTH,
        }),
    })
    .regex(/^[A-Za-z0-9_]*$/, {
      error: () =>
        i18next.t('Only letters, digits and underscores are allowed'),
    }),
})

type TokenKeyPrefixFormValues = z.infer<typeof tokenKeyPrefixSchema>

type TokenKeyPrefixSectionProps = {
  defaultValue: string
}

export function TokenKeyPrefixSection(props: TokenKeyPrefixSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<TokenKeyPrefixFormValues>({
    resolver: zodResolver(tokenKeyPrefixSchema),
    defaultValues: { customPrefix: props.defaultValue ?? '' },
  })

  useEffect(() => {
    form.reset({ customPrefix: props.defaultValue ?? '' })
  }, [props.defaultValue, form])

  const onSubmit = async (values: TokenKeyPrefixFormValues) => {
    if (values.customPrefix === (props.defaultValue ?? '')) {
      return
    }
    await updateOption.mutateAsync({
      key: TOKEN_KEY_CUSTOM_PREFIX_OPTION_KEY,
      value: values.customPrefix,
    })
  }

  const previewPrefix = (form.watch('customPrefix') ?? '').trim()
  const preview =
    previewPrefix === ''
      ? `sk-${RANDOM_PART_PLACEHOLDER}`
      : `sk-${previewPrefix}-${RANDOM_PART_PLACEHOLDER}`

  return (
    <SettingsSection title={t('API key format')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Controls the shape of API keys that users generate. Keys that already exist are not changed.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          <FormField
            control={form.control}
            name='customPrefix'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Custom key prefix')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('e.g. abcd')}
                    maxLength={CUSTOM_PREFIX_MAX_LENGTH}
                    autoComplete='off'
                    spellCheck={false}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Inserted between "sk-" and the random part of every newly generated key. Letters, digits and underscores only, up to 32 characters. Leave blank to keep the default "sk-" format.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='flex flex-col gap-1'>
            <span className='text-sm font-medium'>
              {t('Preview of new keys')}
            </span>
            <code
              data-testid='token-key-preview'
              className='bg-muted w-fit rounded-md px-2 py-1 font-mono text-sm break-all'
            >
              {preview}
            </code>
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
