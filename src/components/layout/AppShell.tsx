import { ShellClient } from "./ShellClient";
import pkg from "../../../package.json";
const version: string = pkg.version;

interface AppShellProps {
  children: React.ReactNode;
  orgName?: string;
  currentGw?: number;
}

export function AppShell({ children, orgName, currentGw }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted font-sans">
      <ShellClient version={version} orgName={orgName} currentGw={currentGw}>
        {children}
      </ShellClient>
    </div>
  );
}
