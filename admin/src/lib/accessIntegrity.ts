import { primeAccessSubsystem } from './accessGate';

export function ensureAccessSubsystemLoaded(): boolean {
  return primeAccessSubsystem() === true;
}
