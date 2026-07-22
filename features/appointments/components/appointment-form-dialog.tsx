"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  apiFetch,
  getErrorCode,
  getErrorMessage,
} from "@/lib/api/client";
import { ClientPicker } from "@/features/clients/components/client-picker";
import type { AppointmentSummary } from "@/features/appointments/server/serialize";
import { APPOINTMENT_MODE_OPTIONS } from "@/lib/validations/appointments.schema";
import {
  APPOINTMENT_DURATION_OPTIONS,
  APPOINTMENT_LOCATION_OPTIONS,
  APPOINTMENT_TITLE_OPTIONS,
} from "@/config/company/form-options";
import { SelectOrOther } from "@/shared/components/forms/select-or-other";
import { AvailabilitySlotPicker } from "@/features/availability/components/availability-slot-picker";
import type { PublicUser } from "@/lib/auth/session";
import { canBookForAnyAdvocate } from "@/lib/appointments/booking-rules";
import { displayMobile } from "@/lib/auth/mobile";

type AdvocateOption = {
  unitId: string;
  name: string;
  mobile: string;
  designation?: string | null;
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tenDigit(mobile: string): string {
  return displayMobile(mobile);
}

const CONFLICT_HINTS: Record<string, string> = {
  ADVOCATE_BUSY: "That advocate is already booked then — pick another free slot.",
  CLIENT_BUSY: "This client already has an appointment then — pick another time.",
  OUTSIDE_HOURS: "Outside working hours — check Availability.",
  BLOCKED: "Blocked on the advocate’s diary (break/court).",
  ON_LEAVE: "Advocate is on approved leave that day.",
  IN_PAST: "Choose a future time.",
};

export function AppointmentFormDialog({
  open,
  onOpenChange,
  appointment,
  user,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentSummary | null;
  user: PublicUser;
  onSaved: () => void;
}) {
  const isEdit = Boolean(appointment);
  const bookAny = canBookForAnyAdvocate(user.roles);
  const selfMobile10 = tenDigit(user.mobile);

  const [client, setClient] = useState<{ unitId: string; name: string } | null>(
    null
  );
  const [advocates, setAdvocates] = useState<AdvocateOption[]>([]);
  const [advocateMobile, setAdvocateMobile] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMin, setDurationMin] = useState("30");
  const [mode, setMode] = useState("office");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiFetch<{ data: AdvocateOption[] }>(
        "/api/v1/advocates?pageSize=100"
      );
      if (!cancelled && ok && data && typeof data === "object") {
        const list =
          "data" in data && Array.isArray((data as { data: unknown }).data)
            ? (data as { data: AdvocateOption[] }).data
            : Array.isArray(data)
              ? (data as AdvocateOption[])
              : [];
        setAdvocates(list);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setClient(
        appointment?.clientUnitId
          ? {
              unitId: appointment.clientUnitId,
              name: appointment.clientName ?? appointment.clientUnitId,
            }
          : null
      );
      if (bookAny) {
        setAdvocateMobile(
          appointment?.advocateMobile
            ? tenDigit(appointment.advocateMobile)
            : ""
        );
      } else {
        setAdvocateMobile(selfMobile10);
      }
      setTitle(appointment?.title ?? "");
      setScheduledAt(appointment ? toLocalInput(appointment.scheduledAt) : "");
      setDurationMin(String(appointment?.durationMin ?? 30));
      setMode(appointment?.mode ?? "office");
      setLocation(appointment?.location ?? "");
      setNotes(appointment?.notes ?? "");
      setError("");
    });
  }, [open, appointment, bookAny, selfMobile10]);

  const selectedAdvocate = useMemo(
    () =>
      advocates.find((a) => tenDigit(a.mobile) === tenDigit(advocateMobile)),
    [advocates, advocateMobile]
  );

  const effectiveAdvocateMobile = bookAny ? advocateMobile : selfMobile10;

  async function handleSubmit() {
    setError("");
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!scheduledAt) {
      setError("Pick a free date and time");
      return;
    }
    if (bookAny && !advocateMobile.trim()) {
      setError("Select an advocate");
      return;
    }

    setBusy(true);
    const payload = {
      clientUnitId: client?.unitId || undefined,
      advocateMobile: bookAny ? tenDigit(advocateMobile) : selfMobile10,
      title,
      scheduledAt: new Date(scheduledAt).toISOString(),
      durationMin: Number(durationMin) || 30,
      mode,
      location: location || undefined,
      notes: notes || undefined,
    };

    const { ok, data } = await apiFetch(
      isEdit
        ? `/api/v1/appointments/${appointment!.unitId}`
        : "/api/v1/appointments",
      { method: isEdit ? "PATCH" : "POST", json: payload }
    );
    setBusy(false);

    if (!ok) {
      const code = getErrorCode(data) ?? "";
      setError(
        CONFLICT_HINTS[code] ??
          getErrorMessage(
            data as Record<string, unknown>,
            "Failed to save appointment"
          )
      );
      return;
    }

    toast.success(isEdit ? "Appointment updated" : "Appointment scheduled");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit appointment" : "Book appointment"}
          </DialogTitle>
          <DialogDescription>
            Choose advocate and duration, then pick a free slot. Conflicts are
            blocked automatically.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label>Title</Label>
            <SelectOrOther
              value={title}
              onChange={setTitle}
              options={APPOINTMENT_TITLE_OPTIONS}
              placeholder="Select title"
              className="h-10"
              otherPlaceholder="Custom title"
            />
          </div>

          <div className="grid gap-2">
            <Label>
              Advocate <span className="text-destructive">*</span>
            </Label>
            {bookAny ? (
              <Select
                value={advocateMobile}
                onValueChange={(v) => {
                  setAdvocateMobile(v);
                  setScheduledAt("");
                }}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select advocate by name" />
                </SelectTrigger>
                <SelectContent className="z-200 max-h-72">
                  {advocates.map((a) => {
                    const m = tenDigit(a.mobile);
                    return (
                      <SelectItem key={a.unitId} value={m}>
                        {a.name}
                        {a.designation ? ` · ${a.designation}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-md border border-input bg-muted/30 px-3 py-2.5 text-sm">
                <span className="font-medium text-navy">
                  {user.name ?? "You"}
                </span>
                <span className="text-muted-foreground"> · {selfMobile10}</span>
              </div>
            )}
            {bookAny && selectedAdvocate ? (
              <p className="text-xs text-muted-foreground">
                Booking for {selectedAdvocate.name}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Duration</Label>
              <Select
                value={durationMin}
                onValueChange={(v) => {
                  setDurationMin(v);
                  setScheduledAt("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Duration" />
                </SelectTrigger>
                <SelectContent className="z-200">
                  {APPOINTMENT_DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-200">
                  {APPOINTMENT_MODE_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>
              Date &amp; time <span className="text-destructive">*</span>
            </Label>
            <AvailabilitySlotPicker
              advocateMobile={effectiveAdvocateMobile}
              durationMin={Number(durationMin) || 30}
              clientUnitId={client?.unitId}
              excludeAppointmentUnitId={isEdit ? appointment?.unitId : undefined}
              value={scheduledAt}
              onChange={setScheduledAt}
            />
          </div>

          <ClientPicker
            value={client}
            onChange={(c) => {
              setClient(c);
              setScheduledAt("");
            }}
            label="Client (optional — blocks double-booking this client)"
          />

          <div className="grid gap-2">
            <Label>Location</Label>
            <SelectOrOther
              value={location}
              onChange={setLocation}
              options={APPOINTMENT_LOCATION_OPTIONS}
              placeholder="Select location"
              className="h-10"
              otherPlaceholder="Custom location"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apt-notes">Notes</Label>
            <Textarea
              id="apt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Book appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
