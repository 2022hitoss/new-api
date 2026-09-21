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
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { TableId } from '@/components/table-id'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency, getCurrencyLabel } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useSystemConfigStore } from '@/stores/system-config-store'

import type { UserUsageStat } from '../types'

type NumericKey = Exclude<keyof UserUsageStat, 'username' | 'user_id'>

export function useUserUsageStatsColumns(): ColumnDef<UserUsageStat>[] {
  const { t, i18n } = useTranslation()
  useSystemConfigStore((state) => state.config.currency)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const currencyLabel = getCurrencyLabel()

  return useMemo<ColumnDef<UserUsageStat>[]>(() => {
    const numericColumn = (
      key: NumericKey,
      title: string,
      mobileOrder: number
    ): ColumnDef<UserUsageStat> => ({
      accessorKey: key,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={title} />
      ),
      cell: ({ row }) => (
        <span className='font-mono text-sm tabular-nums'>
          {formatNumber(row.original[key], locale)}
        </span>
      ),
      meta: { label: title, mobileOrder },
    })

    return [
      {
        accessorKey: 'username',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Username')} />
        ),
        cell: ({ row }) => (
          <span className='text-sm font-medium'>{row.original.username}</span>
        ),
        meta: { label: t('Username'), mobileTitle: true },
      },
      {
        accessorKey: 'user_id',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('User ID')} />
        ),
        cell: ({ row }) => (
          <TableId
            value={row.original.user_id}
            className='w-[60px] [font-family:inherit] text-sm'
          />
        ),
        size: 90,
        meta: { label: t('User ID'), mobileOrder: 10 },
      },
      numericColumn('request_count', t('Request Count'), 20),
      numericColumn('prompt_tokens', t('Input Tokens'), 30),
      numericColumn('completion_tokens', t('Output Tokens'), 40),
      numericColumn('total_tokens', t('Total Tokens'), 50),
      {
        accessorKey: 'quota',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={`${t('Cost')} (${currencyLabel})`}
          />
        ),
        cell: ({ row }) => (
          <span className='font-mono text-sm tabular-nums'>
            {formatQuotaWithCurrency(row.original.quota, { showSymbol: false })}
          </span>
        ),
        meta: { label: t('Cost'), mobileOrder: 60 },
      },
    ]
  }, [currencyLabel, locale, t])
}
