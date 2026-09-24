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

import { SettingsPageProvider } from '../../components/settings-page-context'
import { PricingAutoSyncSettingsSection } from '../pricing-auto-sync-settings-section'

const CHANNELS = [
  {
    id: -100,
    name: '官方倍率预设',
    base_url: 'https://basellm.github.io',
    status: 1,
  },
  { id: 5, name: 'Relay A', base_url: 'https://a.test', status: 1, type: 1 },
  { id: 6, name: 'Relay B', base_url: 'https://b.test', status: 1, type: 1 },
]

function Fixture(props: { sources: string }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <PricingAutoSyncSettingsSection
          defaultValues={{
            enabled: false,
            intervalMinutes: 360,
            sources: props.sources,
          }}
        />
      </SettingsPageProvider>
    </>
  )
}

async function renderSettings(sources: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <Fixture sources={sources} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return screen.findByRole('spinbutton', { name: 'Sync interval (minutes)' })
}

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: CHANNELS },
  })
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { task_id: 't1', status: 'pending' } },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('moving a source up and saving stores the new priority order', async () => {
  const user = userEvent.setup()
  await renderSettings(
    JSON.stringify([
      { id: 5, endpoint: '/api/pricing' },
      { id: -100, endpoint: '' },
    ])
  )

  await user.click(
    await screen.findByRole('button', {
      name: 'Move Official pricing preset #-100 up',
    })
  )
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'pricing_auto_sync_setting.sources',
      value: JSON.stringify([
        { id: -100, endpoint: '' },
        { id: 5, endpoint: '/api/pricing' },
      ]),
    })
  )
  expect(api.put).toHaveBeenCalledTimes(1)
})

test('sources selected in the dialog are appended after existing ones with their default endpoint', async () => {
  const user = userEvent.setup()
  await renderSettings(JSON.stringify([{ id: 5, endpoint: '/api/pricing' }]))

  await user.click(
    await screen.findByRole('button', { name: 'Select sources' })
  )
  await user.click(
    await screen.findByRole('checkbox', {
      name: 'Select Official pricing preset',
    })
  )
  await user.click(screen.getByRole('button', { name: 'Confirm Selection' }))
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'pricing_auto_sync_setting.sources',
      value: JSON.stringify([
        { id: 5, endpoint: '/api/pricing' },
        {
          id: -100,
          endpoint: '/llm-metadata/api/newapi/ratio_config-v1-base.json',
        },
      ]),
    })
  )
})

test('an interval below the minimum shows a field error and is not saved', async () => {
  const user = userEvent.setup()
  const interval = await renderSettings('[]')

  fireEvent.change(interval, { target: { value: '5' } })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  expect(
    await screen.findByText('Interval must be between 10 and 10080 minutes')
  ).toBeVisible()
  expect(api.put).not.toHaveBeenCalled()
})

test('sync now is disabled when no sources are saved', async () => {
  await renderSettings('null')
  expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled()
  expect(screen.getByText('No sync sources')).toBeVisible()
})

test('sync now posts to the run endpoint for saved sources', async () => {
  const user = userEvent.setup()
  await renderSettings(JSON.stringify([{ id: 6, endpoint: '' }]))

  await user.click(screen.getByRole('button', { name: 'Sync now' }))

  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith('/api/ratio_sync/auto/run')
  )
})
