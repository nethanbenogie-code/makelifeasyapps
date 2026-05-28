import { flushOfflineQueue } from './firebaseDB.js';
import { updateSyncBar, toast } from './utils.js';

export let isOnline = navigator.onLine;

export function initNetwork() {
  window.addEventListener('online', () => {
    isOnline = true;
    updateSyncBar();
    flushOfflineQueue();
    toast('Back online — syncing changes', 'emerald', 3000);
  });
  window.addEventListener('offline', () => {
    isOnline = false;
    updateSyncBar();
    toast('You are offline — changes will sync when reconnected', 'gold', 4000);
  });
  updateSyncBar();
}