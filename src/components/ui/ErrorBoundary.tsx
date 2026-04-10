"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-medium text-sm">Something went wrong.</p>
            <p className="text-red-500 text-xs mt-1">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-3 text-xs text-red-600 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

/** Inline error banner for API errors */
export function ApiErrorBanner({ code, message }: { code?: string; message?: string }) {
  const isOrgNotConfigured = code === "ORG_NOT_CONFIGURED";
  const isPrivate = code === "MANAGER_PRIVATE";
  const isFplDown = code === "FPL_API_UNAVAILABLE";

  if (isOrgNotConfigured) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
        Organisation not configured.{" "}
        <a href="/admin" className="underline font-medium hover:no-underline">
          Go to Admin to set up your organisation.
        </a>
      </div>
    );
  }

  if (isPrivate) {
    return (
      <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm">
        This member's team is set to private on FPL. Ask them to make it public in their FPL account settings.
      </div>
    );
  }

  if (isFplDown) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
        FPL data is temporarily unavailable. Data shown may be from an earlier refresh.
      </div>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
      {message ?? "An error occurred. Please try again."}
    </div>
  );
}
