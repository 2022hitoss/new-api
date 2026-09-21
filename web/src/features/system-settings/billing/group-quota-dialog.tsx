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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
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
import { getGroups } from '@/features/users/api'
import { getCurrencyLabel } from '@/lib/currency'
import {
  formatQuota,
  getEditableQuotaStep,
  parseQuotaFromDollars,
  quotaUnitsToEditableAmount,
} from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { safeNumberFieldProps } from '../utils/numeric-field'

const createGroupQuotaDialogSchema = (t: (key: string) => string) =>
  z.object({
    group: z.string().trim().min(1, t('Please select a group')),
    amount: z.number().min(0, t('Must be greater than or equal to 0')),
  })

type GroupQuotaDialogFormValues = z.infer<
  ReturnType<typeof createGroupQuotaDialogSchema>
>

const GROUP_QUOTA_FORM_ID = 'group-quota-form'

/** One configured group; `quota` is stored in internal quota units. */
export type GroupQuotaData = {
  group: string
  quota: number
}

type GroupQuotaDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: GroupQuotaData) => void
  editData?: GroupQuotaData | null
  /** Groups that already have a quota and must not be added twice. */
  configuredGroups: string[]
}

export function GroupQuotaDialog(props: GroupQuotaDialogProps) {
  const { t } = useTranslation()
  const isEditMode = !!props.editData
  const schema = createGroupQuotaDialogSchema(t)
  const currencyLabel = getCurrencyLabel()

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => requireServerSuccess(await getGroups()),
    staleTime: 5 * 60 * 1000,
    enabled: props.open && !isEditMode,
  })

  const groupOptions = useMemo(() => {
    const groups = groupsData?.data ?? []
    return groups
      .filter((group) => !props.configuredGroups.includes(group))
      .map((group) => ({ value: group, label: group }))
  }, [groupsData, props.configuredGroups])

  const form = useForm<GroupQuotaDialogFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { group: '', amount: 0 },
  })

  const amount = form.watch('amount')

  useEffect(() => {
    if (props.editData) {
      form.reset({
        group: props.editData.group,
        amount: quotaUnitsToEditableAmount(props.editData.quota),
      })
    } else {
      form.reset({ group: '', amount: 0 })
    }
  }, [props.editData, form, props.open])

  const handleSubmit = (values: GroupQuotaDialogFormValues) => {
    props.onSave({
      group: values.group,
      quota: parseQuotaFromDollars(values.amount),
    })
    form.reset()
    props.onOpenChange(false)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={isEditMode ? t('Edit group quota') : t('Add group quota')}
      description={t(
        'Every enabled user in this group is reset to this balance at the start of each month.'
      )}
      contentClassName='sm:max-w-[500px]'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' form={GROUP_QUOTA_FORM_ID}>
            {isEditMode ? t('Update') : t('Add')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={GROUP_QUOTA_FORM_ID}
          onSubmit={form.handleSubmit(handleSubmit)}
          className='space-y-4'
        >
          <FormField
            control={form.control}
            name='group'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Group')}</FormLabel>
                <FormControl>
                  {isEditMode ? (
                    <Input value={field.value} readOnly disabled />
                  ) : (
                    <Combobox
                      options={groupOptions}
                      onValueChange={(value) => field.onChange(value ?? '')}
                      value={field.value}
                      className='w-full'
                      placeholder={t('Select a group')}
                    />
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='amount'
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('Monthly reset balance ({{currency}})', {
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
                  {t('Stored as {{quota}}', {
                    quota: formatQuota(
                      parseQuotaFromDollars(
                        typeof amount === 'number' ? amount : 0
                      )
                    ),
                  })}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
