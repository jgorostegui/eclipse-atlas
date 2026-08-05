import { describe, expect, it } from "vitest";
import { translate } from "../../i18n/messages";
import { terrainErrorMessageKey } from "./terrain-error-message";

describe("terrain error localization", () => {
  it("maps domain error codes to both typed locale catalogs", () => {
    const key = terrainErrorMessageKey("invalid-tile");
    expect(translate("en", key)).toContain("invalid elevation data");
    expect(translate("es", key)).toContain("datos de elevación");
  });
});
