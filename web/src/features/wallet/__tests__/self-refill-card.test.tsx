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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { SelfRefillCard } from '../components/self-refill-card'
import type { SelfRefillInfo } from '../hooks/use-self-refill'

function renderCard(info: SelfRefillInfo | undefined, onRefill = vi.fn()) {
  render(
    <SelfRefillCard
      info={info}
      loading={false}
      refilling={false}
      onRefill={onRefill}
    />
  )
  return onRefill
}

test('renders nothing when self refill is disabled', () => {
  renderCard({ enabled: false })
  expect(
    screen.queryByRole('button', { name: 'Refill balance' })
  ).not.toBeInTheDocument()
})

test('disables the refill button and explains why when the balance is not below the threshold', () => {
  renderCard({
    enabled: true,
    threshold: 10_000_000,
    target: 150_000_000,
    quota: 50_000_000,
    eligible: false,
  })
  expect(screen.getByRole('button', { name: 'Refill balance' })).toBeDisabled()
  expect(
    screen.getByText('Your balance is not below the threshold yet.')
  ).toBeInTheDocument()
})

test('confirming the dialog triggers the refill once when eligible', async () => {
  const user = userEvent.setup()
  const onRefill = renderCard({
    enabled: true,
    threshold: 10_000_000,
    target: 150_000_000,
    quota: 5_000_000,
    eligible: true,
  })
  const button = screen.getByRole('button', { name: 'Refill balance' })
  expect(button).toBeEnabled()
  expect(
    screen.queryByText('Your balance is not below the threshold yet.')
  ).not.toBeInTheDocument()

  await user.click(button)
  await user.click(await screen.findByRole('button', { name: 'Confirm' }))

  expect(onRefill).toHaveBeenCalledTimes(1)
})
