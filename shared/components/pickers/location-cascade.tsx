"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api/client";
import { ADDRESS_STATES } from "@/lib/locations/catalog";

type LocationOption = { code: string; name: string };

type Props = {
  state: string;
  district: string;
  city: string;
  onChange: (next: { state: string; district: string; city: string }) => void;
};

const OTHER = "__other__";

async function loadDistricts(stateName: string): Promise<LocationOption[]> {
  const q = new URLSearchParams({ level: "districts", state: stateName });
  const { ok, data } = await apiFetch<{ options: LocationOption[] }>(
    `/api/v1/locations/meta?${q.toString()}`
  );
  if (!ok || !data || typeof data !== "object") return [];
  const options = (data as { options?: LocationOption[] }).options;
  return Array.isArray(options) ? options : [];
}

/**
 * Client residence: State + District from locations-seed; city is free text.
 */
export function LocationCascade({ state, district, city, onChange }: Props) {
  const [districts, setDistricts] = useState<LocationOption[]>([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [customDistrict, setCustomDistrict] = useState(false);
  const hydratedDistrictsFor = useRef("");

  const pickState = useCallback(
    async (name: string) => {
      hydratedDistrictsFor.current = "";
      setDistricts([]);
      setCustomDistrict(false);
      onChange({ state: name, district: "", city: "" });
      setLoadingDistricts(true);
      const next = await loadDistricts(name);
      setDistricts(next);
      setLoadingDistricts(false);
      hydratedDistrictsFor.current = name;
      if (!next.length) setCustomDistrict(true);
    },
    [onChange]
  );

  const pickDistrict = useCallback(
    (name: string, stateName: string) => {
      onChange({ state: stateName, district: name, city: "" });
    },
    [onChange]
  );

  useEffect(() => {
    if (!state) return;
    let cancelled = false;
    (async () => {
      if (hydratedDistrictsFor.current === state) return;
      setLoadingDistricts(true);
      const next = await loadDistricts(state);
      if (cancelled) return;
      setDistricts(next);
      setLoadingDistricts(false);
      hydratedDistrictsFor.current = state;
      const listed = next.some((d) => d.name === district);
      setCustomDistrict(Boolean(district) && !listed);
      if (!next.length) setCustomDistrict(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [state, district]);

  const districtSelectValue = customDistrict ? OTHER : district || undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
      <div className="grid gap-2">
        <Label>State</Label>
        <Select
          value={state || undefined}
          onValueChange={(v) => void pickState(v)}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Select state" />
          </SelectTrigger>
          <SelectContent className="z-200 max-h-72">
            {ADDRESS_STATES.map((s) => (
              <SelectItem key={s.code} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>District</Label>
        <Select
          value={districtSelectValue}
          disabled={!state || loadingDistricts}
          onValueChange={(v) => {
            if (v === OTHER) {
              setCustomDistrict(true);
              onChange({ state, district: "", city: "" });
              return;
            }
            setCustomDistrict(false);
            pickDistrict(v, state);
          }}
        >
          <SelectTrigger className="h-10">
            <SelectValue
              placeholder={loadingDistricts ? "Loading…" : "Select district"}
            />
          </SelectTrigger>
          <SelectContent className="z-200 max-h-72">
            {districts.map((d) => (
              <SelectItem key={d.code} value={d.name}>
                {d.name}
              </SelectItem>
            ))}
            <SelectItem value={OTHER}>Other — type district</SelectItem>
          </SelectContent>
        </Select>
        {customDistrict ? (
          <Input
            className="h-10"
            value={district}
            placeholder="Type district"
            onChange={(e) =>
              onChange({ state, district: e.target.value, city: "" })
            }
          />
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="loc-city">Town / city (residence)</Label>
        <Input
          id="loc-city"
          className="h-10"
          value={city}
          placeholder="Type town / city / village"
          onChange={(e) =>
            onChange({ state, district, city: e.target.value })
          }
        />
      </div>
    </div>
  );
}
