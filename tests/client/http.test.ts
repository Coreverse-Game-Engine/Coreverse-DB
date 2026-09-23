import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureCoreverseClient,
  coreverseFetch,
  CoreverseApiError,
  type CoreverseClientConfig,
  type CoreverseErrorBody,
} from "../../src/client/http";

// coreverseFetch is the single hand-written entry point every Orval-generated
// endpoint calls through (see orval.config.ts -> output.override.mutator).
// It owns: baseUrl joining, Bearer-token injection, Content-Type/FormData
// handling, the 204 envelope, and turning non-2xx responses into
// CoreverseApiError. All of that is covered here.

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

const BASE_URL = "https://api.example.test/functions/v1";

describe("coreverseFetch", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  function configure(overrides: Partial<CoreverseClientConfig> = {}): void {
    configureCoreverseClient({
      baseUrl: BASE_URL,
      fetch: mockFetch as unknown as typeof fetch,
      ...overrides,
    });
  }

  // --- requireConfig guard ---------------------------------------------
  describe("requireConfig guard", () => {
    it("throws a descriptive error when called before configureCoreverseClient()", async () => {
      // Use a fresh, never-configured module instance so this doesn't
      // depend on test execution order relative to the configure() calls
      // in every other describe block below.
      vi.resetModules();
      const fresh = await import("../../src/client/http");

      await expect(fresh.coreverseFetch("/teams")).rejects.toThrow(
        /configureCoreverseClient\(\) was called/,
      );
    });
  });

  // --- URL joining --------------------------------------------------------
  describe("request URL", () => {
    it("joins baseUrl and the relative url with no extra separators", async () => {
      configure();
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await coreverseFetch("/teams/abc");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl] = mockFetch.mock.calls[0]!;
      expect(calledUrl).toBe(`${BASE_URL}/teams/abc`);
    });
  });

  // --- Authorization header -------------------------------------------
  describe("auth header injection", () => {
    it("adds a Bearer Authorization header when getAuthToken resolves a token", async () => {
      configure({ getAuthToken: () => "token-123" });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await coreverseFetch("/profiles/me");

      const [, init] = mockFetch.mock.calls[0]!;
      const headers = init.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer token-123");
    });

    it("awaits an async getAuthToken before sending the request", async () => {
      configure({ getAuthToken: async () => "async-token" });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await coreverseFetch("/profiles/me");

      const [, init] = mockFetch.mock.calls[0]!;
      const headers = init.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer async-token");
    });

    it("adds no Authorization header when getAuthToken resolves null/undefined", async () => {
      configure({ getAuthToken: () => undefined });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await coreverseFetch("/news");

      const [, init] = mockFetch.mock.calls[0]!;
      const headers = init.headers as Headers;
      expect(headers.has("Authorization")).toBe(false);
    });

    it("adds no Authorization header when getAuthToken is not configured (public endpoints)", async () => {
      configure();
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await coreverseFetch("/news");

      const [, init] = mockFetch.mock.calls[0]!;
      const headers = init.headers as Headers;
      expect(headers.has("Authorization")).toBe(false);
    });

    it("does not overwrite a caller-supplied Authorization header", async () => {
      configure({ getAuthToken: () => "from-config" });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await coreverseFetch("/news", {
        headers: { Authorization: "Bearer from-caller" },
      });

      const [, init] = mockFetch.mock.calls[0]!;
      const headers = init.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer from-caller");
    });
  });

  // --- Content-Type / FormData ------------------------------------------
  describe("Content-Type handling", () => {
    it("sets application/json for a plain (non-FormData) body", async () => {
      configure();
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await coreverseFetch("/teams", {
        method: "POST",
        body: JSON.stringify({ name: "Team" }),
      });

      const [, init] = mockFetch.mock.calls[0]!;
      const headers = init.headers as Headers;
      expect(headers.get("Content-Type")).toBe("application/json");
    });

    it("never sets Content-Type for a FormData body (must not suppress the multipart boundary)", async () => {
      configure();
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      const form = new FormData();
      form.append("file", new Blob(["avatar-bytes"]), "avatar.png");

      await coreverseFetch("/profiles/me/avatar", {
        method: "POST",
        body: form,
      });

      const [, init] = mockFetch.mock.calls[0]!;
      const headers = init.headers as Headers;
      expect(headers.has("Content-Type")).toBe(false);
    });

    it("does not overwrite a caller-supplied Content-Type", async () => {
      configure();
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await coreverseFetch("/docs/reindex", {
        method: "POST",
        body: "raw-text",
        headers: { "Content-Type": "text/plain" },
      });

      const [, init] = mockFetch.mock.calls[0]!;
      const headers = init.headers as Headers;
      expect(headers.get("Content-Type")).toBe("text/plain");
    });

    it("sets no Content-Type when there is no request body", async () => {
      configure();
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await coreverseFetch("/news");

      const [, init] = mockFetch.mock.calls[0]!;
      const headers = init.headers as Headers;
      expect(headers.has("Content-Type")).toBe(false);
    });
  });

  // --- Success envelope -------------------------------------------------
  describe("success envelope", () => {
    it("returns { data, status, headers } for a normal JSON 200 response", async () => {
      configure();
      mockFetch.mockResolvedValue(jsonResponse({ id: "1", name: "Team" }, { status: 200 }));

      const result = await coreverseFetch<{
        data: { id: string; name: string };
        status: number;
        headers: Headers;
      }>("/teams/1");

      expect(result.status).toBe(200);
      expect(result.data).toEqual({ id: "1", name: "Team" });
      expect(result.headers).toBeInstanceOf(Headers);
    });

    it("returns { data: undefined, status: 204 } for No Content responses, without touching the body", async () => {
      configure();
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      const result = await coreverseFetch<{
        data: undefined;
        status: number;
        headers: Headers;
      }>("/teams/1", { method: "DELETE" });

      expect(result.status).toBe(204);
      expect(result.data).toBeUndefined();
      expect(result.headers).toBeInstanceOf(Headers);
    });

    it("returns { data: undefined } for a 200 with an empty body, without calling JSON.parse on it", async () => {
      configure();
      mockFetch.mockResolvedValue(new Response("", { status: 200 }));

      const result = await coreverseFetch<{ data: undefined; status: number }>("/news");

      expect(result.status).toBe(200);
      expect(result.data).toBeUndefined();
    });
  });

  // --- Error envelope -----------------------------------------------------
  describe("error handling", () => {
    it("throws CoreverseApiError carrying the status/code/message/body from the JSON error response", async () => {
      configure();
      const body: CoreverseErrorBody = { error: "not_found", message: "Team not found." };
      mockFetch.mockResolvedValue(jsonResponse(body, { status: 404 }));

      const error: unknown = await coreverseFetch("/teams/missing").catch((e) => e);

      expect(error).toBeInstanceOf(CoreverseApiError);
      const apiError = error as CoreverseApiError;
      expect(apiError.status).toBe(404);
      expect(apiError.code).toBe("not_found");
      expect(apiError.message).toBe("Team not found.");
      expect(apiError.body).toEqual(body);
      expect(apiError.name).toBe("CoreverseApiError");
    });

    it("falls back to code 'unknown_error' and a generic message when the error body can't be parsed", async () => {
      configure();
      mockFetch.mockResolvedValue(new Response("", { status: 500 }));

      const error: unknown = await coreverseFetch("/teams").catch((e) => e);

      expect(error).toBeInstanceOf(CoreverseApiError);
      const apiError = error as CoreverseApiError;
      expect(apiError.status).toBe(500);
      expect(apiError.code).toBe("unknown_error");
      expect(apiError.message).toBe("Coreverse DB API request failed with status 500.");
      expect(apiError.body).toBeUndefined();
    });

    it("still throws CoreverseApiError for a non-2xx response that does return a JSON body without a message", async () => {
      configure();
      mockFetch.mockResolvedValue(jsonResponse({ error: "rate_limited" }, { status: 429 }));

      const error: unknown = await coreverseFetch("/auth/password-reset").catch((e) => e);

      expect(error).toBeInstanceOf(CoreverseApiError);
      const apiError = error as CoreverseApiError;
      expect(apiError.status).toBe(429);
      expect(apiError.code).toBe("rate_limited");
      expect(apiError.message).toBe(
        "Coreverse DB API request failed with status 429.",
      );
    });
  });

  // --- fetch override -----------------------------------------------------
  describe("fetch override", () => {
    it("uses config.fetch instead of the global fetch when one is provided", async () => {
      const globalFetchSpy = vi.spyOn(globalThis, "fetch");
      configure();
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await coreverseFetch("/news");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(globalFetchSpy).not.toHaveBeenCalled();
    });

    it("falls back to the global fetch when config.fetch is not provided", async () => {
      const globalFetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse({ ok: true }));

      configureCoreverseClient({ baseUrl: BASE_URL });
      await coreverseFetch("/news");

      expect(globalFetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe("CoreverseApiError", () => {
  it("uses the body's message when provided", () => {
    const error = new CoreverseApiError(400, { error: "invalid_redirect", message: "Bad redirect." });
    expect(error.message).toBe("Bad redirect.");
    expect(error.code).toBe("invalid_redirect");
    expect(error.status).toBe(400);
  });

  it("falls back to a generic message and 'unknown_error' code when body is undefined", () => {
    const error = new CoreverseApiError(503, undefined);
    expect(error.message).toBe("Coreverse DB API request failed with status 503.");
    expect(error.code).toBe("unknown_error");
    expect(error.body).toBeUndefined();
  });

  it("is a real Error instance (stack trace, instanceof Error)", () => {
    const error = new CoreverseApiError(500, undefined);
    expect(error).toBeInstanceOf(Error);
    expect(typeof error.stack).toBe("string");
  });
});
