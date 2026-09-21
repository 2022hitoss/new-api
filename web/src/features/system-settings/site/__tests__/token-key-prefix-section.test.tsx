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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { TokenKeyPrefixSection } from '../token-key-prefix-section'

const TOKEN_KEY_CUSTOM_PREFIX_OPTION_KEY = 'token_key_setting.custom_prefix'

function Fixture(props: { defaultValue: string }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <TokenKeyPrefixSection defaultValue={props.defaultValue} />
      </SettingsPageProvider>
    </>
  )
}

async function renderSection(defaultValue = '') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <Fixture defaultValue={defaultValue} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return screen.findByRole('textbox', { name: 'Custom key prefix' })
}

beforeEach(() => {
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('an empty prefix previews the default sk- key shape', async () => {
  const input = await renderSection('')
  expect(input).toHaveValue('')
  expect(screen.getByTestId('token-key-preview')).toHaveTextContent(/^sk-x+$/)
})

test('typing a prefix updates the preview to sk-<prefix>-<random>', async () => {
  const user = userEvent.setup()
  const input = await renderSection('')
  await user.type(input, 'abcd')
  expect(screen.getByTestId('token-key-preview')).toHaveTextContent(
    /^sk-abcd-x+$/
  )
})

test('saving a changed prefix writes the token_key_setting option', async () => {
  const user = userEvent.setup()
  const input = await renderSection('')
  await user.type(input, 'Team_01')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledExactlyOnceWith('/api/option/', {
      key: TOKEN_KEY_CUSTOM_PREFIX_OPTION_KEY,
      value: 'Team_01',
    })
  )
})

test('saving an unchanged prefix does not write any option', async () => {
  const user = userEvent.setup()
  const input = await renderSection('abcd')
  expect(input).toHaveValue('abcd')
  const save = screen.getByRole('button', { name: 'Save Changes' })
  await user.click(save)
  await waitFor(() => expect(save).toBeEnabled())
  expect(api.put).not.toHaveBeenCalled()
})

test.each(['ab-cd', 'ab cd', 'sk-abcd', 'ab.cd'])(
  'invalid prefix "%s" shows a field error and prevents saving',
  async (value) => {
    const input = await renderSection('')
    fireEvent.change(input, { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(
      screen.getByText('Only letters, digits and underscores are allowed')
    ).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  }
)

test('a prefix longer than 32 characters shows a length error and prevents saving', async () => {
  const input = await renderSection('')
  fireEvent.change(input, { target: { value: 'a'.repeat(33) } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
  expect(screen.getByText('Must be at most 32 characters')).toBeInTheDocument()
  expect(api.put).not.toHaveBeenCalled()
})

test('surrounding whitespace is trimmed before saving', async () => {
  const input = await renderSection('')
  fireEvent.change(input, { target: { value: '  abcd  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledExactlyOnceWith('/api/option/', {
      key: TOKEN_KEY_CUSTOM_PREFIX_OPTION_KEY,
      value: 'abcd',
    })
  )
})
