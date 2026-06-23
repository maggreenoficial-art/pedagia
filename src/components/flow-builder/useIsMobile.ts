'use client';

import { useSyncExternalStore } from 'react';

const MQ = '(max-width: 767px)';

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(MQ);
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(MQ).matches;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
