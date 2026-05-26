import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSeedDatabase } from "@/lib/fleetSeed";
import type { DashboardPreset, FleetDatabase } from "@/lib/fleetTypes";

const dataDirectory = path.join(process.cwd(), "data");
const dataFile = path.join(dataDirectory, "fleet-db.json");

async function ensureDatabase(): Promise<FleetDatabase> {
  try {
    const fileContents = await readFile(dataFile, "utf8");
    return JSON.parse(fileContents) as FleetDatabase;
  } catch {
    const seed = buildSeedDatabase();
    await mkdir(dataDirectory, { recursive: true });
    await writeFile(dataFile, JSON.stringify(seed, null, 2));
    return seed;
  }
}

async function persistDatabase(database: FleetDatabase): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(dataFile, JSON.stringify(database, null, 2));
}

export async function getFleetDatabase(): Promise<FleetDatabase> {
  return ensureDatabase();
}

export async function saveDashboardPreset(tenantId: string, preset: DashboardPreset): Promise<FleetDatabase> {
  const database = await ensureDatabase();
  const dashboards = database.dashboards.map((dashboard) => {
    if (dashboard.tenant.id !== tenantId) {
      return dashboard;
    }

    const existingIndex = dashboard.presets.findIndex((entry) => entry.id === preset.id);
    const nextPresets = [...dashboard.presets];

    if (existingIndex >= 0) {
      nextPresets[existingIndex] = preset;
    } else {
      nextPresets.unshift(preset);
    }

    return {
      ...dashboard,
      presets: nextPresets,
    };
  });

  const nextDatabase = { ...database, dashboards };
  await persistDatabase(nextDatabase);
  return nextDatabase;
}
