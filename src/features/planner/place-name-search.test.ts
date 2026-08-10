import { describe, expect, it, vi } from "vitest";
import {
  MINIMUM_PLACE_NAME_QUERY_LENGTH,
  resolvePlaceNameMatch,
  searchPlaceNames,
} from "./place-name-search";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SAMPLE_CANDIDATE = {
  id: "700000123",
  type: "poblacion",
  address: "Sample hamlet, Sample hamlet (Sample municipality)",
  muni: "Sample municipality",
  province: "Burgos",
  lat: 0.0,
  lng: 0.0,
  state: 0,
};

describe("searchPlaceNames", () => {
  it("requests the candidates endpoint without street layers and maps records", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse([SAMPLE_CANDIDATE]),
    );

    const matches = await searchPlaceNames("Sample hamlet", undefined, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.origin).toBe("https://www.cartociudad.es");
    expect(url.pathname).toBe("/geocoder/api/geocoder/candidates");
    expect(url.searchParams.get("q")).toBe("Sample hamlet");
    expect(url.searchParams.get("no_process")).toBe(
      "callejero,portal,expendeduria",
    );
    expect(matches).toEqual([
      {
        id: "700000123",
        type: "poblacion",
        name: "Sample hamlet, Sample hamlet (Sample municipality)",
        municipality: "Sample municipality",
        province: "Burgos",
      },
    ]);
  });

  it("returns an empty list for queries below the minimum length without a request", async () => {
    const fetchMock = vi.fn();
    const shortQuery = ` ${"a".repeat(MINIMUM_PLACE_NAME_QUERY_LENGTH - 1)} `;

    const matches = await searchPlaceNames(shortQuery, undefined, fetchMock);

    expect(matches).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a 204 answer as an explicit empty result", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(
      searchPlaceNames("nowhere", undefined, fetchMock),
    ).resolves.toEqual([]);
  });

  it("throws on transport failures and malformed payloads", async () => {
    const failing = vi.fn(async () => new Response("", { status: 503 }));
    await expect(
      searchPlaceNames("Burgos", undefined, failing),
    ).rejects.toThrow(/HTTP 503/);

    const malformed = vi.fn(async () =>
      jsonResponse([{ id: "1", type: "poblacion" }]),
    );
    await expect(
      searchPlaceNames("Burgos", undefined, malformed),
    ).rejects.toThrow();
  });
});

describe("resolvePlaceNameMatch", () => {
  it("passes the candidate identity through verbatim and returns the coordinate", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({
        ...SAMPLE_CANDIDATE,
        lat: 42.12345678901234,
        lng: -3.567890123456789,
        geom: "MULTIPOLYGON(((0 0)))",
      }),
    );

    const coordinate = await resolvePlaceNameMatch(
      { id: "700000123", type: "Municipio" },
      undefined,
      fetchMock,
    );

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/geocoder/api/geocoder/find");
    expect(url.searchParams.get("id")).toBe("700000123");
    expect(url.searchParams.get("type")).toBe("Municipio");
    expect(coordinate).toEqual({
      latitude: 42.12345678901234,
      longitude: -3.567890123456789,
    });
  });

  it("keeps unusable answers as an explicit unknown", async () => {
    const zeroPair = vi.fn(async () =>
      jsonResponse({ ...SAMPLE_CANDIDATE, lat: 0, lng: 0 }),
    );
    await expect(
      resolvePlaceNameMatch({ id: "1", type: "poblacion" }, undefined, zeroPair),
    ).resolves.toBeNull();

    const missing = vi.fn(async () => jsonResponse({ address: "x" }));
    await expect(
      resolvePlaceNameMatch({ id: "1", type: "poblacion" }, undefined, missing),
    ).resolves.toBeNull();

    const empty = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(
      resolvePlaceNameMatch({ id: "1", type: "poblacion" }, undefined, empty),
    ).resolves.toBeNull();
  });

  it("throws when the find endpoint fails in transport", async () => {
    const failing = vi.fn(async () => new Response("", { status: 500 }));
    await expect(
      resolvePlaceNameMatch({ id: "1", type: "poblacion" }, undefined, failing),
    ).rejects.toThrow(/HTTP 500/);
  });
});
