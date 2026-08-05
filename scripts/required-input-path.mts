import path from "node:path";

export function requiredInputPath(variableName: string) {
  const configuredPath = process.env[variableName]?.trim();
  if (!configuredPath) {
    throw new Error(`Set ${variableName} to the required local input path.`);
  }
  return path.resolve(configuredPath);
}
