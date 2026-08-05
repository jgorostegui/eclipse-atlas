import type { TerrainHorizonError } from "../../domain/terrain-horizon";
import type { MessageKey } from "../../i18n/messages";

const messageKeys = {
  "outside-coverage": "horizon.errorOutsideCoverage",
  network: "horizon.errorNetwork",
  "invalid-tile": "horizon.errorInvalidTile",
  aborted: "horizon.errorAborted",
} as const satisfies Record<TerrainHorizonError["code"], MessageKey>;

export function terrainErrorMessageKey(code: TerrainHorizonError["code"]) {
  return messageKeys[code];
}
