"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OtpStep } from "@/features/auth/components/otp-step";
import { PhoneStep } from "@/features/auth/components/phone-step";
import { PinStep } from "@/features/auth/components/pin-step";
import { useResendCountdown } from "@/features/auth/hooks/use-resend-countdown";
import { authFetch, getErrorMessage } from "@/features/auth/lib/auth-client";

type Step =
  | "phone"
  | "pin"
  | "otp_setup"
  | "setup_pin"
  | "otp_forgot"
  | "reset_pin";

export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const countdown = useResendCountdown(60);

  const [step, setStep] = useState<Step>("phone");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otpProofToken, setOtpProofToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const busy = loading || pending;

  function resetCodes() {
    setOtp("");
    setPin("");
    setConfirmPin("");
    setError("");
  }

  function goHome() {
    startTransition(() => {
      router.replace("/");
      router.refresh();
    });
  }

  async function handleCheckMobile() {
    if (busy) return;
    setError("");
    if (mobile.length !== 10) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }

    setLoading(true);
    const { ok, data } = await authFetch<{
      status?: string;
      message?: string;
      error?: string;
    }>("/api/v1/auth/check-mobile", { mobile });
    setLoading(false);

    if (!ok) {
      setError(getErrorMessage(data, "Unable to check mobile"));
      return;
    }

    if (data.status === "pin") {
      resetCodes();
      setStep("pin");
      return;
    }

    if (data.status === "otp_required") {
      await sendOtp("setup");
      return;
    }

    setError(data.message || "Number not registered. Contact admin.");
  }

  async function sendOtp(purpose: "setup" | "forgot_pin") {
    if (busy) return;
    setLoading(true);
    setError("");
    const { ok, data } = await authFetch<{ error?: string; message?: string }>(
      "/api/v1/auth/send-otp",
      { mobile, purpose }
    );
    setLoading(false);

    if (!ok) {
      setError(getErrorMessage(data, "Failed to send OTP"));
      if (purpose === "forgot_pin") {
        setStep("otp_forgot");
      }
      return;
    }

    toast.success("OTP sent by SMS");
    countdown.start();
    setOtp("");
    setStep(purpose === "setup" ? "otp_setup" : "otp_forgot");
  }

  async function handleVerifyOtp(purpose: "setup" | "forgot_pin") {
    if (busy) return;
    setLoading(true);
    setError("");
    const { ok, data } = await authFetch<{
      otpProofToken?: string;
      error?: string;
    }>("/api/v1/auth/verify-otp", { mobile, otp, purpose });
    setLoading(false);

    if (!ok || !data.otpProofToken) {
      setError(getErrorMessage(data, "Incorrect OTP"));
      return;
    }

    setOtpProofToken(data.otpProofToken);
    setPin("");
    setConfirmPin("");
    setStep(purpose === "setup" ? "setup_pin" : "reset_pin");
  }

  async function handleLogin() {
    if (busy) return;
    setLoading(true);
    setError("");
    const { ok, data } = await authFetch<{ error?: string }>(
      "/api/v1/auth/login",
      { mobile, pin }
    );
    setLoading(false);

    if (!ok) {
      setError(getErrorMessage(data, "Invalid mobile or PIN"));
      return;
    }

    toast.success("Welcome back");
    goHome();
  }

  async function handleSetupPin() {
    if (busy) return;
    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }

    setLoading(true);
    setError("");
    const { ok, data } = await authFetch<{ error?: string }>(
      "/api/v1/auth/setup-pin",
      { pin, confirmPin, otpProofToken }
    );
    setLoading(false);

    if (!ok) {
      setError(getErrorMessage(data, "Failed to set PIN"));
      return;
    }

    toast.success("PIN created successfully");
    goHome();
  }

  async function handleResetPin() {
    if (busy) return;
    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }

    setLoading(true);
    setError("");
    const { ok, data } = await authFetch<{ error?: string }>(
      "/api/v1/auth/forgot-pin/reset",
      { pin, confirmPin, otpProofToken }
    );
    setLoading(false);

    if (!ok) {
      setError(getErrorMessage(data, "Failed to reset PIN"));
      return;
    }

    toast.success("PIN reset successfully");
    goHome();
  }

  async function handleForgotPin() {
    if (busy) return;
    resetCodes();
    setStep("otp_forgot");
    await sendOtp("forgot_pin");
  }

  const heading =
    step === "phone"
      ? { title: "Sign in", subtitle: null as string | null }
      : step === "pin"
        ? { title: "Enter PIN", subtitle: `+91 ${mobile}` }
        : step === "otp_setup"
          ? { title: "Verify OTP", subtitle: `Sent to +91 ${mobile}` }
          : step === "otp_forgot"
            ? { title: "Reset PIN", subtitle: `OTP sent to +91 ${mobile}` }
            : step === "setup_pin"
              ? { title: "Create PIN", subtitle: "Choose a 6-digit PIN" }
              : { title: "New PIN", subtitle: "Choose a new 6-digit PIN" };

  return (
    <div className="w-full text-foreground">
      <header className="mb-9">
        <div className="mb-3 h-px w-8 bg-gold" aria-hidden />
        <h2 className="text-xl font-semibold tracking-tight text-navy sm:text-[1.5rem]">
          {heading.title}
        </h2>
        {heading.subtitle ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {heading.subtitle}
          </p>
        ) : null}
      </header>

      {step === "phone" ? (
        <PhoneStep
          mobile={mobile}
          loading={busy}
          error={error}
          onChange={setMobile}
          onSubmit={handleCheckMobile}
        />
      ) : null}

      {step === "pin" ? (
        <PinStep
          pin={pin}
          loading={busy}
          error={error}
          showForgot
          onPinChange={setPin}
          onSubmit={handleLogin}
          onForgot={handleForgotPin}
          onBack={() => {
            resetCodes();
            setStep("phone");
          }}
        />
      ) : null}

      {step === "otp_setup" || step === "otp_forgot" ? (
        <OtpStep
          otp={otp}
          loading={busy}
          resendActive={countdown.active}
          remaining={countdown.remaining}
          error={error}
          mode={step === "otp_forgot" ? "forgot" : "setup"}
          onChange={setOtp}
          onSubmit={() =>
            handleVerifyOtp(step === "otp_setup" ? "setup" : "forgot_pin")
          }
          onResend={() =>
            sendOtp(step === "otp_setup" ? "setup" : "forgot_pin")
          }
          onBack={() => {
            resetCodes();
            setStep(step === "otp_forgot" ? "pin" : "phone");
          }}
        />
      ) : null}

      {step === "setup_pin" ? (
        <PinStep
          pin={pin}
          confirmPin={confirmPin}
          showConfirm
          loading={busy}
          error={error}
          onPinChange={setPin}
          onConfirmChange={setConfirmPin}
          onSubmit={handleSetupPin}
        />
      ) : null}

      {step === "reset_pin" ? (
        <PinStep
          pin={pin}
          confirmPin={confirmPin}
          showConfirm
          loading={busy}
          error={error}
          submitLabel="Save new PIN"
          onPinChange={setPin}
          onConfirmChange={setConfirmPin}
          onSubmit={handleResetPin}
        />
      ) : null}
    </div>
  );
}
