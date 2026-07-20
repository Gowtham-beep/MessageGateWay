import { SenderId, SENDER_ROUTES } from '../config/senders.js';

export type RoutePlan = { route: 'nexus' | 'orbit' | 'auto', primary: 'nexus' | 'orbit', fallback?: 'orbit' };

export function resolveRoute(senderId: string): RoutePlan | null {
  if (senderId in SENDER_ROUTES) {
    const route = SENDER_ROUTES[senderId as SenderId];
    if (route === 'nexus') return { route: 'nexus', primary: 'nexus' };
    if (route === 'orbit') return { route: 'orbit', primary: 'orbit' };
    if (route === 'auto') return { route: 'auto', primary: 'nexus', fallback: 'orbit' };
  }
  return null;
}
