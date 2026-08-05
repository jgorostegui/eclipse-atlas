import { describe, expect, it } from "vitest";
import {
  MAX_COMPARISON_POINTS,
  PLANNER_URL_STATE_VERSION,
  createGeoLocationReference,
  customCandidateId,
  parsePlannerUrl,
  plannerLocationReferenceKey,
  serializePlannerUrl,
  type PlannerUrlStateV1,
} from "./planner-url-state";

function url(search: string) {
  return new URL(`https://example.test/planner${search}`);
}

function place(id: string) {
  return { kind: "place" as const, id };
}

function geo(latitude: number, longitude: number) {
  return { kind: "geo" as const, latitude, longitude };
}

function state(
  patch: Partial<PlannerUrlStateV1> = {},
): PlannerUrlStateV1 {
  return {
    version: PLANNER_URL_STATE_VERSION,
    locale: "es",
    eventId: "2026",
    selected: null,
    compared: [],
    layer: "totality-duration",
    ...patch,
  };
}

describe("planner URL state v1", () => {
  it("parses a complete Soria, Burgos and Bardenas comparison", () => {
    const result = parsePlannerUrl(
      url(
        "?state=1&lang=es" +
          "&selected=place:soria" +
          "&compare=place:soria" +
          "&compare=place:burgos-neutral-control" +
          "&compare=place:el-ferial" +
          "&layer=solar-altitude-at-maximum",
      ),
    );

    expect(result).toEqual({
      plannerStateApplied: true,
      issues: [],
      state: {
        version: 1,
        locale: "es",
        eventId: "2026",
        selected: place("soria"),
        compared: [
          place("soria"),
          place("burgos-neutral-control"),
          place("el-ferial"),
        ],
        layer: "solar-altitude-at-maximum",
      },
    });
  });

  it.each(["august-cloud-climate", "eclipse-day-cloud-forecast"] as const)(
    "round-trips the %s atmospheric map view",
    (layer) => {
      const parsed = parsePlannerUrl(url(`?state=1&lang=es&layer=${layer}`));
      expect(parsed.issues).toEqual([]);
      expect(parsed.state.layer).toBe(layer);
      expect(
        serializePlannerUrl("https://example.test/", parsed.state).searchParams.get(
          "layer",
        ),
      ).toBe(layer);
    },
  );

  it("keeps a valid legacy language without applying versioned planner state", () => {
    expect(parsePlannerUrl(url("?lang=en"))).toEqual({
      plannerStateApplied: false,
      issues: [],
      state: {
        version: 1,
        locale: "en",
        eventId: "2026",
        selected: null,
        compared: [],
        layer: "totality-duration",
      },
    });
  });

  it("ignores planner parameters without their required state version", () => {
    const result = parsePlannerUrl(
      url("?lang=es&selected=place:arguedas&layer=maximum-obscuration"),
    );

    expect(result.plannerStateApplied).toBe(false);
    expect(result.state.selected).toBeNull();
    expect(result.state.layer).toBe("totality-duration");
    expect(result.issues).toEqual([
      {
        code: "missing-state-version",
        parameter: "state",
        value: null,
      },
    ]);
  });

  it("ignores an unsupported state version while retaining a valid locale", () => {
    const result = parsePlannerUrl(
      url("?state=2&lang=es&selected=place:arguedas&compare=place:el-ferial"),
    );

    expect(result.plannerStateApplied).toBe(false);
    expect(result.state).toMatchObject({
      locale: "es",
      selected: null,
      compared: [],
      layer: "totality-duration",
    });
    expect(result.issues).toContainEqual({
      code: "invalid-state-version",
      parameter: "state",
      value: "2",
    });
  });

  it("reports duplicate scalar parameters and uses their first values", () => {
    const result = parsePlannerUrl(
      url(
        "?state=1&state=2&lang=es&lang=en" +
          "&selected=place:arguedas&selected=place:el-ferial" +
          "&layer=none&layer=maximum-obscuration",
      ),
    );

    expect(result.plannerStateApplied).toBe(true);
    expect(result.state).toMatchObject({
      locale: "es",
      selected: place("arguedas"),
      layer: "none",
    });
    expect(result.issues).toEqual([
      {
        code: "duplicate-parameter",
        parameter: "lang",
        value: "en",
        index: 1,
      },
      {
        code: "duplicate-parameter",
        parameter: "state",
        value: "2",
        index: 1,
      },
      {
        code: "duplicate-parameter",
        parameter: "selected",
        value: "place:el-ferial",
        index: 1,
      },
      {
        code: "duplicate-parameter",
        parameter: "layer",
        value: "maximum-obscuration",
        index: 1,
      },
    ]);
  });

  it.each([
    {
      token: "candidate:arguedas",
      code: "invalid-reference-format",
    },
    {
      token: "place:not-a-candidate",
      code: "unknown-place-reference",
    },
    {
      token: "geo:41.7",
      code: "invalid-coordinate-reference",
    },
    {
      token: "geo:41.7,-2.4,12",
      code: "invalid-coordinate-reference",
    },
    {
      token: "geo:1e2,-2.4",
      code: "invalid-coordinate-reference",
    },
    {
      token: "geo:51.5,-0.1",
      code: "unsupported-coordinate",
    },
  ])("reports $code for selected=$token", ({ code, token }) => {
    const result = parsePlannerUrl(
      url(`?state=1&selected=${encodeURIComponent(token)}`),
    );

    expect(result.state.selected).toBeNull();
    expect(result.issues).toContainEqual({
      code,
      parameter: "selected",
      value: token,
    });
  });

  it("canonicalizes the case of a known place identifier in a shared link", () => {
    const result = parsePlannerUrl(
      url("?state=1&selected=place:Punta-del-pozacu-viewpoint"),
    );

    expect(result.state.selected).toEqual(
      place("punta-del-pozacu-viewpoint"),
    );
    expect(result.issues).toEqual([]);
  });

  it("skips invalid comparisons, removes duplicates and keeps the first three unique references", () => {
    const result = parsePlannerUrl(
      url(
        "?state=1" +
          "&compare=place:arguedas" +
          "&compare=place:missing" +
          "&compare=place:arguedas" +
          "&compare=place:burgos-neutral-control" +
          "&compare=place:el-ferial" +
          "&compare=place:soria-neutral-control",
      ),
    );

    expect(result.state.compared).toEqual([
      place("arguedas"),
      place("burgos-neutral-control"),
      place("el-ferial"),
    ]);
    expect(result.issues).toEqual([
      {
        code: "unknown-place-reference",
        parameter: "compare",
        value: "place:missing",
        index: 1,
      },
      {
        code: "duplicate-comparison",
        parameter: "compare",
        value: "place:arguedas",
        index: 2,
      },
      {
        code: "comparison-limit-exceeded",
        parameter: "compare",
        value: "place:soria-neutral-control",
        index: 5,
      },
    ]);
  });

  it("defaults invalid locale and layer values without inventing replacements", () => {
    const result = parsePlannerUrl(url("?state=1&lang=fr&layer=terrain"));

    expect(result.state.locale).toBeNull();
    expect(result.state.layer).toBe("none");
    expect(result.issues).toEqual([
      { code: "invalid-locale", parameter: "lang", value: "fr" },
      { code: "invalid-layer", parameter: "layer", value: "terrain" },
    ]);
  });

  it("normalizes geographic references and produces deterministic custom IDs", () => {
    const normalized = createGeoLocationReference(41.76360049, -0.0000001);

    expect(normalized).toEqual(geo(41.7636, 0));
    expect(plannerLocationReferenceKey(normalized)).toBe(
      "geo:41.763600,0.000000",
    );
    expect(customCandidateId(41.76360049, -0.0000001)).toBe(
      "custom:41.763600,0.000000",
    );
    expect(customCandidateId(41.76360041, 0)).toBe(
      "custom:41.763600,0.000000",
    );
  });

  it("accepts coordinates in each configured request-envelope family", () => {
    const result = parsePlannerUrl(
      url(
        "?state=1" +
          "&selected=geo:28.2916,-16.6291" +
          "&compare=geo:35.3,-2.95",
      ),
    );

    expect(result.issues).toEqual([]);
    expect(result.state.selected).toEqual(geo(28.2916, -16.6291));
    expect(result.state.compared).toEqual([geo(35.3, -2.95)]);
  });

  it("round-trips every national visualization mode, including umbra playback", () => {
    for (const layer of [
      "totality-duration",
      "umbra-passage",
      "maximum-obscuration",
      "solar-altitude-at-maximum",
      "none",
    ] as const) {
      const parsed = parsePlannerUrl(url(`?state=1&layer=${layer}`));
      expect(parsed.issues).toEqual([]);
      expect(parsed.state.layer).toBe(layer);
      expect(serializePlannerUrl(url(""), parsed.state).searchParams.get("layer"))
        .toBe(layer);
    }
  });

  it("serializes a canonical state without mutating the base URL", () => {
    const base = new URL(
      "https://example.test/tool?utm_source=test&tag=one&tag=two" +
        "&state=9&lang=en&selected=place:arguedas" +
        "&compare=place:arguedas&layer=maximum-obscuration#comparison",
    );
    const original = base.href;
    const serialized = serializePlannerUrl(
      base,
      state({
        selected: geo(41.76360049, -2.46490049),
        compared: [
          geo(41.76360049, -2.46490049),
          place("burgos-neutral-control"),
          place("el-ferial"),
        ],
        layer: "solar-altitude-at-maximum",
      }),
    );

    expect(base.href).toBe(original);
    expect(serialized.hash).toBe("#comparison");
    expect(serialized.searchParams.get("utm_source")).toBe("test");
    expect(serialized.searchParams.getAll("tag")).toEqual(["one", "two"]);
    expect(serialized.searchParams.getAll("state")).toEqual(["1"]);
    expect(serialized.searchParams.getAll("lang")).toEqual(["es"]);
    expect(serialized.searchParams.getAll("event")).toEqual(["2026"]);
    expect(serialized.searchParams.getAll("selected")).toEqual([
      "geo:41.763600,-2.464900",
    ]);
    expect(serialized.searchParams.getAll("compare")).toEqual([
      "geo:41.763600,-2.464900",
      "place:burgos-neutral-control",
      "place:el-ferial",
    ]);
    expect(serialized.searchParams.getAll("layer")).toEqual([
      "solar-altitude-at-maximum",
    ]);
    expect(parsePlannerUrl(serialized).issues).toEqual([]);
    expect(parsePlannerUrl(serialized).state).toEqual({
      version: 1,
      locale: "es",
      eventId: "2026",
      selected: geo(41.7636, -2.4649),
      compared: [
        geo(41.7636, -2.4649),
        place("burgos-neutral-control"),
        place("el-ferial"),
      ],
      layer: "solar-altitude-at-maximum",
    });
  });

  it("always emits state and layer while allowing an omitted locale", () => {
    const serialized = serializePlannerUrl(
      "https://example.test/tool?lang=es#map",
      state({ locale: null }),
    );

    expect(serialized.searchParams.get("state")).toBe("1");
    expect(serialized.searchParams.has("lang")).toBe(false);
    expect(serialized.searchParams.get("event")).toBe("2026");
    expect(serialized.searchParams.get("layer")).toBe("totality-duration");
    expect(serialized.hash).toBe("#map");
  });

  it.each(["2027", "2028"] as const)(
    "round-trips the %s event in the same planner state",
    (eventId) => {
      const parsed = parsePlannerUrl(
        url(`?state=1&lang=es&event=${eventId}&selected=place:ceuta&layer=maximum-obscuration`),
      );

      expect(parsed.issues).toEqual([]);
      expect(parsed.state.eventId).toBe(eventId);
      expect(parsed.state.selected).toEqual(place("ceuta"));
      expect(serializePlannerUrl(url(""), parsed.state).searchParams.get("event"))
        .toBe(eventId);
    },
  );

  it("rejects an unknown event and normalizes 2026-only weather layers for future eclipses", () => {
    const invalid = parsePlannerUrl(url("?state=1&event=2030&layer=none"));
    expect(invalid.state.eventId).toBe("2026");
    expect(invalid.issues).toContainEqual({
      code: "invalid-event",
      parameter: "event",
      value: "2030",
    });

    const futureWeather = parsePlannerUrl(
      url("?state=1&event=2028&layer=eclipse-day-cloud-forecast"),
    );
    expect(futureWeather.state.layer).toBe("totality-duration");
    expect(futureWeather.issues).toContainEqual({
      code: "invalid-layer",
      parameter: "layer",
      value: "eclipse-day-cloud-forecast",
    });
  });

  it("rejects invalid or ambiguous states instead of silently truncating them", () => {
    expect(MAX_COMPARISON_POINTS).toBe(3);
    expect(() =>
      serializePlannerUrl(
        "https://example.test/",
        state({
          compared: [
            place("arguedas"),
            place("burgos-neutral-control"),
            place("el-ferial"),
            place("soria-neutral-control"),
          ],
        }),
      ),
    ).toThrow(/at most 3 points/i);
    expect(() =>
      serializePlannerUrl(
        "https://example.test/",
        state({ compared: [place("arguedas"), place("arguedas")] }),
      ),
    ).toThrow(/duplicate comparison/i);
    expect(() =>
      serializePlannerUrl(
        "https://example.test/",
        state({ selected: place("not-a-candidate") }),
      ),
    ).toThrow(/unknown built-in candidate/i);
    expect(() =>
      serializePlannerUrl(
        "https://example.test/",
        state({ selected: geo(51.5, -0.1) }),
      ),
    ).toThrow(/terrain request envelope/i);
  });
});
