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
import { getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'

import { ExportCsvButton } from './components/export-csv-button'
import { useUserUsageStatsColumns } from './components/user-usage-stats-columns'
import { UserUsageStatsToolbar } from './components/user-usage-stats-toolbar'
import { useUserUsageStats } from './hooks/use-user-usage-stats'
import { resolveUsageStatsRange } from './lib/time-range'
import type { UserUsageStat } from './types'

const route = getRouteApi('/_authenticated/user-usage-stats/')
const EMPTY_ROWS: UserUsageStat[] = []

export function UserUsageStats() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const startTime = search.startTime
  const endTime = search.endTime
  const range = useMemo(
    () => resolveUsageStatsRange({ startTime, endTime }),
    [startTime, endTime]
  )
  const { data, isLoading, isFetching } = useUserUsageStats(range)
  const columns = useUserUsageStatsColumns()

  const { table } = useDataTable({
    data: data ?? EMPTY_ROWS,
    columns,
    manualPagination: false,
    initialSorting: [{ id: 'quota', desc: true }],
    initialPagination: { pageIndex: 0, pageSize: 50 },
    getRowId: (row) => String(row.user_id),
    columnVisibilityStorageKey: 'user-usage-stats-columns',
  })

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>
        {t('User Usage Statistics')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center gap-2'>
          <UserUsageStatsToolbar range={range} />
          <ExportCsvButton table={table} range={range} />
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <DataTablePage
          table={table}
          columns={columns}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyTitle={t('No usage in this period')}
          emptyDescription={t(
            'No consume logs were recorded for the selected time range.'
          )}
          skeletonKeyPrefix='user-usage-stats-skeleton'
          applyHeaderSize
          toolbarProps={{
            searchPlaceholder: t('Filter by username'),
            searchKey: 'username',
          }}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
