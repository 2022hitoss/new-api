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
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
import { Switch } from '@/components/ui/switch'
import { getCurrencyLabel } from '@/lib/currency'
import {
  formatQuota,
  getEditableQuotaStep,
  parseQuotaFromDollars,
  quotaUnitsToEditableAmount,
} from '@/lib/format'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'
import { GroupQuotaVisualEditor } from './group-quota-visual-editor'

const schema = z
  .object({
    monthlyResetEnabled: z.boolean(),
    monthlyResetGroupQuota: z.string(),
    selfRefillEnabled: z.boolean(),
    selfRefillThreshold: z
      .number({ error: () => i18next.t('Please enter a valid number') })
      .min(0, { error: () => i18next.t('Must be greater than or equal to 0') }),
    selfRefillTarget: z
      .number({ error: () => i18next.t('Please enter a valid number') })
      .min(0, { error: () => i18next.t('Must be greater than or equal to 0') }),
  })
  .refine(
    (values) =>
      !values.selfRefillEnabled ||
      values.selfRefillTarget > values.selfRefillThreshold,
    {
      path: ['selfRefillTarget'],
      error: () =>
        i18next.t('Refill target must be greater than the threshold'),
    }
  )

type Values = z.infer<typeof schema>

/** Raw option values; quota fields are in internal quota units. */
export type QuotaRefillSettingsDefaults = {
  monthlyResetEnabled: boolean
  monthlyResetGroupQuota: string
  monthlyResetLastPeriod: string
  selfRefillEnabled: boolean
  selfRefillThreshold: number
  selfRefillTarget: number
}

type QuotaRefillSettingsSectionProps = {
  defaultValues: QuotaRefillSettingsDefaults
}

export function QuotaRefillSettingsSection(
  props: QuotaRefillSettingsSectionProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const currencyLabel = getCurrencyLabel()

  // Threshold and target are edited in the display currency and converted back
  // to quota units on save.
  const editableDefaults: Values = {
    monthlyResetEnabled: props.defaultValues.monthlyResetEnabled,
    monthlyResetGroupQuota: props.defaultValues.monthlyResetGroupQuota,
    selfRefillEnabled: props.defaultValues.selfRefillEnabled,
    selfRefillThreshold: quotaUnitsToEditableAmount(
      props.defaultValues.selfRefillThreshold
    ),
    selfRefillTarget: quotaUnitsToEditableAmount(
      props.defaultValues.selfRefillTarget
    ),
  }

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: editableDefaults,
  })

  const { isDirty, isSubmitting } = form.formState
  const monthlyResetEnabled = form.watch('monthlyResetEnabled')
  const selfRefillEnabled = form.watch('selfRefillEnabled')
  const thresholdAmount = form.watch('selfRefillThreshold')
  const targetAmount = form.watch('selfRefillTarget')

  async function onSubmit(values: Values) {
    const defaults = form.formState.defaultValues as Values | undefined
    const baseline = defaults ?? editableDefaults
    const updates: Array<{ key: string; value: string }> = []

    if (values.monthlyResetEnabled !== baseline.monthlyResetEnabled) {
      updates.push({
        key: 'quota_refill_setting.monthly_reset_enabled',
        value: String(values.monthlyResetEnabled),
      })
    }
    if (values.monthlyResetGroupQuota !== baseline.monthlyResetGroupQuota) {
      updates.push({
        key: 'quota_refill_setting.monthly_reset_group_quota',
        value: values.monthlyResetGroupQuota,
      })
    }
    if (values.selfRefillEnabled !== baseline.selfRefillEnabled) {
      updates.push({
        key: 'quota_refill_setting.self_refill_enabled',
        value: String(values.selfRefillEnabled),
      })
    }
    if (values.selfRefillThreshold !== baseline.selfRefillThreshold) {
      updates.push({
        key: 'quota_refill_setting.self_refill_threshold',
        value: String(parseQuotaFromDollars(values.selfRefillThreshold)),
      })
    }
    if (values.selfRefillTarget !== baseline.selfRefillTarget) {
      updates.push({
        key: 'quota_refill_setting.self_refill_target',
        value: String(parseQuotaFromDollars(values.selfRefillTarget)),
      })
    }

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }

    form.reset(values)
  }

  const describeAmount = (amount: number | undefined) =>
    formatQuota(parseQuotaFromDollars(typeof amount === 'number' ? amount : 0))

  return (
    <SettingsSection title={t('Quota Refill')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending || isSubmitting}
            isSaveDisabled={!isDirty}
          />

          <FormField
            control={form.control}
            name='monthlyResetEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable monthly quota reset')}</FormLabel>
                  <FormDescription>
                    {t(
                      'At the start of each month, reset every enabled user in the configured groups to the group balance. Enabling it mid-month runs the reset immediately.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={updateOption.isPending || isSubmitting}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          {monthlyResetEnabled && (
            <div className='space-y-4'>
              <FormField
                control={form.control}
                name='monthlyResetGroupQuota'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Group monthly balance')}</FormLabel>
                    <FormControl>
                      <GroupQuotaVisualEditor
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className='text-muted-foreground text-sm'>
                {t('Last reset period')}:{' '}
                <span className='font-medium'>
                  {props.defaultValues.monthlyResetLastPeriod || t('Never')}
                </span>
              </p>
            </div>
          )}

          <FormField
            control={form.control}
            name='selfRefillEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable self refill')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Let users set their own balance to the refill target while it is below the threshold.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={updateOption.isPending || isSubmitting}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          {selfRefillEnabled && (
            <div className='grid gap-6 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='selfRefillThreshold'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Refill threshold ({{currency}})', {
                        currency: currencyLabel,
                      })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        step={getEditableQuotaStep()}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Refill is allowed while the balance is below {{quota}}',
                        {
                          quota: describeAmount(thresholdAmount),
                        }
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='selfRefillTarget'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Refill target ({{currency}})', {
                        currency: currencyLabel,
                      })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        step={getEditableQuotaStep()}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('The balance is set to {{quota}} on refill', {
                        quota: describeAmount(targetAmount),
                      })}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
