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
import type { ColumnDef, Table } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { DataTablePage } from '@/components/data-table'

import type { UserUsageStat } from '../types'

type UserUsageStatsTableProps = {
  table: Table<UserUsageStat>
  columns: ColumnDef<UserUsageStat>[]
  isLoading: boolean
  isFetching: boolean
}

export function UserUsageStatsTable(props: UserUsageStatsTableProps) {
  const { t } = useTranslation()

  return (
    <DataTablePage
      table={props.table}
      columns={props.columns}
      isLoading={props.isLoading}
      isFetching={props.isFetching}
      emptyTitle={t('No usage in this period')}
      emptyDescription={t(
        'No consume logs were recorded for the selected time range.'
      )}
      skeletonKeyPrefix='user-usage-stats-skeleton'
      applyHeaderSize
      toolbarProps={{
        searchPlaceholder: t('Filter by username or display name'),
        searchKey: 'username',
      }}
    />
  )
}
