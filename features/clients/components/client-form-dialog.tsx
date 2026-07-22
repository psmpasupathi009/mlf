"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import type { ClientSummary } from "@/features/clients/server/serialize";
import {
  CLIENT_GENDER_OPTIONS,
  CLIENT_INTAKE_DEFAULTS,
} from "@/lib/validations/clients.schema";
import { office } from "@/config/company/office";
import {
  OCCUPATION_OPTIONS,
  OFFICE_DISTRICT_OPTIONS,
  REFERRED_BY_OPTIONS,
  RELATION_PREFIX_OPTIONS,
} from "@/config/company/form-options";
import { INDIA_STATES } from "@/lib/courts/india-states";
import { SelectOrOther } from "@/shared/components/forms/select-or-other";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: ClientSummary | null;
  onSaved: (client: ClientSummary) => void;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: Props) {
  const isEdit = Boolean(client);
  const [name, setName] = useState("");
  const [relationPrefix, setRelationPrefix] = useState("");
  const [relationName, setRelationName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [gender, setGender] = useState("");
  const [mobile, setMobile] = useState("");
  const [altMobile, setAltMobile] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState(CLIENT_INTAKE_DEFAULTS.district);
  const [state, setState] = useState(CLIENT_INTAKE_DEFAULTS.state);
  const [aadhaarLast4, setAadhaarLast4] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [matterBrief, setMatterBrief] = useState("");
  const [notes, setNotes] = useState("");
  const [smsConsent, setSmsConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const townOptions = office.practiceTowns.map((t) => ({
    value: t,
    label: t,
  }));

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setName(client?.name ?? "");
      const fos = client?.fatherOrSpouse ?? "";
      const prefixHit = RELATION_PREFIX_OPTIONS.find((p) =>
        fos.startsWith(`${p.value} `)
      );
      if (prefixHit) {
        setRelationPrefix(prefixHit.value);
        setRelationName(fos.slice(prefixHit.value.length).trim());
      } else {
        setRelationPrefix("");
        setRelationName(fos);
      }
      setOccupation(client?.occupation ?? "");
      setGender(client?.gender ?? "");
      setMobile(client?.mobile ?? "");
      setAltMobile(client?.altMobile ?? "");
      setEmail(client?.email ?? "");
      setAddress(client?.address ?? "");
      setCity(client?.city ?? "");
      setDistrict(client?.district ?? CLIENT_INTAKE_DEFAULTS.district);
      setState(client?.state ?? CLIENT_INTAKE_DEFAULTS.state);
      setAadhaarLast4(client?.aadhaarLast4 ?? "");
      setReferredBy(client?.referredBy ?? "");
      setMatterBrief(client?.matterBrief ?? "");
      setNotes(client?.notes ?? "");
      setSmsConsent(client?.smsConsent ?? true);
      setError("");
    });
  }, [open, client]);

  async function handleSubmit() {
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (mobile.replace(/\D/g, "").length < 10) {
      setError("Enter a valid mobile number");
      return;
    }
    if (aadhaarLast4 && !/^\d{4}$/.test(aadhaarLast4)) {
      setError("Aadhaar last 4 must be exactly 4 digits");
      return;
    }

    const fatherOrSpouse = [relationPrefix, relationName.trim()]
      .filter(Boolean)
      .join(" ")
      .trim();

    setBusy(true);
    const payload = {
      name,
      fatherOrSpouse: fatherOrSpouse || undefined,
      occupation: occupation || undefined,
      gender: gender || undefined,
      mobile,
      altMobile: altMobile || undefined,
      email: email || undefined,
      address: address || undefined,
      city: city || undefined,
      district: district || undefined,
      state: state || undefined,
      aadhaarLast4: aadhaarLast4 || undefined,
      referredBy: referredBy || undefined,
      matterBrief: matterBrief || undefined,
      notes: notes || undefined,
      smsConsent,
    };

    const { ok, data } = await apiFetch<{ client: ClientSummary }>(
      isEdit ? `/api/v1/clients/${client!.unitId}` : "/api/v1/clients",
      { method: isEdit ? "PATCH" : "POST", json: payload }
    );
    setBusy(false);

    if (!ok) {
      setError(
        getErrorMessage(data as Record<string, unknown>, "Failed to save client")
      );
      return;
    }

    toast.success(isEdit ? "Client updated" : "Client intake saved");
    onSaved((data as unknown as { client: ClientSummary }).client);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90vh,calc(100dvh-1.25rem))] max-h-[min(90vh,calc(100dvh-1.25rem))] w-[min(100%,calc(100dvw-1.25rem))] max-w-275 flex-col gap-0 overflow-hidden rounded-xl p-0 sm:w-[min(96vw,1100px)]">
        <DialogHeader className="shrink-0 border-b border-border/80 px-3 py-3 pr-11 sm:px-5 sm:py-4 md:px-6">
          <DialogTitle className="text-base sm:text-lg">
            {isEdit ? "Edit client intake" : "Client intake"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Collect identity and contact for the office register. Full Aadhaar
            is never stored — last 4 only. Defaults: {office.defaultDistrict},{" "}
            {office.defaultState}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5">
          <div className="grid gap-4 md:grid-cols-2">
          <Section
            title="1. Identity"
            description="As on petition / vakalat — name and parent or spouse"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="cl-name">
                  Full name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="As in Aadhaar / petition"
                />
              </div>
              <div className="grid gap-2">
                <Label>Relation</Label>
                <Select
                  value={relationPrefix || undefined}
                  onValueChange={setRelationPrefix}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="S/o · W/o…" />
                  </SelectTrigger>
                  <SelectContent className="z-200">
                    {RELATION_PREFIX_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cl-father">Father / spouse / guardian name</Label>
                <Input
                  id="cl-father"
                  value={relationName}
                  onChange={(e) => setRelationName(e.target.value)}
                  placeholder="Name"
                />
              </div>
              <div className="grid gap-2">
                <Label>Gender</Label>
                <Select
                  value={gender || undefined}
                  onValueChange={setGender}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent className="z-200">
                    {CLIENT_GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Occupation</Label>
                <SelectOrOther
                  value={occupation}
                  onChange={setOccupation}
                  options={OCCUPATION_OPTIONS}
                  placeholder="Select occupation"
                  className="h-10"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cl-aadhaar">Aadhaar last 4 only</Label>
                <Input
                  id="cl-aadhaar"
                  value={aadhaarLast4}
                  maxLength={4}
                  inputMode="numeric"
                  onChange={(e) =>
                    setAadhaarLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="••••"
                />
              </div>
            </div>
          </Section>

          <Section
            title="2. Contact"
            description="Primary mobile is used for hearing SMS"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="cl-mobile">
                  Mobile <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cl-mobile"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cl-alt-mobile">Alt mobile</Label>
                <Input
                  id="cl-alt-mobile"
                  value={altMobile}
                  onChange={(e) => setAltMobile(e.target.value)}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="cl-email">Email</Label>
                <Input
                  id="cl-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                />
                <span>
                  Client consents to hearing / office SMS on the primary mobile
                  (see Privacy policy).
                </span>
              </label>
            </div>
          </Section>

          <Section
            title="3. Address"
            description="For notices and vakalat — town / district / state"
          >
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div className="grid gap-2 sm:col-span-2 md:col-span-3">
                <Label htmlFor="cl-address">Door / street / area</Label>
                <Textarea
                  id="cl-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  placeholder="Door no., street, village / locality"
                />
              </div>
              <div className="grid gap-2">
                <Label>Town / city</Label>
                <SelectOrOther
                  value={city}
                  onChange={setCity}
                  options={townOptions}
                  placeholder="Select town"
                  className="h-10"
                  otherPlaceholder="Type town / city"
                />
              </div>
              <div className="grid gap-2">
                <Label>District</Label>
                <SelectOrOther
                  value={district}
                  onChange={setDistrict}
                  options={OFFICE_DISTRICT_OPTIONS}
                  placeholder="Select district"
                  className="h-10"
                />
              </div>
              <div className="grid gap-2">
                <Label>State</Label>
                <Select value={state || undefined} onValueChange={setState}>
                  <SelectTrigger>
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent className="z-200 max-h-72">
                    {INDIA_STATES.map((s) => (
                      <SelectItem key={s.code} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          <Section
            title="4. Matter at intake"
            description="Short facts before case register — opposite party goes on the case form"
          >
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cl-matter">Matter brief</Label>
                <Textarea
                  id="cl-matter"
                  value={matterBrief}
                  onChange={(e) => setMatterBrief(e.target.value)}
                  rows={3}
                  placeholder="What happened, relief sought, urgency, papers brought…"
                />
              </div>
              <div className="grid gap-2">
                <Label>Referred by</Label>
                <SelectOrOther
                  value={referredBy}
                  onChange={setReferredBy}
                  options={REFERRED_BY_OPTIONS}
                  placeholder="How they found us"
                  className="h-10"
                  otherPlaceholder="Name / source"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cl-notes">Internal notes</Label>
                <Textarea
                  id="cl-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Clerk notes — not for SMS"
                />
              </div>
            </div>
          </Section>

          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/80 bg-muted/30 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={busy}>
              {busy ? "Saving…" : isEdit ? "Save changes" : "Save client (CLI)"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
