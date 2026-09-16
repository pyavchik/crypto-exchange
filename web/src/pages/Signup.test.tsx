// Test-scope decision (02-03, Task 3, D-34 lineage): this suite keeps the web
// workspace's Node Vitest environment and asserts on rendered markup via
// renderToStaticMarkup, exactly as the rest of this project's frontend tests
// do — it does NOT add a DOM environment (jsdom/happy-dom) or an
// interaction-testing library (@testing-library/react, user-event). The
// interactive path this can't reach — typing into fields, submitting,
// following the /wallet redirect, watching the nav swap — is proven instead
// by the real-browser `npm run smoke` step that 02-04 extends.
//
// Why: the project's own recorded lesson
// (wiki/pages/findings/health-poller-illegal-invocation.md) is that a
// Node-environment test cannot observe browser-only behavior — that gap is
// exactly how BUG-001 (the health badge defect) reached UAT with a green
// suite. Adding a DOM environment and an interaction-testing library here is
// a real tooling change with its own failure modes, and it still would not
// cover the cookie/CORS behavior that is the actual risk in this phase
// (D-16/D-17). If a later phase wants component-interaction tests, that is
// its own scoped decision — not made here.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignupView, type SignupViewProps } from "./Signup.js";

function renderView(overrides: Partial<SignupViewProps> = {}) {
  const props: SignupViewProps = {
    email: "",
    password: "",
    fieldErrors: {},
    formError: null,
    requestId: null,
    submitting: false,
    onEmailChange: () => {},
    onPasswordChange: () => {},
    onSubmit: () => {},
    ...overrides,
  };
  return renderToStaticMarkup(<SignupView {...props} />);
}

describe("SignupView", () => {
  it("renders a clean form: an email field, a password field and a submit control, no error text", () => {
    const markup = renderView();
    expect(markup).toContain('type="email"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('type="submit"');
    expect(markup).not.toContain("field-error");
    expect(markup).not.toContain("form-error");
  });

  it("renders a message under the email field only when just the email is invalid", () => {
    const markup = renderView({ fieldErrors: { email: "Enter a valid email address" } });
    expect(markup).toContain("Enter a valid email address");
    expect(markup).toContain('id="signup-email-error"');
    expect(markup).not.toContain('id="signup-password-error"');
  });

  it("renders both messages at once when both fields are invalid", () => {
    const markup = renderView({
      fieldErrors: {
        email: "Enter a valid email address",
        password: "Password must be at least 8 characters",
      },
    });
    expect(markup).toContain("Enter a valid email address");
    expect(markup).toContain("Password must be at least 8 characters");
    expect(markup).toContain('id="signup-email-error"');
    expect(markup).toContain('id="signup-password-error"');
  });

  it("renders a form-level error message and, when present, the request id next to it", () => {
    const markup = renderView({
      formError: "That email is already registered",
      requestId: "r-3",
    });
    expect(markup).toContain("That email is already registered");
    expect(markup).toContain("Request ID: r-3");
  });

  it("renders no request id text when the form-level error carries none", () => {
    const markup = renderView({ formError: "Something went wrong. Please try again." });
    expect(markup).toContain("Something went wrong. Please try again.");
    expect(markup).not.toContain("Request ID");
  });

  it("renders the submit control disabled while submitting", () => {
    const idle = renderView({ submitting: false });
    expect(idle).not.toContain("disabled");

    const submitting = renderView({ submitting: true });
    expect(submitting).toContain("disabled");
  });
});
