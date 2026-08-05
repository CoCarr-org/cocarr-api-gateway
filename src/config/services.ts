import { env } from './env';

// The service registry — upstream base URLs keyed by name.
export const services = env.services;
export type ServiceKey = keyof typeof services;
