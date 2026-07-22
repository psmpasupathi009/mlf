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
import { INDIA_STATES } from "@/lib/courts/india-states";

type CourtOption = { code: string; name: string };

type CourtCascadeProps = {
  state: string;
  district: string;
  city: string;
  courtName: string;
  onChange: (next: {
    state: string;
    district: string;
    city: string;
    courtName: string;
  }) => void;
};

const OTHER = "__other__";

async function loadOptions(
  level: string,
  params: Record<string, string> = {}
): Promise<CourtOption[]> {
  const q = new URLSearchParams({ level, ...params });
  const { ok, data } = await apiFetch<{ options: CourtOption[] }>(
    `/api/v1/courts/meta?${q.toString()}`
  );
  if (!ok || !data || typeof data !== "object") return [];
  const options = (data as { options?: CourtOption[] }).options;
  return Array.isArray(options) ? options : [];
}

export function CourtCascade({
  state,
  district,
  city,
  courtName,
  onChange,
}: CourtCascadeProps) {
  const [states] = useState<CourtOption[]>(() =>
    INDIA_STATES.map((s) => ({ code: s.code, name: s.name }))
  );
  const [districts, setDistricts] = useState<CourtOption[]>([]);
  const [complexes, setComplexes] = useState<CourtOption[]>([]);
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [stateCode, setStateCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [complexCode, setComplexCode] = useState("");
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingComplexes, setLoadingComplexes] = useState(false);
  const [loadingCourts, setLoadingCourts] = useState(false);
  const [customDistrict, setCustomDistrict] = useState(false);
  const [customCity, setCustomCity] = useState(false);
  const [customCourt, setCustomCourt] = useState(false);
  const [courtFilter, setCourtFilter] = useState("");

  const hydratedDistrictsFor = useRef("");
  const hydratedComplexesFor = useRef("");
  const hydratedCourtsFor = useRef("");

  const resolveStateCode = useCallback(
    (name: string) =>
      states.find((s) => s.name === name || s.code === name)?.code ?? name,
    [states]
  );

  const pickState = useCallback(
    async (name: string) => {
      const opt = states.find((s) => s.name === name || s.code === name);
      const code = opt?.code ?? name;
      const displayName = opt?.name ?? name;
      setStateCode(code);
      setDistrictCode("");
      setComplexCode("");
      setDistricts([]);
      setComplexes([]);
      setCourts([]);
      setCustomDistrict(false);
      setCustomCity(false);
      setCustomCourt(false);
      setCourtFilter("");
      hydratedDistrictsFor.current = "";
      hydratedComplexesFor.current = "";
      hydratedCourtsFor.current = "";
      onChange({
        state: displayName,
        district: "",
        city: "",
        courtName: "",
      });
      setLoadingDistricts(true);
      const next = await loadOptions("districts", { state: code });
      setDistricts(next);
      setLoadingDistricts(false);
      hydratedDistrictsFor.current = code;
      // No seed districts (other states) → type district
      if (!next.length) {
        setCustomDistrict(true);
        setCustomCity(true);
        setCustomCourt(true);
      }
    },
    [states, onChange]
  );

  const pickDistrict = useCallback(
    async (name: string) => {
      if (name === OTHER) {
        setCustomDistrict(true);
        setCustomCity(true);
        setCustomCourt(true);
        setComplexes([]);
        setCourts([]);
        onChange({ state, district: "", city: "", courtName: "" });
        return;
      }
      const opt = districts.find((d) => d.name === name || d.code === name);
      const code = opt?.code ?? name;
      const displayName = opt?.name ?? name;
      setCustomDistrict(false);
      setDistrictCode(code);
      setComplexCode("");
      setComplexes([]);
      setCourts([]);
      setCustomCity(false);
      setCustomCourt(false);
      setCourtFilter("");
      hydratedComplexesFor.current = "";
      hydratedCourtsFor.current = "";
      onChange({
        state,
        district: displayName,
        city: "",
        courtName: "",
      });
      const sc = stateCode || resolveStateCode(state);
      if (!sc) return;
      if (!stateCode) setStateCode(sc);
      setLoadingComplexes(true);
      const next = await loadOptions("complexes", {
        state: sc,
        district: code,
      });
      setComplexes(next);
      setLoadingComplexes(false);
      hydratedComplexesFor.current = `${sc}:${code}`;

      if (!next.length) {
        setCustomCity(true);
        setCustomCourt(true);
        return;
      }

      if (next.length === 1) {
        const only = next[0];
        setComplexCode(only.code);
        onChange({
          state,
          district: displayName,
          city: only.name,
          courtName: "",
        });
        setLoadingCourts(true);
        const courtOpts = await loadOptions("courts", {
          state: sc,
          district: code,
          complex: only.code,
        });
        setCourts(courtOpts);
        setLoadingCourts(false);
        hydratedCourtsFor.current = `${sc}:${code}:${only.code}`;
        if (!courtOpts.length) setCustomCourt(true);
      }
    },
    [districts, onChange, state, stateCode, resolveStateCode]
  );

  const pickComplex = useCallback(
    async (name: string) => {
      if (name === OTHER) {
        setCustomCity(true);
        setCustomCourt(true);
        setCourts([]);
        onChange({ state, district, city: "", courtName: "" });
        return;
      }
      const opt = complexes.find((c) => c.name === name || c.code === name);
      const code = opt?.code ?? name;
      const displayName = opt?.name ?? name;
      setCustomCity(false);
      setComplexCode(code);
      setCourts([]);
      setCustomCourt(false);
      setCourtFilter("");
      hydratedCourtsFor.current = "";
      onChange({ state, district, city: displayName, courtName: "" });
      const sc = stateCode || resolveStateCode(state);
      const dc =
        districtCode ||
        districts.find((d) => d.name === district)?.code ||
        district;
      if (!sc || !dc) return;
      if (!stateCode) setStateCode(sc);
      if (!districtCode) setDistrictCode(dc);
      setLoadingCourts(true);
      const next = await loadOptions("courts", {
        state: sc,
        district: dc,
        complex: code,
      });
      setCourts(next);
      setLoadingCourts(false);
      hydratedCourtsFor.current = `${sc}:${dc}:${code}`;
      if (!next.length) setCustomCourt(true);
    },
    [
      complexes,
      onChange,
      state,
      district,
      stateCode,
      districtCode,
      districts,
      resolveStateCode,
    ]
  );

  useEffect(() => {
    if (!state) return;
    const sc = resolveStateCode(state);
    if (!sc || hydratedDistrictsFor.current === sc) return;
    let cancelled = false;
    (async () => {
      setLoadingDistricts(true);
      const next = await loadOptions("districts", { state: sc });
      if (cancelled) return;
      setStateCode(sc);
      setDistricts(next);
      setLoadingDistricts(false);
      hydratedDistrictsFor.current = sc;
      if (!next.length) {
        setCustomDistrict(true);
        setCustomCity(true);
        setCustomCourt(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, resolveStateCode]);

  useEffect(() => {
    if (!state || !district || customDistrict) return;
    const sc = stateCode || resolveStateCode(state);
    if (!sc) return;
    const dc =
      districtCode ||
      districts.find((d) => d.name === district)?.code ||
      district;
    const key = `${sc}:${dc}`;
    if (hydratedComplexesFor.current === key) return;
    if (!districts.length && !districtCode) return;
    let cancelled = false;
    (async () => {
      setLoadingComplexes(true);
      const next = await loadOptions("complexes", {
        state: sc,
        district: dc,
      });
      if (cancelled) return;
      setDistrictCode(dc);
      setComplexes(next);
      setLoadingComplexes(false);
      hydratedComplexesFor.current = key;
      if (!next.length) {
        setCustomCity(true);
        setCustomCourt(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    state,
    district,
    stateCode,
    districtCode,
    districts,
    resolveStateCode,
    customDistrict,
  ]);

  useEffect(() => {
    if (!state || !district || !city || customCity) return;
    const sc = stateCode || resolveStateCode(state);
    const dc =
      districtCode ||
      districts.find((d) => d.name === district)?.code ||
      district;
    const cc =
      complexCode ||
      complexes.find((c) => c.name === city)?.code ||
      city;
    if (!sc || !dc) return;
    const key = `${sc}:${dc}:${cc}`;
    if (hydratedCourtsFor.current === key) return;
    if (!complexes.length && !complexCode) return;
    let cancelled = false;
    (async () => {
      setLoadingCourts(true);
      const next = await loadOptions("courts", {
        state: sc,
        district: dc,
        complex: cc,
      });
      if (cancelled) return;
      setComplexCode(cc);
      setCourts(next);
      setLoadingCourts(false);
      hydratedCourtsFor.current = key;
      if (courtName && next.length && !next.some((c) => c.name === courtName)) {
        setCustomCourt(true);
      } else if (!next.length) {
        setCustomCourt(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    state,
    district,
    city,
    stateCode,
    districtCode,
    complexCode,
    districts,
    complexes,
    resolveStateCode,
    courtName,
    customCity,
  ]);

  const filteredCourts = courtFilter.trim()
    ? courts.filter((c) =>
        c.name.toLowerCase().includes(courtFilter.trim().toLowerCase())
      )
    : courts;

  const districtSelectValue = customDistrict
    ? OTHER
    : district && districts.some((d) => d.name === district)
      ? district
      : undefined;

  const citySelectValue = customCity
    ? OTHER
    : city && complexes.some((c) => c.name === city)
      ? city
      : undefined;

  const courtSelectValue = customCourt
    ? OTHER
    : courtName && courts.some((c) => c.name === courtName)
      ? courtName
      : undefined;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Free office list (no external court API). TN/KA seeded; any other place
        — choose Other and type the name.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="grid gap-2">
          <Label>
            State <span className="text-destructive">*</span>
          </Label>
          <Select
            value={state || undefined}
            onValueChange={(v) => void pickState(v)}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent position="popper" className="z-200 max-h-72">
              {states.map((s) => (
                <SelectItem key={s.code} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>
            District <span className="text-destructive">*</span>
          </Label>
          {customDistrict ? (
            <Input
              className="h-11"
              value={district}
              onChange={(e) =>
                onChange({
                  state,
                  district: e.target.value,
                  city: "",
                  courtName: "",
                })
              }
              placeholder="Type district name"
            />
          ) : (
            <Select
              value={districtSelectValue}
              onValueChange={(v) => void pickDistrict(v)}
              disabled={!state || loadingDistricts}
            >
              <SelectTrigger className="h-11">
                <SelectValue
                  placeholder={
                    loadingDistricts
                      ? "Loading…"
                      : state
                        ? "Select district"
                        : "Pick state first"
                  }
                />
              </SelectTrigger>
              <SelectContent position="popper" className="z-200 max-h-72">
                {districts.map((d) => (
                  <SelectItem key={d.code} value={d.name}>
                    {d.name}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>Other — type district</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid gap-2">
          <Label>
            City / court complex <span className="text-destructive">*</span>
          </Label>
          {customCity ? (
            <Input
              className="h-11"
              value={city}
              onChange={(e) =>
                onChange({
                  state,
                  district,
                  city: e.target.value,
                  courtName: "",
                })
              }
              placeholder="Type city / complex"
            />
          ) : (
            <Select
              value={citySelectValue}
              onValueChange={(v) => void pickComplex(v)}
              disabled={!district || loadingComplexes}
            >
              <SelectTrigger className="h-11">
                <SelectValue
                  placeholder={
                    loadingComplexes
                      ? "Loading…"
                      : district
                        ? "Select city / complex"
                        : "Pick district first"
                  }
                />
              </SelectTrigger>
              <SelectContent position="popper" className="z-200 max-h-72">
                {complexes.map((c) => (
                  <SelectItem key={c.code} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>Other — type city</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid gap-2">
          <Label>
            Court <span className="text-destructive">*</span>
          </Label>
          {customCourt ? (
            <Input
              className="h-11"
              value={courtName}
              onChange={(e) =>
                onChange({
                  state,
                  district,
                  city,
                  courtName: e.target.value,
                })
              }
              placeholder="Type court name"
            />
          ) : (
            <Select
              value={courtSelectValue}
              onValueChange={(v) => {
                if (v === OTHER) {
                  setCustomCourt(true);
                  onChange({ state, district, city, courtName: "" });
                  return;
                }
                setCustomCourt(false);
                onChange({ state, district, city, courtName: v });
              }}
              disabled={!city || loadingCourts}
            >
              <SelectTrigger className="h-11">
                <SelectValue
                  placeholder={
                    loadingCourts
                      ? "Loading…"
                      : city
                        ? "Select court"
                        : "Pick city first"
                  }
                />
              </SelectTrigger>
              <SelectContent position="popper" className="z-200 max-h-80">
                {courts.length > 8 ? (
                  <div
                    className="sticky top-0 z-10 border-b border-border bg-white p-2"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={courtFilter}
                      onChange={(e) => setCourtFilter(e.target.value)}
                      placeholder="Search court…"
                      className="h-8"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                ) : null}
                {filteredCourts.map((c) => (
                  <SelectItem key={c.code} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>Other — type court</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </div>
  );
}
