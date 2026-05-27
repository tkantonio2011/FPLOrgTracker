import { ShellClient } from "./ShellClient";
import pkg from "../../../package.json";
const version: string = pkg.version;

interface AppShellProps {
  children: React.ReactNode;
  currentGw?: number;
}

export function AppShell({ children, currentGw }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted font-sans">
      <ShellClient version={version} currentGw={currentGw}>
        {children}
      </ShellClient>
    </div>
  );
}
