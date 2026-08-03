import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { pingServer, setNetworkStatusHandler } from '@/lib/api';

interface NetworkContextValue {
  /** True when the last API request failed at the network level. */
  isOffline: boolean;
  /** True while a manual retry probe is in flight. */
  isRetrying: boolean;
  /** Probe the server again; clears the offline state on success. */
  retry: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // The api layer reports network failures (true) and recoveries (false).
  useEffect(() => {
    return setNetworkStatusHandler(setIsOffline);
  }, []);

  const retry = useCallback(async () => {
    setIsRetrying(true);
    try {
      // pingServer notifies the handler above, which updates isOffline.
      await pingServer();
    } finally {
      setIsRetrying(false);
    }
  }, []);

  return (
    <NetworkContext.Provider value={{ isOffline, isRetrying, retry }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used inside <NetworkProvider>');
  return ctx;
}
