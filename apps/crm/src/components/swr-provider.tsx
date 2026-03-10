"use client";

import { SWRConfig } from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        dedupingInterval: 30000,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
