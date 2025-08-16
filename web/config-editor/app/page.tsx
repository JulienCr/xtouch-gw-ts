import ConfigBuilder from "@/components/ConfigBuilder";

export default function Home() {
  return (
    <main className="min-h-screen p-4 space-y-6">
      <h1 className="text-xl font-bold">XTouch Config Builder</h1>
      <ConfigBuilder />
    </main>
  );
}
