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
import type { Table } from '@tanstack/react-table'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { formatQuotaWithCurrency, getCurrencyLabel } from '@/lib/currency'
import dayjs from '@/lib/dayjs'

import { buildUserUsageStatsCsv, downloadTextFile } from '../lib/csv'
import type { UsageStatsRange } from '../lib/time-range'
import type { UserUsageStat } from '../types'

type ExportCsvButtonProps = {
  table: Table<UserUsageStat>
  range: UsageStatsRange
}

export function ExportCsvButton(props: ExportCsvButtonProps) {
  const { t } = useTranslation()
  const rows = props.table.getSortedRowModel().rows

  const handleExport = () => {
    const csv = buildUserUsageStatsCsv(
      rows.map((row) => row.original),
      {
        headers: [
          t('Username'),
          t('Display Name'),
          t('User ID'),
          t('Request Count'),
          t('Input Tokens'),
          t('Output Tokens'),
          t('Total Tokens'),
          t('Quota'),
          `${t('Cost')} (${getCurrencyLabel()})`,
        ],
        formatQuotaDisplay: (quota) =>
          formatQuotaWithCurrency(quota, { showSymbol: false }),
      }
    )
    const stamp = (date: Date) => dayjs(date).format('YYYYMMDD-HHmm')
    downloadTextFile(
      `user-usage-stats_${stamp(props.range.start)}_${stamp(props.range.end)}.csv`,
      csv,
      'text/csv;charset=utf-8'
    )
  }

  return (
    <Button type='button' onClick={handleExport} disabled={rows.length === 0}>
      <Download aria-hidden='true' />
      {t('Export CSV')}
    </Button>
  )
}
