/**
 * Offline court catalog for Register Case — no third-party API.
 * Source: office-maintained seed (TN/KA) + static India state/UT names.
 * Staff can type any other district / city / court via “Other”.
 */
import {
  INDIA_STATES,
  stateCodeFromName,
  stateNameFromCode,
} from "@/lib/courts/india-states";
import { courtsSeed } from "@/config/company/courts-seed";

export type CourtOption = { code: string; name: string };
export type CourtsSource = "seed" | "static";

export function listIndiaStates(): {
  options: CourtOption[];
  source: CourtsSource;
} {
  return {
    options: INDIA_STATES.map((s) => ({ code: s.code, name: s.name })),
    source: "static",
  };
}

function resolveStateName(stateCodeOrName: string): string {
  if (stateCodeOrName.length <= 3) {
    return stateNameFromCode(stateCodeOrName.toUpperCase()) ?? stateCodeOrName;
  }
  return stateCodeOrName;
}

export function listIndiaDistricts(stateCodeOrName: string): {
  options: CourtOption[];
  source: CourtsSource;
} {
  const stateName = resolveStateName(stateCodeOrName);
  const set = new Map<string, string>();
  for (const row of courtsSeed) {
    if (row.state !== stateName) continue;
    set.set(row.district, row.district);
  }
  return {
    options: Array.from(set.values())
      .sort()
      .map((d) => ({ code: d, name: d })),
    source: "seed",
  };
}

export function listIndiaComplexes(
  stateCodeOrName: string,
  districtName: string
): { options: CourtOption[]; source: CourtsSource } {
  const stateName = resolveStateName(stateCodeOrName);
  const set = new Map<string, string>();
  for (const row of courtsSeed) {
    if (row.state !== stateName || row.district !== districtName) continue;
    const city = row.city || row.district;
    set.set(city, city);
  }
  return {
    options: Array.from(set.values())
      .sort()
      .map((c) => ({ code: c, name: c })),
    source: "seed",
  };
}

export function listIndiaCourts(
  stateCodeOrName: string,
  districtName: string,
  cityOrComplex: string
): { options: CourtOption[]; source: CourtsSource } {
  const stateName = resolveStateName(stateCodeOrName);
  const set = new Map<string, string>();
  for (const row of courtsSeed) {
    if (row.state !== stateName || row.district !== districtName) continue;
    const city = row.city || row.district;
    if (city !== cityOrComplex && row.district !== cityOrComplex) continue;
    set.set(row.courtName, row.courtName);
  }
  return {
    options: Array.from(set.values())
      .sort()
      .map((c) => ({ code: c, name: c })),
    source: "seed",
  };
}

export function stateCodeFor(name: string): string | undefined {
  return stateCodeFromName(name);
}
