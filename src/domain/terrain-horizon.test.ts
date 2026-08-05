import { describe, expect, it, vi } from "vitest";
import {
  calculateEclipseAnimationTrack,
  calculateEclipseCircumstances,
} from "./eclipse";
import {
  apparentTerrainAngle,
  assessSolarDiscTerrain,
  calculateTerrainElevation,
  calculateTerrainHorizonFromTiles,
  createTerrainSamplePlan,
  decodeTerrainRgb,
  destinationPoint,
  isSupportedTerrainCoordinate,
  solarDiscAltitudeBoundsAtAzimuth,
  solarDiscAzimuthHalfWidthDegrees,
  terrainAzimuthRangeForSolarTrack,
  SOLAR_DISC_AZIMUTH_STEP_DEGREES,
  TERRAIN_SAMPLE_DISTANCES_KILOMETRES,
  TERRAIN_TILE_SIZE,
  TerrainHorizonError,
  terrainTileKey,
  terrainPixelAddress,
  terrainElevationAt,
  validateElevationTile,
  validateTerrainTilePayload,
} from "./terrain-horizon";

const solarDisc = {
  centreAltitudeDegrees: 7.2,
  centreAzimuthDegrees: 359.9,
  angularRadiusDegrees: 0.262958,
};

const planAt = (latitude = 42.1758188, longitude = -1.5970062) =>
  createTerrainSamplePlan(latitude, longitude, {
    centreAzimuthDegrees: solarDisc.centreAzimuthDegrees,
    solarDisc,
    viewpointHeightAboveGroundMetres: 1.5,
  });

