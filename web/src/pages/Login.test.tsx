import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { LoginView, type LoginViewProps } from "./Login.js";

function renderView(overrides: Partial<LoginViewProps> = {}) {
  const props: LoginViewProps = {
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
  return renderToStaticMarkup(
    <MemoryRouter>
      <LoginView {...props} />
    </MemoryRouter>,
  );
}

describe("LoginView", () => {
  it("renders a clean form: an email field, a password field, a submit control and a link to /signup, no error text", () => {
    const markup = renderView();
    expect(markup).toContain('type="email"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('href="/signup"');
    expect(markup).not.toContain("field-error");
    expect(markup).not.toContain("form-error");
  });

  it("renders a message under the email field only when just the email is invalid", () => {
    const markup = renderView({ fieldErrors: { email: "Enter a valid email address" } });
    expect(markup).toContain("Enter a valid email address");
    expect(markup).toContain('id="login-email-error"');
    expect(markup).not.toContain('id="login-password-error"');
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
    expect(markup).toContain('id="login-email-error"');
    expect(markup).toContain('id="login-password-error"');
  });

  it("renders a form-level error message and the request id when present", () => {
    const markup = renderView({
      formError: "Invalid email or password",
      requestId: "r-7",
    });
    expect(markup).toContain("Invalid email or password");
    expect(markup).toContain("Request ID: r-7");
  });

  it("renders no request id text when the error carries none", () => {
    const markup = renderView({ formError: "Invalid email or password", requestId: null });
    expect(markup).toContain("Invalid email or password");
    expect(markup).not.toContain("Request ID");
  });

  it("renders the submit control disabled while submitting", () => {
    const idle = renderView({ submitting: false });
    expect(idle).not.toContain("disabled");

    const submitting = renderView({ submitting: true });
    expect(submitting).toContain("disabled");
  });
});
