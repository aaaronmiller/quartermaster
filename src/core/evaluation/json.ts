import { GatewayError } from './gateway';

export function parseJsonContent<T>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (err) {
    throw new GatewayError(`Model response was not valid JSON: ${(err as Error).message}`);
  }
}
