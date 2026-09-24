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
import { useMutation, useQuery } from '@tanstack/react-query'
import i18next from 'i18next'
import { Reorder } from 'motion/react'
import { useMemo, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { AutoGroupOrderItem } from '@/components/auto-group-order-item'
import { EmptyState } from '@/components/empty-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getUpstreamChannels, triggerPricingAutoSync } from '../api'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { ChannelSelectorDialog } from '../models/channel-selector-dialog'
import {
  getDefaultEndpointForChannel,
  getUpstreamDisplayName,
} from '../models/upstream-ratio-sync-helpers'
import { safeNumberFieldProps } from '../utils/numeric-field'

const MIN_INTERVAL = 10
const MAX_INTERVAL = 10080

type Source = { id: number; endpoint: string }

const schema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z
    .number({ error: () => i18next.t('Please enter a valid number') })
    .int({ error: () => i18next.t('Please enter a valid number') })
    .min(MIN_INTERVAL, {
      error: () =>
        i18next.t('Interval must be between {{min}} and {{max}} minutes', {
          min: MIN_INTERVAL,
          max: MAX_INTERVAL,
        }),
    })
    .max(MAX_INTERVAL, {
      error: () =>
        i18next.t('Interval must be between {{min}} and {{max}} minutes', {
          min: MIN_INTERVAL,
          max: MAX_INTERVAL,
        }),
    }),
  sources: z.array(z.object({ id: z.number(), endpoint: z.string() })),
})

type Values = z.infer<typeof schema>

/** Raw option values; `sources` is the stored JSON array. */
export type PricingAutoSyncSettingsDefaults = {
  enabled: boolean
  intervalMinutes: number
  sources: string
}

type PricingAutoSyncSettingsSectionProps = {
  defaultValues: PricingAutoSyncSettingsDefaults
}

