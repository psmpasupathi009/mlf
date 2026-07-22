import { z } from "zod";

export const paymentTypeEnum = z.enum(["advance", "partial", "full"]);
export const paymentStatusEnum = z.enum(["pending", "paid", "void"]);

const dateStringOrDate = z
  .union([z.string(), z.date()])
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), "Invalid date");

export const createPaymentSchema = z.object({
  clientUnitId: z.string().trim().min(1, "Client is required"),
  caseUnitId: z.string().trim().optional().or(z.literal("")),
  type: paymentTypeEnum,
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  status: paymentStatusEnum.optional(),
  paidOn: dateStringOrDate.optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const updatePaymentSchema = z.object({
  type: paymentTypeEnum.optional(),
  amount: z.coerce.number().positive().optional(),
  status: z.enum(["pending", "paid"]).optional(),
  paidOn: dateStringOrDate.optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const voidPaymentSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(500),
});

export const importPaymentsRowSchema = z.object({
  unitId: z.string().trim().optional().or(z.literal("")),
  clientMobile: z.string().trim().optional().or(z.literal("")),
  clientUnitId: z.string().trim().optional().or(z.literal("")),
  caseUnitId: z.string().trim().optional().or(z.literal("")),
  caseNumber: z.string().trim().optional().or(z.literal("")),
  type: z.string().trim(),
  amount: z.string().trim(),
  status: z.string().trim().optional().or(z.literal("")),
  paidOn: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export const importPaymentsSchema = z.object({
  dryRun: z.boolean().default(true),
  rows: z.array(importPaymentsRowSchema).max(500, "Max 500 rows per import"),
});
