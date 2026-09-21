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
import dayjs from '@/lib/dayjs'

import type { UserUsageStatsSearch } from '../types'

export type UsageStatsRange = { start: Date; end: Date }

/** Current calendar month in the browser's local time zone, up to `now`. */
export function getDefaultUsageStatsRange(
  now: Date = new Date()
): UsageStatsRange {
  return { start: dayjs(now).startOf('month').toDate(), end: now }
}

/** URL search values (ms) win over the default month range. */
export function resolveUsageStatsRange(
  search: UserUsageStatsSearch,
  now: Date = new Date()
): UsageStatsRange {
  const fallback = getDefaultUsageStatsRange(now)
  const start =
    typeof search.startTime === 'number' && Number.isFinite(search.startTime)
      ? new Date(search.startTime)
      : fallback.start
  const end =
    typeof search.endTime === 'number' && Number.isFinite(search.endTime)
      ? new Date(search.endTime)
      : fallback.end
  return { start, end }
}
