import { create } from 'zustand'

type FilterValues = Record<string, string | number | undefined>

interface AdminFilterState {
  userFilters: FilterValues
  enterpriseFilters: FilterValues
  auditLogFilters: FilterValues
  setUserFilters: (filters: FilterValues) => void
  setEnterpriseFilters: (filters: FilterValues) => void
  setAuditLogFilters: (filters: FilterValues) => void
}

export const useAdminFilterStore = create<AdminFilterState>((set) => ({
  userFilters: {},
  enterpriseFilters: {},
  auditLogFilters: {},
  setUserFilters: (userFilters) => set({ userFilters }),
  setEnterpriseFilters: (enterpriseFilters) => set({ enterpriseFilters }),
  setAuditLogFilters: (auditLogFilters) => set({ auditLogFilters }),
}))
