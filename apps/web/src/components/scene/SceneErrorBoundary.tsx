"use client";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class SceneErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[SceneErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full bg-slate-950 text-slate-200 p-6 overflow-auto">
          <h2 className="text-red-400 font-bold mb-2">3D scene error</h2>
          <pre className="text-xs whitespace-pre-wrap break-all text-slate-300">
            {this.state.error.message}
          </pre>
          <pre className="text-xs whitespace-pre-wrap break-all text-slate-500 mt-4">
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
