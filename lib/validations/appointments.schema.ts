import { z } from "zod";

const dateStringOrDate = z
  .union([z.string(), z.date()])
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), "Invalid date/time");

export const appointmentStatusEnum = z.enum([
  "scheduled",
  "completed",
  "cancelled",
]);

export const appointmentModeEnum = z.enum(["office", "call", "video"]);

export const createAppointmentSchema = z.object({
  clientUnitId: z.string().trim().optional().or(z.literal("")),
  advocateMobile: z.string().trim().min(10, "Select advocate").max(15),
  title: z.string().trim().min(1, "Title is required").max(160),
  scheduledAt: dateStringOrDate,
  durationMin: z.coerce.number().int().min(5).max(480).optional(),
  mode: appointmentModeEnum.optional().default("office"),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const updateAppointmentSchema = z.object({
  clientUnitId: z.string().trim().optional().or(z.literal("")),
  advocateMobile: z.string().trim().min(10).max(15).optional().or(z.literal("")),
  title: z.string().trim().min(1).max(160).optional(),
  scheduledAt: dateStringOrDate.optional(),
  durationMin: z.coerce.number().int().min(5).max(480).optional(),
  mode: appointmentModeEnum.optional(),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  status: appointmentStatusEnum.optional(),
});

export const APPOINTMENT_MODE_OPTIONS = [
  { value: "office", label: "Office visit" },
  { value: "call", label: "Phone call" },
  { value: "video", label: "Video call" },
] as const;
