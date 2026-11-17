import type { BusinessState } from "@/src/domain/business-state";

export type BusinessUpdater = (state: BusinessState) => BusinessState;

export class BusinessPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessPersistenceError";
  }
}
