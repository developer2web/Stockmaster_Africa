import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase/client';
import { logger } from '@/services/observability/logger';

type CurrencyValue = {
  primaryCode: string;
  secondaryCode: string | null;
  formatMoney: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatForCurrency: (value: number, currencyCode: string) => string;
  formatSecondary: (value: number, rate: number | null) => string | null;
};

const DEFAULT_CURRENCY = 'CAD';
const CurrencyContext = createContext<CurrencyValue | null>(null);

function cacheKey(companyId: string) {
  return `stockmaster:currency:${companyId}`;
}

export function CurrencyProvider({ children }: PropsWithChildren) {
  const { membership } = useAuth();
  const [cachedPrimary, setCachedPrimary] = useState(DEFAULT_CURRENCY);
  const [cachedSecondary, setCachedSecondary] = useState<string | null>(null);
  const [secondaryRate, setSecondaryRate] = useState<number | null>(null);
  const companyId = membership?.companyId;

  useEffect(() => {
    if (!companyId) return;
    void AsyncStorage.getItem(cacheKey(companyId)).then((stored) => {
      if (!stored) return;
      try {
        const value = JSON.parse(stored) as { primary?: string; secondary?: string | null; rate?: number | null };
        if (value.primary) setCachedPrimary(value.primary);
        setCachedSecondary(value.secondary ?? null);
        setSecondaryRate(value.rate ?? null);
      } catch {
        // Ignore a corrupt display-only cache; the server remains authoritative.
      }
    }).catch((error) => logger.warning('currency_cache_read_failed', error, { companyId }));
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !membership?.defaultCurrencyCode) return;
    setCachedPrimary(membership.defaultCurrencyCode);
    setCachedSecondary(membership.secondaryCurrencyCode);
    void AsyncStorage.setItem(cacheKey(companyId), JSON.stringify({
      primary: membership.defaultCurrencyCode,
      secondary: membership.secondaryCurrencyCode,
      rate: secondaryRate,
    })).catch((error) => logger.warning('currency_cache_write_failed', error, { companyId }));
  }, [companyId, membership?.defaultCurrencyCode, membership?.secondaryCurrencyCode, secondaryRate]);

  const primaryCode = membership?.defaultCurrencyCode ?? cachedPrimary;
  const secondaryCode = membership?.secondaryCurrencyCode ?? cachedSecondary;
  useEffect(() => {
    if (!companyId || !secondaryCode) {
      setSecondaryRate(null);
      return;
    }
    void (async () => {
      try {
        const { data, error } = await supabase.from('currency_exchange_rates')
          .select('rate')
          .eq('base_currency_code', primaryCode)
          .eq('quote_currency_code', secondaryCode)
          .order('effective_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        const rate = data?.rate ? Number(data.rate) : null;
        setSecondaryRate(rate);
        void AsyncStorage.setItem(cacheKey(companyId), JSON.stringify({
          primary: primaryCode,
          secondary: secondaryCode,
          rate,
        })).catch((cacheError) => logger.warning('currency_cache_write_failed', cacheError, { companyId }));
      } catch (error) {
        await logger.warning('currency_rate_load_failed', error, { companyId, primaryCode, secondaryCode });
      }
    })();
  }, [companyId, primaryCode, secondaryCode]);

  const value = useMemo<CurrencyValue>(() => ({
    primaryCode,
    secondaryCode,
    formatMoney: (amount, options) => {
      const numeric = Number(amount) || 0;
      const primary = new Intl.NumberFormat('fr-CA', {
        style: 'currency',
        currency: primaryCode,
        currencyDisplay: 'code',
        ...options,
      }).format(numeric);
      if (!secondaryCode || !secondaryRate) return primary;
      const secondary = new Intl.NumberFormat('fr-CA', {
        style: 'currency',
        currency: secondaryCode,
        currencyDisplay: 'code',
        ...options,
      }).format(numeric * secondaryRate);
      return `${primary} · ${secondary}`;
    },
    formatForCurrency: (amount, currencyCode) => new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'code',
    }).format(Number(amount) || 0),
    formatSecondary: (amount, rate) => secondaryCode && rate
      ? new Intl.NumberFormat('fr-CA', {
        style: 'currency',
        currency: secondaryCode,
        currencyDisplay: 'code',
      }).format((Number(amount) || 0) * rate)
      : null,
  }), [primaryCode, secondaryCode, secondaryRate]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const value = useContext(CurrencyContext);
  if (!value) throw new Error('useCurrency doit être utilisé dans CurrencyProvider');
  return value;
}
