import { z } from "zod";

export const ymdSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const applyLeaveSchema = z
  .object({
    fromDate: ymdSchema,
    toDate: ymdSchema,
    reason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((d) => d.fromDate <= d.toDate, {
    message: "From date must be on/before to date",
    path: ["toDate"],
  });

export const decideLeaveSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  rejectReason: z.string().trim().max(500).optional().or(z.literal("")),
});

export const checkInOutSchema = z.object({
  notes: z.string().trim().max(300).optional().or(z.literal("")),
});
