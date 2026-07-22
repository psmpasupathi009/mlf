"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { PIN_LENGTH } from "@/lib/auth/constants";

type PinStepProps = {
  pin: string;
  confirmPin?: string;
  showConfirm?: boolean;
  loading: boolean;
  error?: string;
  showForgot?: boolean;
  submitLabel?: string;
  onPinChange: (value: string) => void;
  onConfirmChange?: (value: string) => void;
  onSubmit: () => void;
  onForgot?: () => void;
  onBack?: () => void;
};

const slotClass =
  "h-11 w-9 rounded-md border border-input bg-white text-base text-foreground shadow-none first:rounded-md first:border-l last:rounded-md data-[active=true]:border-navy data-[active=true]:ring-1 data-[active=true]:ring-navy/25 sm:h-12 sm:w-10";

export function PinStep({
  pin,
  confirmPin = "",
  showConfirm = false,
  loading,
  error,
  showForgot = false,
  submitLabel,
  onPinChange,
  onConfirmChange,
  onSubmit,
  onForgot,
  onBack,
}: PinStepProps) {
  const ready = showConfirm
    ? pin.length === PIN_LENGTH && confirmPin.length === PIN_LENGTH
    : pin.length === PIN_LENGTH;

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-2.5">
        <Label className="text-[0.8125rem] font-medium tracking-wide text-foreground">
          {showConfirm
            ? `Create ${PIN_LENGTH}-digit PIN`
            : `${PIN_LENGTH}-digit PIN`}
        </Label>
        <InputOTP
          maxLength={PIN_LENGTH}
          value={pin}
          onChange={onPinChange}
          autoFocus
          containerClassName="justify-between sm:justify-start sm:gap-2"
        >
          <InputOTPGroup className="gap-1.5 sm:gap-2">
            {Array.from({ length: PIN_LENGTH }).map((_, index) => (
              <InputOTPSlot
                key={index}
                index={index}
                data-masked="true"
                className={slotClass}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {showConfirm ? (
        <div className="space-y-2.5">
          <Label className="text-[0.8125rem] font-medium tracking-wide text-foreground">
            Confirm PIN
          </Label>
          <InputOTP
            maxLength={PIN_LENGTH}
            value={confirmPin}
            onChange={onConfirmChange}
            containerClassName="justify-between sm:justify-start sm:gap-2"
          >
            <InputOTPGroup className="gap-1.5 sm:gap-2">
              {Array.from({ length: PIN_LENGTH }).map((_, index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  data-masked="true"
                  className={slotClass}
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        className="h-12 w-full text-[0.9375rem] font-medium tracking-wide"
        disabled={loading || !ready}
      >
        {loading
          ? "Please wait…"
          : (submitLabel ??
            (showConfirm ? "Save PIN & continue" : "Sign in"))}
      </Button>

      <div className="flex items-center justify-between gap-3 text-sm">
        {onBack ? (
          <button
            type="button"
            className="text-muted-foreground transition-colors hover:text-navy"
            onClick={onBack}
            disabled={loading}
          >
            Back
          </button>
        ) : (
          <span />
        )}
        {showForgot && onForgot ? (
          <button
            type="button"
            className="font-medium text-navy underline-offset-4 transition-colors hover:underline disabled:opacity-50"
            onClick={onForgot}
            disabled={loading}
          >
            {loading ? "Sending OTP…" : "Forgot PIN?"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
