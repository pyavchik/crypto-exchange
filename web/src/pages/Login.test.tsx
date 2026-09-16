import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { LoginView, type LoginViewProps } from "./Login.js";

function renderView(overrides: Partial<LoginViewProps> = {}) {
  const props: LoginViewProps = {
    email: "",
    password: "",
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
  it("renders an email field, a password field, a submit control and a link to /signup", () => {
    const markup = renderView();
    expect(markup).toContain('type="email"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('href="/signup"');
  });

  it("renders a form-level error message and, when present, the request id next to it", () => {
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
