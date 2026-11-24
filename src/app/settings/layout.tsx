import { SettingsView } from "@/components/settings/SettingsView";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsView />
      {children}
    </>
  );
}
