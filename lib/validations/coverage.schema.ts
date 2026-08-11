import { z } from "zod";

export const createCoverageSchema = z.object({
  hearingUnitId: z.string().trim().min(1),
  reason: z.enum(["leave", "unavailable_block", "other"]).default("other"),
  reasonNote: z.string().trim().max(500).optional().or(z.literal("")),
});

export const resolveCoverageSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cover"),
    toMobile: z.string().trim().min(10).max(15),
  }),
  z.object({
    action: z.literal("cover_batch"),
    toMobile: z.string().trim().min(10).max(15),
  }),
  z.object({
    action: z.literal("reassign_permanent"),
    toMobile: z.string().trim().min(10).max(15),
  }),
  z.object({
    action: z.literal("adjourn"),
    nextHearingDate: z.string().trim().min(1),
    outcome: z.string().trim().max(200).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    toMobile: z.string().trim().max(15).optional().or(z.literal("")),
  }),
  z.object({
    action: z.literal("dismiss"),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
  }),
]);
