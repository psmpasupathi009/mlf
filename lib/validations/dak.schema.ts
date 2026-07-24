import { z } from "zod";
import { istDayBounds } from "@/lib/utils/ist";

export const dakDirectionEnum = z.enum(["in", "out"]);

/** Accept ISO / Date, or YYYY-MM-DD as IST calendar day. */
const entryDateField = z
  .union([z.string(), z.date()])
  .transform((v) => {
    if (v instanceof Date) return v;
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return istDayBounds(s).start;
    return new Date(s);
  })
  .refine((d) => !Number.isNaN(d.getTime()), "Invalid entry date");

export const createDakSchema = z.object({
  direction: dakDirectionEnum,
  entryDate: entryDateField,
  subject: z.string().trim().min(1, "Subject is required").max(300),
  fromTo: z.string().trim().max(200).optional().or(z.literal("")),
  mode: z.string().trim().max(80).optional().or(z.literal("")),
  trackingNo: z.string().trim().max(80).optional().or(z.literal("")),
  caseUnitId: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const updateDakSchema = z.object({
  direction: dakDirectionEnum.optional(),
  entryDate: entryDateField.optional(),
  subject: z.string().trim().min(1).max(300).optional(),
  fromTo: z.string().trim().max(200).optional().or(z.literal("")),
  mode: z.string().trim().max(80).optional().or(z.literal("")),
  trackingNo: z.string().trim().max(80).optional().or(z.literal("")),
  caseUnitId: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const DAK_DIRECTION_OPTIONS = [
  { value: "in", label: "Incoming" },
  { value: "out", label: "Outgoing" },
] as const;

export const DAK_MODE_OPTIONS = [
  { value: "post", label: "Post" },
  { value: "courier", label: "Courier" },
  { value: "hand", label: "By hand" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;
