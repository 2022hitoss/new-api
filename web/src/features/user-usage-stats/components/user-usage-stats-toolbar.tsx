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
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { CompactDateTimeRangePicker } from '@/features/usage-logs/components/compact-date-time-range-picker'

import {
  getDefaultUsageStatsRange,
  type UsageStatsRange,
} from '../lib/time-range'

type UserUsageStatsToolbarProps = {
  range: UsageStatsRange
}

export function UserUsageStatsToolbar(props: UserUsageStatsToolbarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const applyRange = (range: { start?: Date; end?: Date }) => {
    const fallback = getDefaultUsageStatsRange()
    const start = range.start ?? fallback.start
    const end = range.end ?? fallback.end
    navigate({
      to: '/user-usage-stats',
      search: { startTime: start.getTime(), endTime: end.getTime() },
    })
  }

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <CompactDateTimeRangePicker
        start={props.range.start}
        end={props.range.end}
        onChange={applyRange}
        className='w-auto'
      />
      <Button
        type='button'
        variant='outline'
        onClick={() => navigate({ to: '/user-usage-stats', search: {} })}
      >
        {t('This month')}
      </Button>
    </div>
  )
}
