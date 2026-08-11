import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'stockmaster-workspace';

type PersistedWorkspace = {
  companyId: string | null;
  storeId: string | null;
};

async function saveWorkspace(workspace: PersistedWorkspace) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

type WorkspaceState = {
  companyId: string | null;
  storeId: string | null;
  hydrated: boolean;
  selectBusiness: (companyId: string | null) => void;
  selectStore: (storeId: string | null) => void;
  clear: () => void;
  setHydrated: (hydrated: boolean) => void;
};

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  companyId: null,
  storeId: null,
  hydrated: false,
  selectBusiness: (companyId) => {
    const workspace = { companyId, storeId: null };
    set(workspace);
    void saveWorkspace(workspace);
  },
  selectStore: (storeId) => {
    const workspace = { companyId: get().companyId, storeId };
    set({ storeId });
    void saveWorkspace(workspace);
  },
  clear: () => {
    const workspace = { companyId: null, storeId: null };
    set(workspace);
    void saveWorkspace(workspace);
  },
  setHydrated: (hydrated) => set({ hydrated }),
}));

void AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    if (stored) {
      const workspace = JSON.parse(stored) as Partial<PersistedWorkspace>;
      useWorkspaceStore.setState({
        companyId: workspace.companyId ?? null,
        storeId: workspace.storeId ?? null,
      });
    }
  })
  .catch(() => {
    // A failed local read must not prevent the authentication screen from loading.
  })
  .finally(() => useWorkspaceStore.setState({ hydrated: true }));
