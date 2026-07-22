import { z } from "zod";
import { isValidCnr, normalizeCnr } from "@/config/company/case-types";

export const caseStatusEnum = z.enum([
  "pending",
  "listed",
  "disposed",
  "withdrawn",
  "transferred",
]);

export const ourSideEnum = z.enum([
  "petitioner",
  "respondent",
  "complainant",
  "accused",
  "appellant",
  "other",
]);

export const OUR_SIDE_OPTIONS = [
  { value: "petitioner", label: "Petitioner / Plaintiff" },
  { value: "respondent", label: "Respondent / Defendant" },
  { value: "complainant", label: "Complainant" },
  { value: "accused", label: "Accused" },
  { value: "appellant", label: "Appellant" },
  { value: "other", label: "Other" },
] as const;

const dateStringOrDate = z
  .union([z.string(), z.date()])
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), "Invalid date");

const optionalCnr = z
  .union([z.string(), z.undefined()])
  .transform((v) => (v ? normalizeCnr(String(v)) : ""))
  .refine((v) => isValidCnr(v), "CNR must be 16 letters/digits (dashes optional)");

const optionalYear = z
  .union([z.coerce.number().int().min(1950).max(2100), z.literal(""), z.undefined()])
  .transform((v) => (v === "" || v === undefined ? undefined : Number(v)));

export const createCaseSchema = z.object({
  clientUnitId: z.string().trim().min(1, "Client is required"),
  caseNumber: z.string().trim().max(120).optional().or(z.literal("")),
  filingNumber: z.string().trim().max(120).optional().or(z.literal("")),
  caseYear: optionalYear,
  cnr: optionalCnr,
  state: z.string().trim().min(1, "Select state").max(80),
  district: z.string().trim().min(1, "Select district").max(80),
  city: z.string().trim().min(1, "Select city / town").max(80),
  courtName: z.string().trim().min(1, "Select court").max(160),
  advocateMobiles: z.array(z.string().trim()).optional(),
  primaryAdvocateMobile: z
    .string()
    .trim()
    .min(1, "Primary advocate mobile is required"),
  opposingParty: z.string().trim().max(160).optional().or(z.literal("")),
  ourSide: ourSideEnum.optional().or(z.literal("")),
  underActs: z.string().trim().max(500).optional().or(z.literal("")),
  policeStation: z.string().trim().max(160).optional().or(z.literal("")),
  firNumber: z.string().trim().max(120).optional().or(z.literal("")),
  stage: z.string().trim().max(160).optional().or(z.literal("")),
  caseType: z.string().trim().min(1, "Case type is required").max(80),
  status: caseStatusEnum.optional(),
  filingDate: dateStringOrDate.optional(),
  nextHearingAt: dateStringOrDate.optional(),
  agreedFee: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const updateCaseSchema = createCaseSchema.partial().omit({
  clientUnitId: true,
});

export const addHearingSchema = z.object({
  hearingDate: dateStringOrDate,
  purpose: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const adjournHearingSchema = z.object({
  nextHearingDate: dateStringOrDate,
  outcome: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const importCasesRowSchema = z.object({
  unitId: z.string().trim().optional().or(z.literal("")),
  clientMobile: z.string().trim().optional().or(z.literal("")),
  clientUnitId: z.string().trim().optional().or(z.literal("")),
  caseNumber: z.string().trim().optional().or(z.literal("")),
  filingNumber: z.string().trim().optional().or(z.literal("")),
  caseYear: z.string().trim().optional().or(z.literal("")),
  cnr: z.string().trim().optional().or(z.literal("")),
  state: z.string().trim().optional().or(z.literal("")),
  district: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().optional().or(z.literal("")),
  courtName: z.string().trim().optional().or(z.literal("")),
  advocateMobiles: z.string().trim().optional().or(z.literal("")),
  primaryAdvocateMobile: z.string().trim().optional().or(z.literal("")),
  opposingParty: z.string().trim().optional().or(z.literal("")),
  ourSide: z.string().trim().optional().or(z.literal("")),
  underActs: z.string().trim().optional().or(z.literal("")),
  policeStation: z.string().trim().optional().or(z.literal("")),
  firNumber: z.string().trim().optional().or(z.literal("")),
  stage: z.string().trim().optional().or(z.literal("")),
  caseType: z.string().trim().optional().or(z.literal("")),
  status: z.string().trim().optional().or(z.literal("")),
  filingDate: z.string().trim().optional().or(z.literal("")),
  nextHearingAt: z.string().trim().optional().or(z.literal("")),
  agreedFee: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export const importCasesSchema = z.object({
  dryRun: z.boolean().default(true),
  rows: z.array(importCasesRowSchema).max(500, "Max 500 rows per import"),
});

export const importHearingsRowSchema = z
  .object({
    caseUnitId: z.string().trim().optional().or(z.literal("")),
    caseNumber: z.string().trim().optional().or(z.literal("")),
    hearingDate: z.string().trim().min(1, "hearingDate is required"),
    purpose: z.string().trim().max(200).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .refine((r) => Boolean(r.caseUnitId?.trim()) || Boolean(r.caseNumber?.trim()), {
    message: "Set caseUnitId or caseNumber",
    path: ["caseUnitId"],
  });

export const importHearingsSchema = z.object({
  dryRun: z.boolean().default(true),
  rows: z.array(importHearingsRowSchema).max(500, "Max 500 rows per import"),
});
