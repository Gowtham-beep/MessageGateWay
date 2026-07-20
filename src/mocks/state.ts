export type NexusScenario = 'ok' | 'rate_limit' | 'server_error' | 'timeout';
export type OrbitScenario = 'ok' | 'rate_limit' | 'server_error' | 'timeout';

export interface NexusMessage {
  clientRef: string;
  destination: string;
  status: string;
}

export interface OrbitMessage {
  clientRef: string;
  destination: string;
  status: string;
  pollsSeen: number;
}

export let nexusQueue: NexusScenario[] = [];
export let orbitQueue: OrbitScenario[] = [];
export let nexusMessages = new Map<string, NexusMessage>();
export let orbitMessages = new Map<string, OrbitMessage>();
export let orbitScript = new Map<string, string[]>();

export let nexusIdCounter = 1;
export let orbitIdCounter = 1;

export function getNextNexusId() { return `nx_${nexusIdCounter++}`; }
export function getNextOrbitId() { return `ob_${orbitIdCounter++}`; }

export function resetMocks() {
  nexusQueue = [];
  orbitQueue = [];
  nexusMessages.clear();
  orbitMessages.clear();
  orbitScript.clear();
  nexusIdCounter = 1;
  orbitIdCounter = 1;
}

export function pushNexusScenario(kind: NexusScenario | NexusScenario[]) {
  if (Array.isArray(kind)) {
    nexusQueue.push(...kind);
  } else {
    nexusQueue.push(kind);
  }
}

export function pushOrbitScenario(kind: OrbitScenario | OrbitScenario[]) {
  if (Array.isArray(kind)) {
    orbitQueue.push(...kind);
  } else {
    orbitQueue.push(kind);
  }
}

export function setOrbitScript(clientRef: string, statuses: string[]) {
  orbitScript.set(clientRef, statuses);
}
