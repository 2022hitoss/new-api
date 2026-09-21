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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { parseQuotaFromDollars } from '@/lib/format'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { QuotaRefillSettingsSection } from '../quota-refill-settings-section'

const THRESHOLD_DISPLAY = 20
const TARGET_DISPLAY = 100

function Fixture() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <QuotaRefillSettingsSection
          defaultValues={{
            monthlyResetEnabled: false,
            monthlyResetGroupQuota: '{}',
            monthlyResetLastPeriod: '',
            selfRefillEnabled: true,
            selfRefillThreshold: parseQuotaFromDollars(THRESHOLD_DISPLAY),
            selfRefillTarget: parseQuotaFromDollars(TARGET_DISPLAY),
          }}
        />
      </SettingsPageProvider>
    </>
  )
}

async function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute({ component: Fixture }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return screen.findByRole('spinbutton', { name: /Refill target/ })
}

beforeEach(() => {
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CNY',
      usdExchangeRate: 7,
      quotaPerUnit: 500000,
    },
  })
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

afterEach(() => {
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

test('shows quota defaults in the display currency and saves the target as quota units', async () => {
  const user = userEvent.setup()
  const target = await renderSettings()
  expect(target).toHaveValue(TARGET_DISPLAY)
  expect(
    screen.getByRole('spinbutton', { name: /Refill threshold/ })
  ).toHaveValue(THRESHOLD_DISPLAY)

  fireEvent.change(target, { target: { value: '300' } })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'quota_refill_setting.self_refill_target',
      value: String(parseQuotaFromDollars(300)),
    })
  )
  expect(api.put).toHaveBeenCalledTimes(1)
})

test('a target at or below the threshold shows a field error and is not saved', async () => {
  const target = await renderSettings()
  fireEvent.change(target, { target: { value: String(THRESHOLD_DISPLAY) } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() => expect(target).toHaveAttribute('aria-invalid', 'true'))
  expect(
    screen.getByText('Refill target must be greater than the threshold')
  ).toBeInTheDocument()
  expect(api.put).not.toHaveBeenCalled()
})
