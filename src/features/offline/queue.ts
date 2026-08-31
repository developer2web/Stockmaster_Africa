import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabase/client';

const QUEUE_KEY = 'stockmaster:offline-queue:v1';
let queueMutation: Promise<void> = Promise.resolve();

export type OfflineOperation = {
  id: string;
  type: 'sale' | 'expense' | 'cash';
  userId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  deviceId: string;
  attempts: number;
  lastError?: string;
};

function isOfflineOperation(value: unknown): value is OfflineOperation {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<OfflineOperation>;
  return typeof row.id === 'string'
    && ['sale', 'expense', 'cash'].includes(row.type ?? '')
    && typeof row.userId === 'string'
    && !!row.payload
    && typeof row.payload === 'object'
    && typeof row.createdAt === 'string'
    && typeof row.deviceId === 'string'
    && typeof row.attempts === 'number';
}

function serializeQueueMutation<T>(work: () => Promise<T>): Promise<T> {
  const result = queueMutation.then(work, work);
  queueMutation = result.then(() => undefined, () => undefined);
  return result;
}

export async function getOfflineQueue(): Promise<OfflineOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(isOfflineOperation);
      if (valid.length !== parsed.length) await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(valid));
      return valid;
    }
    await AsyncStorage.removeItem(QUEUE_KEY).catch(() => undefined);
    return [];
  } catch {
    await AsyncStorage.removeItem(QUEUE_KEY).catch(() => undefined);
    return [];
  }
}

export async function getCurrentUserOfflineQueue(): Promise<OfflineOperation[]> {
  const [queue,session]=await Promise.all([getOfflineQueue(),supabase.auth.getSession()]);
  const userId=session.data.session?.user.id;
  return userId?queue.filter(operation=>operation.userId===userId):[];
}

async function saveQueue(queue: OfflineOperation[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueOfflineOperation(operation: Omit<OfflineOperation, 'attempts' | 'userId'>) {
  return serializeQueueMutation(async () => {
    const queue = await getOfflineQueue();
    if (queue.some((item) => item.id === operation.id)) return;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new Error('Une première connexion avec Internet est nécessaire avant le mode hors ligne.');
    await saveQueue([...queue, { ...operation, userId, attempts: 0 }]);
  });
}

export async function removeOfflineOperation(id: string) {
  return serializeQueueMutation(async () => {
    const queue = await getOfflineQueue();
    const {data}=await supabase.auth.getSession();
    const userId=data.session?.user.id;
    await saveQueue(queue.filter((operation) => operation.id !== id || operation.userId !== userId));
  });
}

export function offlineErrorMessage(operation: OfflineOperation) {
  const message = operation.lastError ?? '';
  if (/stock|insuffisant|quantity|quantité/i.test(message)) {
    return 'Conflit de stock : le stock disponible sur le serveur ne permet pas cette opération. Vérifiez physiquement le stock avant de réessayer.';
  }
  if (/prix|price|taxe|tax|total/i.test(message)) {
    return 'Conflit de prix : un prix ou une taxe a changé depuis la saisie hors ligne. Annulez cette opération, vérifiez le panier puis recréez-la.';
  }
  if (/permission|autorisation|forbidden|policy/i.test(message)) {
    return 'Autorisation refusée : vérifiez le rôle, la boutique et l’abonnement de cet utilisateur.';
  }
  return message || 'Cette opération attend le retour d’Internet.';
}

async function send(operation: OfflineOperation) {
  if (operation.type === 'sale') {
    const { error } = await supabase.rpc('create_sale_v3', operation.payload as never);
    if (error) throw new Error(error.message);
    return;
  }
  if (operation.type === 'cash') {
    const { error } = await supabase.rpc('record_cash_transaction', operation.payload as never);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.rpc('record_expense', operation.payload as never);
  if (error) throw new Error(error.message);
}

export async function synchronizeOfflineQueue() {
  return serializeQueueMutation(async () => {
    const queue = await getOfflineQueue();
    const { data } = await supabase.auth.getSession();
    const currentUserId = data.session?.user.id;
    const remaining: OfflineOperation[] = [];
    let synced = 0;
    for (const operation of queue) {
      if (!currentUserId || operation.userId !== currentUserId) {
        remaining.push(operation);
        continue;
      }
      try {
        await send(operation);
        synced += 1;
      } catch (error) {
        remaining.push({ ...operation, attempts: operation.attempts + 1, lastError: error instanceof Error ? error.message : 'Erreur de synchronisation' });
      }
    }
    await saveQueue(remaining);
    return { synced, remaining };
  });
}
