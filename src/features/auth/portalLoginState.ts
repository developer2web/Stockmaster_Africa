import { create } from 'zustand';
import type { LoginPortal } from './portalRules';

type PortalLoginState = {
  pending: boolean;
  requestedPortal: LoginPortal | null;
  setPending: (pending: boolean) => void;
  setRequestedPortal: (portal: LoginPortal | null) => void;
};
export const usePortalLoginState = create<PortalLoginState>(set => ({
  pending: false,
  requestedPortal: null,
  setPending: pending => set({ pending }),
  setRequestedPortal: requestedPortal => set({ requestedPortal }),
}));
