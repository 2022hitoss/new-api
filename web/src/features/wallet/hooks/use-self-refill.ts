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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { ApiResponse } from '../types'

export type SelfRefillInfo = {
  enabled: boolean
  threshold?: number
  target?: number
  quota?: number
  eligible?: boolean
}

export type SelfRefillResult = {
  before: number
  after: number
  quota: number
}

export const SELF_REFILL_INFO_QUERY_KEY = ['self-refill-info'] as const

export async function getSelfRefillInfo(): Promise<
  ApiResponse<SelfRefillInfo>
> {
  const res = await api.get('/api/user/self/refill')
  return res.data
}

export async function postSelfRefill(): Promise<ApiResponse<SelfRefillResult>> {
  const res = await api.post('/api/user/self/refill')
  return res.data
}

/**
 * Self refill lets a user set their own balance to the admin-configured target
 * while it is below the configured threshold. The info query drives the card
 * visibility; the mutation performs the refill and refreshes the wallet.
 */
export function useSelfRefill(onRefilled?: () => Promise<void> | void) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const infoQuery = useQuery({
    queryKey: SELF_REFILL_INFO_QUERY_KEY,
    queryFn: async () => requireServerSuccess(await getSelfRefillInfo()),
    meta: { errorToast: false },
  })

  const mutation = useMutation({
    mutationFn: async () => requireServerSuccess(await postSelfRefill()),
    onSuccess: async (response) => {
      toast.success(
        t('Balance refilled to {{quota}}', {
          quota: formatQuota(response.data?.after ?? 0),
        })
      )
      await queryClient.invalidateQueries({
        queryKey: SELF_REFILL_INFO_QUERY_KEY,
      })
      await onRefilled?.()
    },
    onError: (error) => {
      handleServerError(error, t('Refill failed'))
    },
  })

  return {
    info: infoQuery.data?.data,
    loading: infoQuery.isPending,
    refilling: mutation.isPending,
    refill: () => mutation.mutate(),
  }
}
