import { z } from "zod";
import { DESIGNATIONS } from "@/config/company/designations";

export const employeeRoleEnum = z.enum([
  "admin",
  "sub_admin",
  "staff",
  "advocate",
  "accountant",
]);

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  mobile: z.string().trim().min(10, "Enter a valid mobile number").max(15),
  designation: z.enum(DESIGNATIONS).optional(),
  roles: z.array(employeeRoleEnum).min(1, "Select at least one role"),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
});

export const updateEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  designation: z.enum(DESIGNATIONS).optional(),
  roles: z.array(employeeRoleEnum).min(1, "Select at least one role").optional(),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

export const importEmployeesRowSchema = z.object({
  unitId: z.string().trim().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Name is required"),
  designation: z.enum(DESIGNATIONS).optional().or(z.literal("")),
  mobile: z.string().trim().min(10, "Enter a valid mobile number").max(15),
  email: z.string().trim().optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
});

export const importEmployeesSchema = z.object({
  dryRun: z.boolean().default(true),
  rows: z.array(importEmployeesRowSchema).max(500, "Max 500 rows per import"),
});

export const permissionsMatrixPutSchema = z.object({
  rows: z.array(
    z.object({
      role: employeeRoleEnum,
      module: z.string().min(1),
      action: z.string().min(1),
      allowed: z.boolean(),
    })
  ),
});

export const permissionsPreviewSchema = z.object({
  roles: z.array(employeeRoleEnum).min(1),
});
