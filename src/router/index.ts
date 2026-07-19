import { SenderId, ProviderId, SENDER_ROUTES } from '../config/senders.js';

export function resolveProvider(senderId: SenderId): ProviderId {
  // stub
  return SENDER_ROUTES[senderId];
}