describe("TerrainRGB primitives", () => {
  it("decodes the official RGB elevation formula", () => {
    expect(decodeTerrainRgb(1, 134, 160)).toBeCloseTo(0, 6);
    expect(decodeTerrainRgb(1, 138, 136)).toBeCloseTo(100, 6);
    expect(() => decodeTerrainRgb(256, 0, 0)).toThrow(RangeError);
  });

  it("applies explicit viewpoint height to a flat short synthetic ray", () => {
    expect(
      apparentTerrainAngle({
        observerGroundElevationMetres: 500,
        viewpointHeightAboveGroundMetres: 0,
        targetGroundElevationMetres: 500,
        distanceKilometres: 0.15,
      }),
    ).toBeCloseTo(0, 2);
    expect(
      apparentTerrainAngle({
        observerGroundElevationMetres: 500,
        viewpointHeightAboveGroundMetres: 1.5,
        targetGroundElevationMetres: 500,
        distanceKilometres: 0.15,
      }),
    ).toBeCloseTo(-0.5735, 3);
  });

  it("moves a coordinate along the requested bearing", () => {
    const north = destinationPoint(42, -2, 0, 10);
    expect(north.latitude).toBeGreaterThan(42);
    expect(north.longitude).toBeCloseTo(-2, 3);
  });

  it("addresses the provider's 512-pixel Web Mercator tiles", () => {
    expect(terrainPixelAddress(42.3439, -3.6969, 11)).toEqual({
      tileX: 1004,
      tileY: 753,
      pixelX: 85,
      pixelY: 32,
    });
  });

  it("enforces the documented Spain coverage envelopes", () => {
    expect(isSupportedTerrainCoordinate(42.2, -1.6)).toBe(true);
    expect(isSupportedTerrainCoordinate(39.57, 2.65)).toBe(true);
    expect(isSupportedTerrainCoordinate(28.29, -16.63)).toBe(true);
    expect(isSupportedTerrainCoordinate(35.29, -2.94)).toBe(true);
    expect(isSupportedTerrainCoordinate(51.5, -0.1)).toBe(false);
  });

  it("rejects wrong MIME, oversized, corrupt, and wrong-dimension tiles", () => {
    const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(() =>
      validateTerrainTilePayload("application/json", 8, pngSignature),
    ).toThrow(TerrainHorizonError);
    expect(() =>
      validateTerrainTilePayload("image/png", 1_500_001, pngSignature),
    ).toThrow(TerrainHorizonError);
    expect(() =>
      validateTerrainTilePayload("image/png", 8, new Uint8Array(8)),
    ).toThrow(TerrainHorizonError);
    expect(() =>
      validateElevationTile({
        width: 256,
        height: 256,
        pixels: new Uint8ClampedArray(256 * 256 * 4),
      }),
    ).toThrow(TerrainHorizonError);
  });

  it("rejects transparent no-data pixels instead of decoding them as elevation", () => {
    const plan = planAt();
    const tiles = new Map(
      plan.requiredAddresses.map((address) => [
        terrainTileKey(address),
        {
          width: TERRAIN_TILE_SIZE,
          height: TERRAIN_TILE_SIZE,
          pixels: new Uint8ClampedArray(
            TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE * 4,
          ),
        },
      ]),
    );

    expect(() => calculateTerrainHorizonFromTiles(plan, tiles)).toThrow(
      /no-data/i,
    );
  });

  it("rejects an opaque black no-data pixel before astronomy can consume it", () => {
    const address = terrainPixelAddress(42.3439, -3.6969, 11);
    const pixels = new Uint8ClampedArray(
      TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE * 4,
    );
    pixels[(address.pixelY * TERRAIN_TILE_SIZE + address.pixelX) * 4 + 3] = 255;
    const tiles = new Map([
      [
        terrainTileKey(address),
        { width: TERRAIN_TILE_SIZE, height: TERRAIN_TILE_SIZE, pixels },
      ],
    ]);

    expect(() => terrainElevationAt(address, tiles)).toThrow(/no-data/i);
  });

  it("rejects partially transparent pixels instead of treating them as terrain", () => {
    const address = terrainPixelAddress(42.3439, -3.6969, 11);
    const pixels = new Uint8ClampedArray(
      TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE * 4,
    );
    const offset =
      (address.pixelY * TERRAIN_TILE_SIZE + address.pixelX) * 4;
    pixels[offset] = 1;
    pixels[offset + 1] = 154;
    pixels[offset + 2] = 40;
    pixels[offset + 3] = 128;
    const tiles = new Map([
      [
        terrainTileKey(address),
        { width: TERRAIN_TILE_SIZE, height: TERRAIN_TILE_SIZE, pixels },
      ],
    ]);

    expect(() => terrainElevationAt(address, tiles)).toThrow(
      /partially transparent no-data/i,
    );
  });

  it("uses a fixed dense sampling schedule through 100 kilometres", () => {
    expect(TERRAIN_SAMPLE_DISTANCES_KILOMETRES.length).toBeGreaterThan(300);
    expect(TERRAIN_SAMPLE_DISTANCES_KILOMETRES[0]).toBe(0.05);
    expect(TERRAIN_SAMPLE_DISTANCES_KILOMETRES.at(-1)).toBe(100);
    expect(
      TERRAIN_SAMPLE_DISTANCES_KILOMETRES.filter((distance) => distance > 30)
        .length / TERRAIN_SAMPLE_DISTANCES_KILOMETRES.length,
    ).toBeLessThan(0.3);
    expect(
      planAt().profileRays,
    ).toHaveLength(61);
  });

  it("samples the complete apparent solar disc with dense local rays", () => {
    const plan = planAt();
    const offsets = plan.solarDiscRays.map(
      (ray) => ((ray.azimuthDegrees - solarDisc.centreAzimuthDegrees + 540) % 360) - 180,
    );
    const halfWidth = solarDiscAzimuthHalfWidthDegrees(solarDisc);

    expect(offsets[0]).toBeCloseTo(-halfWidth, 8);
    expect(offsets.at(-1)).toBeCloseTo(halfWidth, 8);
    expect(offsets.some((offset) => Math.abs(offset) < 1e-9)).toBe(true);
    expect(
      Math.max(
        ...offsets.slice(1).map((offset, index) => offset - offsets[index]),
      ),
    ).toBeLessThanOrEqual(SOLAR_DISC_AZIMUTH_STEP_DEGREES + 1e-8);
    expect(plan.solarDiscRays.some((ray) => ray.azimuthDegrees < 0.2)).toBe(
      true,
    );
  });

  it("expands the terrain sweep to the full C1-to-C4 solar track", () => {
    const eclipse = calculateEclipseCircumstances(
      39.56939,
      2.65024,
      {
        groundElevationMetres: 500,
        viewpointHeightAboveGroundMetres: 1.5,
      },
      "2027",
    );
    if (!eclipse) throw new Error("Expected the 2027 eclipse in Palma.");
    const track = calculateEclipseAnimationTrack(
      39.56939,
      2.65024,
      eclipse,
      181,
    );
    const range = terrainAzimuthRangeForSolarTrack(
      track,
      eclipse.sunAzimuthDegrees,
    );
    const plan = createTerrainSamplePlan(39.56939, 2.65024, {
      centreAzimuthDegrees: eclipse.sunAzimuthDegrees,
      solarDisc: {
        centreAltitudeDegrees: eclipse.sunAltitudeDegrees,
        centreAzimuthDegrees: eclipse.sunAzimuthDegrees,
        angularRadiusDegrees: eclipse.solarAngularRadiusDegrees,
      },
      viewpointHeightAboveGroundMetres: 1.5,
      profileAzimuthRange: range,
    });

    expect(range.maximumOffsetDegrees).toBeGreaterThan(20);
    expect(plan.profileRays[0].azimuthDegrees).toBeCloseTo(
      (eclipse.sunAzimuthDegrees + range.minimumOffsetDegrees + 360) % 360,
      8,
    );
    expect(plan.profileRays.at(-1)?.azimuthDegrees).toBeCloseTo(
      (eclipse.sunAzimuthDegrees + range.maximumOffsetDegrees + 360) % 360,
      8,
    );
    for (const sample of track) {
      const centreOffset =
        ((sample.sunAzimuthDegrees - eclipse.sunAzimuthDegrees + 540) % 360) -
        180;
      const halfWidth = solarDiscAzimuthHalfWidthDegrees({
        centreAltitudeDegrees: sample.sunAltitudeDegrees,
        centreAzimuthDegrees: sample.sunAzimuthDegrees,
        angularRadiusDegrees: sample.sunAngularRadiusDegrees,
      });
      expect(centreOffset - halfWidth).toBeGreaterThanOrEqual(
        range.minimumOffsetDegrees,
      );
      expect(centreOffset + halfWidth).toBeLessThanOrEqual(
        range.maximumOffsetDegrees,
      );
    }
  });

  it("covers the early 2028 solar track in Santa Cruz de Tenerife", () => {
    const eclipse = calculateEclipseCircumstances(
      28.46824,
      -16.25462,
      {
        groundElevationMetres: 500,
        viewpointHeightAboveGroundMetres: 1.5,
      },
      "2028",
    );
    if (!eclipse) throw new Error("Expected the 2028 eclipse in Santa Cruz.");
    const track = calculateEclipseAnimationTrack(
      28.46824,
      -16.25462,
      eclipse,
      181,
    );
    const range = terrainAzimuthRangeForSolarTrack(
      track,
      eclipse.sunAzimuthDegrees,
    );

    expect(range.minimumOffsetDegrees).toBeLessThan(-18);
    for (const sample of track) {
      const centreOffset =
        ((sample.sunAzimuthDegrees - eclipse.sunAzimuthDegrees + 540) % 360) -
        180;
      const halfWidth = solarDiscAzimuthHalfWidthDegrees({
        centreAltitudeDegrees: sample.sunAltitudeDegrees,
        centreAzimuthDegrees: sample.sunAzimuthDegrees,
        angularRadiusDegrees: sample.sunAngularRadiusDegrees,
      });
      expect(centreOffset - halfWidth).toBeGreaterThanOrEqual(
        range.minimumOffsetDegrees,
      );
      expect(centreOffset + halfWidth).toBeLessThanOrEqual(
        range.maximumOffsetDegrees,
      );
    }
  });

  it("uses spherical horizontal disc width at high solar altitude", () => {
    const angularRadiusDegrees = 0.266;
    const halfWidth = solarDiscAzimuthHalfWidthDegrees({
      centreAltitudeDegrees: 46,
      centreAzimuthDegrees: 180,
      angularRadiusDegrees,
    });

    expect(halfWidth / angularRadiusDegrees).toBeCloseTo(1 / Math.cos(46 * Math.PI / 180), 3);
    expect(halfWidth).toBeGreaterThan(angularRadiusDegrees * 1.4);
  });

  it("calculates exact disc bounds and terrain intersections", () => {
    const centreBounds = solarDiscAltitudeBoundsAtAzimuth(
      solarDisc,
      solarDisc.centreAzimuthDegrees,
    );
    expect(centreBounds?.lowerDegrees).toBeCloseTo(
      solarDisc.centreAltitudeDegrees - solarDisc.angularRadiusDegrees,
      8,
    );
    expect(centreBounds?.upperDegrees).toBeCloseTo(
      solarDisc.centreAltitudeDegrees + solarDisc.angularRadiusDegrees,
      8,
    );

    const centreTerrain = {
      azimuthDegrees: solarDisc.centreAzimuthDegrees,
      horizonAltitudeDegrees: 6,
      limitingDistanceKilometres: 2,
    };
    const rays = planAt().solarDiscRays.map((ray) => ({
      azimuthDegrees: ray.azimuthDegrees,
      horizonAltitudeDegrees: 6,
      limitingDistanceKilometres: 2,
    }));
    const clear = assessSolarDiscTerrain(solarDisc, centreTerrain, rays);
    expect(clear.intersection).toBe("fully-clear");
    const lateralCrest = rays.map((ray, index) =>
      index === 1 ? { ...ray, horizonAltitudeDegrees: 7.2 } : ray,
    );
    const partial = assessSolarDiscTerrain(
      solarDisc,
      centreTerrain,
      lateralCrest,
    );
    expect(partial.centreClearanceDegrees).toBe(1.2);
    expect(partial.intersection).toBe("partially-obscured");
    const blocked = assessSolarDiscTerrain(
      solarDisc,
      { ...centreTerrain, horizonAltitudeDegrees: 8 },
      rays.map((ray) => ({ ...ray, horizonAltitudeDegrees: 8 })),
    );
    expect(blocked.intersection).toBe("fully-blocked");

    if (!centreBounds) throw new Error("Expected centre solar-disc bounds.");
    const tangentRay = [{
      ...centreTerrain,
      horizonAltitudeDegrees: centreBounds.lowerDegrees,
    }];
    expect(
      assessSolarDiscTerrain(solarDisc, tangentRay[0], tangentRay).intersection,
    ).toBe("partially-obscured");
    expect(
      assessSolarDiscTerrain(
        solarDisc,
        { ...tangentRay[0], horizonAltitudeDegrees: centreBounds.lowerDegrees - 1e-8 },
        [{ ...tangentRay[0], horizonAltitudeDegrees: centreBounds.lowerDegrees - 1e-8 }],
      ).intersection,
    ).toBe("fully-clear");
    expect(
      assessSolarDiscTerrain(
        solarDisc,
        { ...tangentRay[0], horizonAltitudeDegrees: centreBounds.lowerDegrees + 1e-8 },
        [{ ...tangentRay[0], horizonAltitudeDegrees: centreBounds.lowerDegrees + 1e-8 }],
      ).intersection,
    ).toBe("partially-obscured");
  });

  it("propagates a caller abort before starting a terrain request", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      calculateTerrainElevation(42.1758188, -1.5970062, controller.signal),
    ).rejects.toMatchObject({ code: "aborted" });
  });

  it("turns a delayed terrain response into a bounded timeout failure", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
          }),
      ),
    );

    const promise = calculateTerrainElevation(
      42.1758188,
      -1.5970062,
      new AbortController().signal,
    );
    const rejection = expect(promise).rejects.toMatchObject({
      code: "network",
    });
    await vi.advanceTimersByTimeAsync(8_001);
    await rejection;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the timeout active while the terrain response body is pending", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
            );
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-length": "8",
          },
        });
      }),
    );

    const promise = calculateTerrainElevation(
      42.1758188,
      -1.5970062,
      new AbortController().signal,
    );
    const rejection = expect(promise).rejects.toMatchObject({
      code: "network",
    });
    await vi.advanceTimersByTimeAsync(8_001);
    await rejection;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stops reading a terrain body as soon as the byte limit is exceeded", async () => {
    let pulls = 0;
    const chunkSize = 256 * 1_024;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const stream = new ReadableStream<Uint8Array>({
          pull(controller) {
            pulls += 1;
            const chunk = new Uint8Array(chunkSize);
            if (pulls === 1) {
              chunk.set([137, 80, 78, 71, 13, 10, 26, 10]);
            }
            controller.enqueue(chunk);
            if (pulls >= 36) controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-length": "1000",
          },
        });
      }),
    );

    await expect(
      calculateTerrainElevation(
        42.1758188,
        -1.5970062,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "invalid-tile" });
    expect(pulls).toBeLessThan(10);
    vi.unstubAllGlobals();
  });
});
