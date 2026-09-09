import { create } from 'zustand';

export const usePortalLoginState = create<{ pending: boolean; setPending: (pending: boolean) => void }>(set => ({
  pending: false,
  setPending: pending => set({ pending }),
}));
