import { createContext, useContext } from "react";
import { createHttpService } from "./httpService";
import { createMockService, SAMPLE_APPLICATIONS } from "./mockService";
import type { SaveMeService } from "./types";

/**
 * Single entry point for every backend call.
 * Uses the FastAPI backend at VITE_API_BASE_URL (default /api, same origin),
 * or the in-memory mock with sample data when VITE_USE_MOCK_API is "true".
 * Screens get it from `useService()`, so tests can hand them a fresh mock.
 */
const useMock = import.meta.env.VITE_USE_MOCK_API === "true";
const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL || "/api";

export const defaultService: SaveMeService = useMock
  ? createMockService({ applications: SAMPLE_APPLICATIONS })
  : createHttpService(apiBaseUrl);

export const ServiceContext = createContext<SaveMeService>(defaultService);

export function useService(): SaveMeService {
  return useContext(ServiceContext);
}

export * from "./types";
export { ApiError, isConflict, isUnauthorized } from "./errors";
