import { createContext, useContext } from "react";
import { createHttpService } from "./httpService";
import { createMockService, SAMPLE_APPLICATIONS, SAMPLE_REVIEWS } from "./mockService";
import type { SaveMeService } from "./types";

/**
 * 백엔드 호출의 단일 입구.
 * VITE_API_BASE_URL(기본 /api, 같은 origin)의 FastAPI 백엔드를 쓰고,
 * VITE_USE_MOCK_API가 "true"면 샘플 데이터가 든 메모리 mock을 쓴다.
 * 화면은 `useService()`로 받으므로, 테스트는 새 mock을 넘길 수 있다.
 */
const useMock = import.meta.env.VITE_USE_MOCK_API === "true";
const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL || "/api";

export const defaultService: SaveMeService = useMock
  ? createMockService({ applications: SAMPLE_APPLICATIONS, reviews: SAMPLE_REVIEWS })
  : createHttpService(apiBaseUrl);

export const ServiceContext = createContext<SaveMeService>(defaultService);

export function useService(): SaveMeService {
  return useContext(ServiceContext);
}

export * from "./types";
export { ApiError, isConflict, isNotFound, isUnauthorized } from "./errors";
