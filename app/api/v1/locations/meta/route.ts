import { apiHandler, jsonOk, jsonFail } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import {
  listLocationDistricts,
  listLocationStates,
} from "@/lib/locations/catalog";

/**
 * Offline address hierarchy for Client intake (locations-seed — no external API).
 * City is free text on the form; not served here.
 *
 * GET ?level=states|districts
 */
export const GET = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const level = (searchParams.get("level") ?? "states").trim();
  const attribution = {
    provider: "locations-seed",
    note: "All-India state and district list. Town / city is typed on the form.",
    liveApiConfigured: false,
  };

  if (level === "states") {
    const { options, source } = listLocationStates();
    return jsonOk({ level, source, attribution, options });
  }

  if (level === "districts") {
    const state = searchParams.get("state")?.trim();
    if (!state) return jsonFail("VALIDATION", "state is required", 400);
    const { options, source } = listLocationDistricts(state);
    return jsonOk({ level, state, source, attribution, options });
  }

  return jsonFail("VALIDATION", "level must be states|districts", 400);
});
