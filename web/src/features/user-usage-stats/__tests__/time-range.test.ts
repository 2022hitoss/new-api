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
import { describe, expect, test } from 'vitest'

import {
  getDefaultUsageStatsRange,
  resolveUsageStatsRange,
} from '../lib/time-range'

describe('getDefaultUsageStatsRange', () => {
  test('starts at the first day of the current month at local midnight and ends now', () => {
    const now = new Date(2026, 8, 21, 15, 30, 45)

    const range = getDefaultUsageStatsRange(now)

    expect(range.start).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0))
    expect(range.end).toBe(now)
  })
})

describe('resolveUsageStatsRange', () => {
  const now = new Date(2026, 8, 21, 15, 30, 45)

  test('uses URL millisecond values when both are present', () => {
    const range = resolveUsageStatsRange(
      { startTime: 1_700_000_000_000, endTime: 1_700_100_000_000 },
      now
    )

    expect(range.start.getTime()).toBe(1_700_000_000_000)
    expect(range.end.getTime()).toBe(1_700_100_000_000)
  })

  test('falls back to the current month when the URL has no range', () => {
    const range = resolveUsageStatsRange({}, now)

    expect(range.start).toEqual(new Date(2026, 8, 1))
    expect(range.end).toBe(now)
  })

  test('falls back per side when only one bound is present', () => {
    const range = resolveUsageStatsRange({ startTime: 1_700_000_000_000 }, now)

    expect(range.start.getTime()).toBe(1_700_000_000_000)
    expect(range.end).toBe(now)
  })
})
