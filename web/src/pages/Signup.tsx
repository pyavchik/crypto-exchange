import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "../lib/api.js";
import { formErrorsFromApiError, useAuth, validateCredentialsClientSide } from "../lib/auth.js";

export interface SignupViewProps {
  email: string;
  password: string;
  fieldErrors: Record<string, string>;
  formError: string | null;
  requestId: string | null;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

// Pure view: props-only, so renderToStaticMarkup can exercise every visual
// state (HealthBadgeView's pure/stateful split).
export function SignupView({
  email,
  password,
  fieldErrors,
  formError,
  requestId,
  submitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: SignupViewProps) {
  return (
    <section>
      <h1>Sign up</h1>
      {/* noValidate: this form renders its own per-field messages (D-27) —
          native browser validation UI would otherwise intercept submission
          before onSubmit runs, hiding those messages. */}
      <form onSubmit={onSubmit} noValidate className="form">
        {formError ? (
          <p className="form-error" role="alert">
            {formError}
            {requestId ? <span> Request ID: {requestId}</span> : null}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="signup-email">
            Email
            <input
              id="signup-email"
              type="email"
              name="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "signup-email-error" : undefined}
            />
          </label>
          {fieldErrors.email ? (
            <p className="field-error" id="signup-email-error" role="alert">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="signup-password">
            Password
            <input
              id="signup-password"
              type="password"
              name="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              required
              minLength={8}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "signup-password-error" : undefined}
            />
          </label>
          {fieldErrors.password ? (
            <p className="field-error" id="signup-password-error" role="alert">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>
        <button type="submit" disabled={submitting}>
          Sign up
        </button>
      </form>
    </section>
  );
}

export function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);
    setRequestId(null);

    // Accelerator only: catches the obvious mistakes before a round trip.
    // A server response carrying field detail always overwrites this below.
    const clientFieldErrors = validateCredentialsClientSide({ email, password });
    if (Object.keys(clientFieldErrors).length > 0) {
      setFieldErrors(clientFieldErrors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    signup(email, password)
      .then(() => {
        void navigate("/wallet");
      })
      .catch((error: unknown) => {
        setSubmitting(false);
        if (error instanceof ApiError) {
          const { fieldErrors: serverFieldErrors, formError: serverFormError } =
            formErrorsFromApiError(error);
          setFieldErrors(serverFieldErrors);
          setFormError(serverFormError);
          setRequestId(error.requestId);
          return;
        }
        setFormError("Something went wrong. Please try again.");
      });
  }

  return (
    <SignupView
      email={email}
      password={password}
      fieldErrors={fieldErrors}
      formError={formError}
      requestId={requestId}
      submitting={submitting}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleSubmit}
    />
  );
}
