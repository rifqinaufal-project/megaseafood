"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLocalBusiness } from "@/src/presentation/dashboard/use-local-business";

type BusinessContextValue = ReturnType<typeof useLocalBusiness>;

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const value = useLocalBusiness();
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness() {
  const value = useContext(BusinessContext);
  if (!value) throw new Error("useBusiness dipakai di luar BusinessProvider");
  return value;
}
