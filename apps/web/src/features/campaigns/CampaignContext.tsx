import type { CampaignSummaryDto, Role } from '@ds/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCampaignRealtime } from '../../shared/realtime/socket';
import { useCampaigns } from './api';

const STORAGE_KEY = 'ds.currentCampaign';

interface CampaignContextValue {
  campaigns: CampaignSummaryDto[];
  current: CampaignSummaryDto | null;
  campaignId: string | null;
  role: Role | null;
  isGm: boolean;
  select(id: string): void;
  loading: boolean;
}

const Ctx = createContext<CampaignContextValue | null>(null);

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Campagne active : choisie dans la barre supérieure, mémorisée localement.
 * Le rôle (MJ / joueur) est porté par l'appartenance à la campagne, pas par le compte.
 */
export function CampaignProvider({ children }: { children: ReactNode }) {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const [selected, setSelected] = useState<string | null>(readStored);

  const current = useMemo(
    () => campaigns.find((c) => c.id === selected) ?? campaigns.find((c) => c.status === 'active') ?? campaigns[0] ?? null,
    [campaigns, selected],
  );

  const select = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* stockage indisponible : le choix reste en mémoire */
    }
  }, []);

  useEffect(() => {
    if (current && current.id !== selected) setSelected(current.id);
  }, [current, selected]);

  useCampaignRealtime(current?.id ?? null);

  const value = useMemo<CampaignContextValue>(
    () => ({
      campaigns,
      current,
      campaignId: current?.id ?? null,
      role: current?.role ?? null,
      isGm: current?.role === 'gm',
      select,
      loading: isLoading,
    }),
    [campaigns, current, select, isLoading],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentCampaign(): CampaignContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCurrentCampaign hors CampaignProvider');
  return ctx;
}
