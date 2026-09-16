import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";

export interface SignupViewProps {
  email: string;
  password: string;
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
      <form onSubmit={onSubmit}>
        {formError ? (
          <p role="alert">
            {formError}
            {requestId ? <span> Request ID: {requestId}</span> : null}
          </p>
        ) : null}
        <label>
          Email
          <input
            type="email"
            name="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            required
            minLength={8}
          />
        </label>
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
  const [formError, setFormError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setRequestId(null);
    signup(email, password)
      .then(() => {
        void navigate("/wallet");
      })
      .catch((error: unknown) => {
        setSubmitting(false);
        if (error instanceof ApiError) {
          setFormError(error.message);
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
      formError={formError}
      requestId={requestId}
      submitting={submitting}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleSubmit}
    />
  );
}