export function PricingAutoSyncSettingsSection(
  props: PricingAutoSyncSettingsSectionProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogIds, setDialogIds] = useState<number[]>([])
  const [dialogEndpoints, setDialogEndpoints] = useState<
    Record<number, string>
  >({})

  const editableDefaults = useMemo<Values>(() => {
    let sources: Source[] = []
    try {
      const parsed: unknown = JSON.parse(props.defaultValues.sources || '[]')
      if (Array.isArray(parsed)) sources = parsed as Source[]
    } catch {
      sources = []
    }
    return {
      enabled: props.defaultValues.enabled,
      intervalMinutes: props.defaultValues.intervalMinutes,
      sources,
    }
  }, [props.defaultValues])

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: editableDefaults,
  })
  const { isDirty, isSubmitting } = form.formState
  const sources = form.watch('sources')
  const savedSources =
    (form.formState.defaultValues?.sources as Source[] | undefined) ?? []

  const channelsQuery = useQuery({
    queryKey: ['upstream-channels'],
    queryFn: async () => requireServerSuccess(await getUpstreamChannels()),
  })
  const channels = useMemo(
    () => channelsQuery.data?.data ?? [],
    [channelsQuery.data?.data]
  )

  const runMutation = useMutation({
    mutationFn: async () =>
      requireServerSuccess(await triggerPricingAutoSync()),
    onSuccess: () =>
      toast.success(
        t('Price sync started. Check System Tasks for the result.')
      ),
    onError: (error: Error) =>
      handleServerError(error, t('Failed to start price sync')),
  })

  const sourceLabel = (source: Source) => {
    const channel = channels.find((item) => item.id === source.id)
    const name = channel
      ? getUpstreamDisplayName(channel.name, t)
      : t('Unknown channel')
    return `${name} #${source.id}`
  }

  const setSources = (next: Source[]) =>
    form.setValue('sources', next, { shouldDirty: true })

  const openDialog = () => {
    setDialogIds(sources.map((source) => source.id))
    setDialogEndpoints(
      Object.fromEntries(
        channels.map((channel) => [
          channel.id,
          sources.find((source) => source.id === channel.id)?.endpoint ||
            getDefaultEndpointForChannel(channel),
        ])
      )
    )
    setDialogOpen(true)
  }

  // Keep the priority of sources that stay selected and append new ones.
  const handleConfirm = (ids: number[]) => {
    const endpointOf = (id: number) => {
      const channel = channels.find((item) => item.id === id)
      return (
        dialogEndpoints[id] ||
        (channel ? getDefaultEndpointForChannel(channel) : '')
      )
    }
    const kept = sources
      .filter((source) => ids.includes(source.id))
      .map((source) => ({ id: source.id, endpoint: endpointOf(source.id) }))
    const added = channels
      .filter(
        (channel) =>
          ids.includes(channel.id) &&
          !sources.some((source) => source.id === channel.id)
      )
      .map((channel) => ({ id: channel.id, endpoint: endpointOf(channel.id) }))
    setSources([...kept, ...added])
    setDialogOpen(false)
  }

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const next = [...sources]
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setSources(next)
  }

  async function onSubmit(values: Values) {
    const baseline =
      (form.formState.defaultValues as Values | undefined) ?? editableDefaults
    const updates: Array<{ key: string; value: string }> = []
    // Save sources before enabling so the first scheduled run sees them.
    if (JSON.stringify(values.sources) !== JSON.stringify(baseline.sources)) {
      updates.push({
        key: 'pricing_auto_sync_setting.sources',
        value: JSON.stringify(values.sources),
      })
    }
    if (values.intervalMinutes !== baseline.intervalMinutes) {
      updates.push({
        key: 'pricing_auto_sync_setting.interval_minutes',
        value: String(values.intervalMinutes),
      })
    }
    if (values.enabled !== baseline.enabled) {
      updates.push({
        key: 'pricing_auto_sync_setting.enabled',
        value: String(values.enabled),
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

  const busy = updateOption.isPending || isSubmitting

  return (
    <SettingsSection title={t('Automatic Price Sync')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={busy}
            isSaveDisabled={!isDirty}
          />

          <Alert>
            <AlertDescription>
              {t(
                'Each run fetches prices from the sources below and overwrites the local price of every model served by an enabled channel, including prices set manually. Models that only exist upstream are not imported.'
              )}
            </AlertDescription>
          </Alert>

          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable automatic price sync')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Sync prices from upstream on a schedule so new models are priced automatically.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={busy}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <FormField
            control={form.control}
            name='intervalMinutes'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Sync interval (minutes)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={MIN_INTERVAL}
                    max={MAX_INTERVAL}
                    step={1}
                    {...safeNumberFieldProps(field)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='space-y-1'>
                <p className='text-sm font-medium'>{t('Sync sources')}</p>
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'For each model, the first source in this list that has a price wins.'
                  )}
                </p>
              </div>
              <div className='flex gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={busy || channelsQuery.isLoading}
                  onClick={openDialog}
                >
                  {t('Select sources')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={
                    savedSources.length === 0 ||
                    isDirty ||
                    runMutation.isPending
                  }
                  title={isDirty ? t('Save changes before syncing') : undefined}
                  onClick={() => runMutation.mutate()}
                >
                  {t('Sync now')}
                </Button>
              </div>
            </div>
            {sources.length === 0 ? (
              <EmptyState
                className='min-h-32'
                title={t('No sync sources')}
                description={t(
                  'Select at least one channel or pricing preset to sync from.'
                )}
              />
            ) : (
              <Reorder.Group
                as='ol'
                axis='y'
                values={sources.map(sourceLabel)}
                onReorder={(labels) =>
                  setSources(
                    labels.flatMap((label) =>
                      sources.filter((source) => sourceLabel(source) === label)
                    )
                  )
                }
                aria-label={t('Sync sources')}
                className='flex flex-col gap-2'
              >
                {sources.map((source, index) => (
                  <AutoGroupOrderItem
                    key={source.id}
                    group={sourceLabel(source)}
                    index={index}
                    count={sources.length}
                    onMove={handleMove}
                    onRemove={() =>
                      setSources(
                        sources.filter((item) => item.id !== source.id)
                      )
                    }
                  >
                    <span className='text-muted-foreground truncate font-mono text-xs'>
                      {source.endpoint || t('Default endpoint')}
                    </span>
                  </AutoGroupOrderItem>
                ))}
              </Reorder.Group>
            )}
          </div>
        </SettingsForm>
      </Form>

      <ChannelSelectorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        channels={channels}
        selectedChannelIds={dialogIds}
        onSelectedChannelIdsChange={setDialogIds}
        channelEndpoints={dialogEndpoints}
        onChannelEndpointsChange={setDialogEndpoints}
        onConfirm={handleConfirm}
      />
    </SettingsSection>
  )
}
