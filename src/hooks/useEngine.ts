/**
 * Which optical transport the UI drives (F8) — ADR-0008.
 *
 * A hook rather than a prop because both transports exist for the whole life
 * of the application: the composition root builds each engine's services and
 * controllers whichever is selected, so switching is a state change and needs
 * no restart. That is what makes an A/B comparison on one device practical.
 */
import type { TransportEngine } from '@config/appComposition';

import { useAppServices } from './useAppServices';
import { useStore } from './useStore';

export function useEngine(): TransportEngine {
  return useStore(useAppServices().engine);
}
