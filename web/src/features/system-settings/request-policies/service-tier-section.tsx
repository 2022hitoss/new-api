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
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import {
  SettingsForm,
  SettingsControlGroup,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import type { ServiceTierPolicySettings } from './defaults'
import { useSavePolicy } from './use-save-policy'

// react-hook-form reads dotted names as nested paths, so the flat option keys
// are mapped to a nested form shape and back when saving.
const serviceTierSchema = z.object({
  service_tier_policy: z.object({
    reject_enabled: z.boolean(),
    blocked_tiers: z.string(),
  }),
})

type ServiceTierFormValues = z.infer<typeof serviceTierSchema>

function toFormValues(
  settings: ServiceTierPolicySettings
): ServiceTierFormValues {
  return {
    service_tier_policy: {
      reject_enabled: settings['service_tier_policy.reject_enabled'],
      blocked_tiers: settings['service_tier_policy.blocked_tiers'],
    },
  }
}

function toOptionValues(
  values: ServiceTierFormValues
): ServiceTierPolicySettings {
  return {
    'service_tier_policy.reject_enabled':
      values.service_tier_policy.reject_enabled,
    'service_tier_policy.blocked_tiers':
      values.service_tier_policy.blocked_tiers,
  }
}

type ServiceTierSectionProps = {
  defaultValues: ServiceTierPolicySettings
}

export function ServiceTierSection(props: ServiceTierSectionProps) {
  const { t } = useTranslation()
  const updateOption = useSavePolicy()
  const defaultFormValues = useMemo(
    () => toFormValues(props.defaultValues),
    [props.defaultValues]
  )
  const form = useForm<ServiceTierFormValues>({
    resolver: zodResolver(serviceTierSchema),
    defaultValues: defaultFormValues,
  })

  useEffect(() => {
    form.reset(defaultFormValues)
  }, [defaultFormValues, form])

  const onSubmit = async (values: ServiceTierFormValues) => {
    const updates = Object.entries(toOptionValues(values)).filter(
      ([key, value]) =>
        value !== props.defaultValues[key as keyof ServiceTierPolicySettings]
    )

    try {
      if (updates.length > 0) {
        await updateOption.mutateAsync(
          Object.fromEntries(
            updates.map(([key, value]) => [key, String(value ?? '')])
          )
        )
      }
    } catch (error) {
      handleServerError(error)
    }
  }

  const isActive =
    form.watch('service_tier_policy.reject_enabled') &&
    form.watch('service_tier_policy.blocked_tiers').trim() !== ''

  return (
    <SettingsSection title={t('Service tier')}>
      <p className='text-muted-foreground text-sm'>
        {t('Source: global settings. Changes take effect after saving.')}
      </p>
      <h3 className='text-sm font-medium'>{t('Service tier restrictions')}</h3>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Rejects a request before channel selection when its service_tier matches a blocked value, ignoring case. The client receives HTTP 400 and channel health is not affected. Codex CLI Fast mode sends "priority"; OpenAI treats "fast" and "priority" as the same tier.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={form.formState.isSubmitting}
          />
          <Alert>
            <AlertDescription>
              {isActive
                ? t(
                    'Service tier blocking is active with the current form values.'
                  )
                : t(
                    'Service tier blocking needs the switch enabled and a non-empty blocked list.'
                  )}
            </AlertDescription>
          </Alert>
          <SettingsControlGroup>
            <FormField
              control={form.control}
              name='service_tier_policy.reject_enabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Reject blocked service tiers')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Requests that ask for a blocked service_tier are rejected instead of being forwarded upstream.'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
          </SettingsControlGroup>

          <FormField
            control={form.control}
            name='service_tier_policy.blocked_tiers'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Blocked service tiers')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={6}
                    placeholder={t('Enter one service tier per line')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Each line is one service_tier value. Matching ignores case and surrounding spaces. Leave blank to block nothing but keep the switch state.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
