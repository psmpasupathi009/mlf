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

export const decideLeaveSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    rejectReason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((d, ctx) => {
    if (d.decision === "rejected" && (d.rejectReason?.trim().length ?? 0) < 3) {
      ctx.addIssue({
        code: "custom",
        message: "Enter at least 3 characters for the reject reason",
        path: ["rejectReason"],
      });
    }
  });

export const checkInOutSchema = z.object({
  notes: z.string().trim().max(300).optional().or(z.literal("")),
});
