/**
 * hooks/ — UI layer
 *
 * React hooks that expose controller and state APIs to components. The only
 * place React and the controllers meet: a controller may not import React,
 * and a component may not reach past a hook to a service.
 *
 * May depend on: controllers, state, React.
 * Must NOT depend on: core protocol, repositories, adapters.
 */

export { useStore, useStoreSelector } from './useStore';

export { useElapsed } from './useElapsed';
export { useTransferDisplay } from './useTransferDisplay';

export { useFrameDriver } from './useFrameDriver';

export {
  AppServicesProvider,
  useAppServices,
  type AppServices,
  type AppServicesProviderProps,
} from './useAppServices';
