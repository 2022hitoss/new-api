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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'

import { UserUsageStatsTable } from '../components/user-usage-stats-table'
import { useUserUsageStatsTable } from '../hooks/use-user-usage-stats-table'
import type { UserUsageStat } from '../types'

const ROWS: UserUsageStat[] = [
  {
    user_id: 1,
    username: 'alice',
    display_name: 'Alice Liddell',
    request_count: 2,
    prompt_tokens: 30,
    completion_tokens: 10,
    total_tokens: 40,
    quota: 150,
  },
  {
    user_id: 2,
    username: 'bob',
    display_name: '',
    request_count: 1,
    prompt_tokens: 7,
    completion_tokens: 3,
    total_tokens: 10,
    quota: 300,
  },
]

function Harness(props: { rows: UserUsageStat[] }) {
  const { table, columns } = useUserUsageStatsTable(props.rows)
  return (
    <UserUsageStatsTable
      table={table}
      columns={columns}
      isLoading={false}
      isFetching={false}
    />
  )
}

describe('user usage stats table', () => {
  afterEach(() => {
    localStorage.clear()
  })

  test('renders the toolbar and every user row without a filter state', () => {
    render(<Harness rows={ROWS} />)

    expect(
      screen.getByPlaceholderText('Filter by username or display name')
    ).toBeVisible()
    expect(screen.getByText('alice')).toBeVisible()
    expect(screen.getByText('bob')).toBeVisible()
  })

  test('typing in the username search narrows the rows to matching users', async () => {
    const user = userEvent.setup()
    render(<Harness rows={ROWS} />)

    await user.type(
      screen.getByPlaceholderText('Filter by username or display name'),
      'bob'
    )

    await waitFor(() => {
      expect(screen.queryByText('alice')).not.toBeInTheDocument()
    })
    expect(screen.getByText('bob')).toBeVisible()
  })

  test('shows display names and matches them in the search', async () => {
    const user = userEvent.setup()
    render(<Harness rows={ROWS} />)

    expect(screen.getByText('Alice Liddell')).toBeVisible()

    await user.type(
      screen.getByPlaceholderText('Filter by username or display name'),
      'liddell'
    )

    await waitFor(() => {
      expect(screen.queryByText('bob')).not.toBeInTheDocument()
    })
    expect(screen.getByText('alice')).toBeVisible()
  })

  test('shows the empty state when there are no rows', () => {
    render(<Harness rows={[]} />)

    expect(screen.getByText('No usage in this period')).toBeVisible()
  })
})
