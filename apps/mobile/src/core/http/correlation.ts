import {uuid} from 'expo-modules-core';

export function createCorrelationId(): string {
  return uuid.v4();
}
