import InstallPrompt from "../components/InstallPrompt";

export default function AppSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <InstallPrompt />
    </>
  );
}
