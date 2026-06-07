import { fetchEnterprises } from './enterprises'
import type { ListQuery } from '../types/admin'

export async function fetchQuotaUsage(query: ListQuery) {
  return fetchEnterprises(query)
}
