export const SENDER_ROUTES = {
  NEXUS01: 'nexus',
  NEXUS02: 'nexus',
  ORBIT01: 'orbit',
  AUTO01: 'auto',
} as const;

export type SenderId = keyof typeof SENDER_ROUTES;
export type ProviderId = typeof SENDER_ROUTES[SenderId];
