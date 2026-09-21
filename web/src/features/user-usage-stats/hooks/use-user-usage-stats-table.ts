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
import type { ColumnFiltersState } from '@tanstack/react-table'
import { useState } from 'react'

import { useDataTable } from '@/components/data-table'

import { useUserUsageStatsColumns } from '../components/user-usage-stats-columns'
import type { UserUsageStat } from '../types'

const EMPTY_ROWS: UserUsageStat[] = []

/**
 * Client-side table state for the per-user usage stats page: sorting,
 * pagination and the username column filter all live in memory because the
 * API returns the full aggregated list for the selected range. `useDataTable`
 * writes `columnFilters` / `globalFilter` straight into the TanStack state, so
 * they must be provided (as arrays/strings, never undefined) or the toolbar
 * crashes reading `columnFilters.length`.
 */
export function useUserUsageStatsTable(rows: UserUsageStat[] | undefined) {
  const columns = useUserUsageStatsColumns()
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const { table } = useDataTable({
    data: rows ?? EMPTY_ROWS,
    columns,
    columnFilters,
    onColumnFiltersChange: setColumnFilters,
    globalFilter,
    onGlobalFilterChange: setGlobalFilter,
    manualPagination: false,
    initialSorting: [{ id: 'quota', desc: true }],
    initialPagination: { pageIndex: 0, pageSize: 50 },
    getRowId: (row) => String(row.user_id),
    columnVisibilityStorageKey: 'user-usage-stats-columns',
  })
  return { table, columns }
}
