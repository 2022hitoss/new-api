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
import { afterEach, describe, expect, test, vi } from 'vitest'

import { buildUserUsageStatsCsv, downloadTextFile } from '../lib/csv'
import type { UserUsageStat } from '../types'

const HEADERS = [
  'Username',
  'User ID',
  'Request Count',
  'Prompt Tokens',
  'Completion Tokens',
  'Total Tokens',
  'Quota',
  'Cost ($)',
]

function row(overrides: Partial<UserUsageStat> = {}): UserUsageStat {
  return {
    user_id: 1,
    username: 'alice',
    request_count: 3,
    prompt_tokens: 1200,
    completion_tokens: 300,
    total_tokens: 1500,
    quota: 5000,
    ...overrides,
  }
}

const options = {
  headers: HEADERS,
  formatQuotaDisplay: (quota: number) => (quota / 500000).toFixed(4),
}

describe('buildUserUsageStatsCsv', () => {
  test('starts with a UTF-8 BOM followed by the header row and CRLF line endings', () => {
    const csv = buildUserUsageStatsCsv([row()], options)

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.slice(1).split('\r\n')[0]).toBe(HEADERS.join(','))
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  test('writes numeric cells unformatted and the cost column formatted', () => {
    const csv = buildUserUsageStatsCsv([row()], options)

    expect(csv.slice(1).split('\r\n')[1]).toBe(
      'alice,1,3,1200,300,1500,5000,0.0100'
    )
  })

  test('quotes usernames containing commas, quotes or line breaks', () => {
    const csv = buildUserUsageStatsCsv(
      [row({ username: 'a,b "c"\nd' })],
      options
    )

    expect(csv.slice(1).split('\r\n')[1]).toBe(
      '"a,b ""c""\nd",1,3,1200,300,1500,5000,0.0100'
    )
  })

  test('returns only the header row when there are no rows', () => {
    const csv = buildUserUsageStatsCsv([], options)

    expect(csv).toBe(`\uFEFF${HEADERS.join(',')}\r\n`)
  })

  test('preserves the given row order', () => {
    const csv = buildUserUsageStatsCsv(
      [
        row({ username: 'zed', user_id: 9 }),
        row({ username: 'amy', user_id: 2 }),
      ],
      options
    )
    const lines = csv.slice(1).split('\r\n')

    expect(lines[1].startsWith('zed,9,')).toBe(true)
    expect(lines[2].startsWith('amy,2,')).toBe(true)
  })
})

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('triggers an anchor download with the given filename and MIME type', async () => {
    let capturedBlob: Blob | undefined
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn((blob: Blob) => {
          capturedBlob = blob
          return 'blob:user-usage-stats'
        }),
        revokeObjectURL: vi.fn(),
      })
    )
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function (this: HTMLAnchorElement) {
        downloads.push(this.download)
      }
    )

    downloadTextFile('stats.csv', '\uFEFFa,b\r\n', 'text/csv;charset=utf-8')

    expect(downloads).toEqual(['stats.csv'])
    expect(capturedBlob?.type).toBe('text/csv;charset=utf-8')
    const bytes = new Uint8Array((await capturedBlob?.arrayBuffer()) ?? [])
    expect(bytes.slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]))
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('a,b\r\n')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:user-usage-stats')
  })
})
