import { ServiceKey } from './services';

// Declarative edge route table. app.ts mounts a router per entry; health and
// swagger read it so the gateway can describe its own surface. `auth: true`
// means the gateway verifies the JWT before proxying.
export interface RouteDef {
  prefix: string;
  service: ServiceKey;
  auth: boolean;
  description: string;
}

export const ROUTE_TABLE: RouteDef[] = [
  { prefix: '/v1/auth', service: 'identity', auth: false, description: 'Authentication, sessions, devices, password.' },
  { prefix: '/v1/platform', service: 'authorization', auth: true, description: 'IAM: products, portals, modules, roles, permissions.' },
  { prefix: '/v1/workspace', service: 'workspace', auth: true, description: 'Workspace: employees, HR, organization.' },
  { prefix: '/v1/core', service: 'core', auth: true, description: 'Core platform business API.' },
  { prefix: '/v1/notify', service: 'notification', auth: true, description: 'Notifications: email, push, SMS.' },
];
