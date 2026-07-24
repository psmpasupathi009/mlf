import { apiHandler, jsonOk, jsonFail } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import {
  listIndiaComplexes,
  listIndiaCourts,
  listIndiaDistricts,
  listIndiaStates,
} from "@/lib/courts/local-catalog";

/**
 * Offline court hierarchy for Register Case (all-India office seed + used cases).
 *
 * GET ?level=states|districts|complexes|courts
 */
export const GET = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const level = (searchParams.get("level") ?? "states").trim();
  const attribution = {
    provider: "office-seed",
    note: "All-India court list (seed + courts used on existing cases). Type “Other” for any court not listed. Verify filings on official eCourts if needed.",
    liveApiConfigured: false,
  };

  if (level === "states") {
    const { options, source } = listIndiaStates();
    return jsonOk({ level, source, attribution, options });
  }

  if (level === "districts") {
    const state = searchParams.get("state")?.trim();
    if (!state) return jsonFail("VALIDATION", "state is required", 400);
    const { options, source } = await listIndiaDistricts(state);
    return jsonOk({ level, state, source, attribution, options });
  }

  if (level === "complexes") {
    const state = searchParams.get("state")?.trim();
    const district = searchParams.get("district")?.trim();
    if (!state || !district) {
      return jsonFail("VALIDATION", "state and district are required", 400);
    }
    const { options, source } = await listIndiaComplexes(state, district);
    return jsonOk({ level, state, district, source, attribution, options });
  }

  if (level === "courts") {
    const state = searchParams.get("state")?.trim();
    const district = searchParams.get("district")?.trim();
    const complex = searchParams.get("complex")?.trim();
    if (!state || !district || !complex) {
      return jsonFail(
        "VALIDATION",
        "state, district and complex are required",
        400
      );
    }
    const { options, source } = await listIndiaCourts(
      state,
      district,
      complex
    );
    return jsonOk({
      level,
      state,
      district,
      complex,
      source,
      attribution,
      options,
    });
  }

  return jsonFail(
    "VALIDATION",
    "level must be states|districts|complexes|courts",
    400
  );
});
