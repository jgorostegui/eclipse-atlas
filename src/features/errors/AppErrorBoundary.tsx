import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "../../i18n/useI18n";

type BoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type BoundaryState = { hasError: boolean };

class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Planner render failed.", error, info.componentStack);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const fallback = (
    <main className="fatal-error" role="alert">
      <span className="eyebrow">{t("help.eyebrow")}</span>
      <h1>{t("error.title")}</h1>
      <p>{t("error.body")}</p>
      <button type="button" onClick={() => window.location.reload()}>
        {t("error.reload")}
      </button>
    </main>
  );

  return <ErrorBoundary fallback={fallback}>{children}</ErrorBoundary>;
}
