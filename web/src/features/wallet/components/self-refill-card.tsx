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
import { Loader2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import { formatQuota } from '@/lib/format'

import type { SelfRefillInfo } from '../hooks/use-self-refill'

interface SelfRefillCardProps {
  info: SelfRefillInfo | undefined
  loading: boolean
  refilling: boolean
  onRefill: () => void
}

export function SelfRefillCard(props: SelfRefillCardProps) {
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (props.loading || !props.info?.enabled) {
    return null
  }

  const info = props.info
  const threshold = formatQuota(info.threshold ?? 0)
  const target = formatQuota(info.target ?? 0)
  const eligible = info.eligible === true

  const handleConfirm = () => {
    setConfirmOpen(false)
    props.onRefill()
  }

  return (
    <>
      <TitledCard
        title={t('Self Refill')}
        description={t(
          'When your balance drops below {{threshold}}, you can refill it to {{target}}.',
          { threshold, target }
        )}
        icon={<RefreshCw className='h-5 w-5' />}
        iconTone='success'
        action={
          <Button
            type='button'
            className='w-full sm:w-auto'
            disabled={!eligible || props.refilling}
            onClick={() => setConfirmOpen(true)}
          >
            {props.refilling && (
              <Loader2
                className='mr-2 h-4 w-4 animate-spin'
                aria-hidden='true'
              />
            )}
            {t('Refill balance')}
          </Button>
        }
      >
        <div className='flex flex-col gap-1 text-sm'>
          <p>
            <span className='text-muted-foreground'>
              {t('Current Balance')}:{' '}
            </span>
            <span className='font-medium'>{formatQuota(info.quota ?? 0)}</span>
          </p>
          {!eligible && (
            <p className='text-muted-foreground'>
              {t('Your balance is not below the threshold yet.')}
            </p>
          )}
        </div>
      </TitledCard>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Refill balance')}
        desc={t('Set your balance to {{target}}?', { target })}
        confirmText={t('Confirm')}
        handleConfirm={handleConfirm}
        isLoading={props.refilling}
      />
    </>
  )
}
