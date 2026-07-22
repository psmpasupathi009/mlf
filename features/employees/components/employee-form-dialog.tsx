"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import { DESIGNATIONS, designationDefaultRoles, type Designation } from "@/config/company/designations";
import type { EmployeeSummary } from "@/features/employees/server/serialize";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "sub_admin", label: "Sub admin" },
  { value: "staff", label: "Staff" },
  { value: "advocate", label: "Advocate" },
  { value: "accountant", label: "Accountant" },
] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeSummary | null;
  canAssignAdmin: boolean;
  onSaved: () => void;
};

export function EmployeeFormDialog({ open, onOpenChange, employee, canAssignAdmin, onSaved }: Props) {
  const isEdit = Boolean(employee);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [designation, setDesignation] = useState<string>("");
  const [roles, setRoles] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    void (async () => {
      await Promise.resolve();
      setName(employee?.name ?? "");
      setMobile(employee?.mobile ?? "");
      setDesignation(employee?.designation ?? "");
      setRoles(employee?.roles ?? []);
      setEmail(employee?.email ?? "");
      setAddress(employee?.address ?? "");
      setError("");
    })();
  }, [open, employee]);

  function toggleRole(role: string) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function applyDesignationDefaults(value: string) {
    setDesignation(value);
    if (!isEdit && value && value in designationDefaultRoles) {
      setRoles(designationDefaultRoles[value as Designation]);
    }
  }

  async function handleSubmit() {
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!isEdit && mobile.replace(/\D/g, "").length < 10) {
      setError("Enter a valid mobile number");
      return;
    }
    if (roles.length === 0) {
      setError("Select at least one role");
      return;
    }

    setBusy(true);
    const payload = {
      name,
      designation: designation || undefined,
      roles,
      email: email || undefined,
      address: address || undefined,
      ...(isEdit ? {} : { mobile }),
    };

    const { ok, data } = await apiFetch(
      isEdit ? `/api/v1/employees/${employee!.unitId}` : "/api/v1/employees",
      { method: isEdit ? "PATCH" : "POST", json: payload }
    );
    setBusy(false);

    if (!ok) {
      setError(getErrorMessage(data as Record<string, unknown>, "Failed to save employee"));
      return;
    }

    toast.success(isEdit ? "Employee updated" : "Employee created");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit employee" : "Add employee"}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Update details for ${employee?.unitId}` : "Create a new employee profile."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="emp-name">Name</Label>
            <Input id="emp-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="emp-mobile">Mobile</Label>
              <Input
                id="emp-mobile"
                value={mobile}
                disabled={isEdit}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="10-digit mobile"
              />
            </div>
            <div className="grid gap-2">
              <Label>Designation</Label>
              <Select value={designation} onValueChange={applyDesignationDefaults}>
                <SelectTrigger>
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent className="z-200">
                  {DESIGNATIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-3">
              {ROLE_OPTIONS.filter((r) => r.value !== "admin" || canAssignAdmin).map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={roles.includes(r.value)}
                    onCheckedChange={() => toggleRole(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="emp-email">Email</Label>
              <Input id="emp-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emp-address">Address</Label>
              <Input id="emp-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
