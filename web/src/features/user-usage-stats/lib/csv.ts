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
import type { UserUsageStat } from '../types'

export type UserUsageStatsCsvOptions = {
  /** Translated column headers, in output column order (8 entries). */
  headers: string[]
  /** Renders the raw quota as the site's display currency. */
  formatQuotaDisplay: (quota: number) => string
}

const BOM = '\uFEFF'

function escapeCsvCell(value: string | number): string {
  const text = String(value)
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

/**
 * Build an RFC 4180 CSV (CRLF line endings, UTF-8 BOM so Excel detects the
 * encoding). Numeric cells are written unformatted so spreadsheets parse them
 * as numbers; only the last column carries the currency-formatted quota.
 */
export function buildUserUsageStatsCsv(
  rows: UserUsageStat[],
  options: UserUsageStatsCsvOptions
): string {
  const lines = [options.headers.map(escapeCsvCell).join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.username,
        row.user_id,
        row.request_count,
        row.prompt_tokens,
        row.completion_tokens,
        row.total_tokens,
        row.quota,
        options.formatQuotaDisplay(row.quota),
      ]
        .map(escapeCsvCell)
        .join(',')
    )
  }
  return `${BOM}${lines.join('\r\n')}\r\n`
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
