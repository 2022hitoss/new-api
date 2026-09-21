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
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Button } from '@/components/ui/button'
import { formatQuota } from '@/lib/format'

import { safeJsonParseWithValidation } from '../utils/json-parser'
import { isObjectRecord } from '../utils/json-validators'
import { GroupQuotaDialog, type GroupQuotaData } from './group-quota-dialog'

type GroupQuotaVisualEditorProps = {
  /** JSON object of group name to quota (internal quota units). */
  value: string
  onChange: (value: string) => void
}

function parseGroupQuota(
  value: string,
  silent: boolean
): Record<string, number> {
  const parsed = safeJsonParseWithValidation<Record<string, unknown>>(value, {
    fallback: {},
    validator: isObjectRecord,
    validatorMessage: 'Group quota must be a JSON object',
    context: 'monthly reset group quota',
    silent,
  })
  const result: Record<string, number> = {}
  for (const [group, quota] of Object.entries(parsed)) {
    const numeric = typeof quota === 'number' ? quota : Number(quota)
    if (Number.isFinite(numeric)) {
      result[group] = Math.round(numeric)
    }
  }
  return result
}

export function GroupQuotaVisualEditor(props: GroupQuotaVisualEditorProps) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editData, setEditData] = useState<GroupQuotaData | null>(null)

  const rows = useMemo<GroupQuotaData[]>(
    () =>
      Object.entries(parseGroupQuota(props.value, false))
        .map(([group, quota]) => ({ group, quota }))
        .sort((a, b) => a.group.localeCompare(b.group)),
    [props.value]
  )

  const configuredGroups = useMemo(() => rows.map((row) => row.group), [rows])

  const handleSave = (data: GroupQuotaData) => {
    const next = parseGroupQuota(props.value, true)
    next[data.group] = data.quota
    props.onChange(JSON.stringify(next))
  }

  const handleDelete = (group: string) => {
    const next = parseGroupQuota(props.value, true)
    delete next[group]
    props.onChange(JSON.stringify(next))
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-muted-foreground text-sm'>
          {t('Groups without a configured balance are left untouched.')}
        </p>
        <Button
          type='button'
          size='sm'
          className='w-full sm:w-auto'
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setEditData(null)
            setDialogOpen(true)
          }}
        >
          <Plus className='h-4 w-4 sm:mr-2' aria-hidden='true' />
          <span>{t('Add group quota')}</span>
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm'>
          {t(
            'No group quota configured. Click "Add group quota" to get started.'
          )}
        </div>
      ) : (
        <div className='rounded-md border'>
          <StaticDataTable
            className='rounded-none border-0'
            data={rows}
            getRowKey={(row) => row.group}
            columns={[
              {
                id: 'group',
                header: t('Group'),
                cell: (row) => <span className='font-medium'>{row.group}</span>,
              },
              {
                id: 'quota',
                header: t('Monthly reset balance'),
                cell: (row) => (
                  <span className='font-mono text-sm'>
                    {formatQuota(row.quota)}
                  </span>
                ),
              },
              {
                id: 'actions',
                header: t('Actions'),
                className: 'text-right',
                cellClassName: 'text-right',
                cell: (row) => (
                  <StaticRowActions
                    editLabel={t('Edit')}
                    deleteLabel={t('Delete')}
                    menuLabel={t('Open menu')}
                    onEdit={() => {
                      setEditData(row)
                      setDialogOpen(true)
                    }}
                    onDelete={() => handleDelete(row.group)}
                  />
                ),
              },
            ]}
          />
        </div>
      )}

      <GroupQuotaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        editData={editData}
        configuredGroups={configuredGroups}
      />
    </div>
  )
}
