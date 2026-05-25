'use client'

import { createContext, useContext } from 'react'

export const TenantContext = createContext<string>('')

export function useTenant(): string {
  return useContext(TenantContext)
}
