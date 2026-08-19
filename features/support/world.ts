import { World, setWorldConstructor, type IWorldOptions } from '@cucumber/cucumber';

/**
 * Shared state for a single scenario. Cucumber builds one instance per scenario,
 * so anything stored here is automatically isolated between scenarios.
 */
export class ZaezdWorld extends World {
  readonly scratch = new Map<string, unknown>();

  constructor(options: IWorldOptions) {
    super(options);
  }

  remember(key: string, value: unknown): void {
    this.scratch.set(key, value);
  }

  recall<T>(key: string): T {
    if (!this.scratch.has(key)) {
      throw new Error(`Nothing was recorded under "${key}" earlier in this scenario`);
    }
    return this.scratch.get(key) as T;
  }
}

setWorldConstructor(ZaezdWorld);
