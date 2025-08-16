import StateViewer from "@/components/StateViewer";

export default function StatePage() {
  return (
    <main className="min-h-screen p-4 space-y-6">
      <h1 className="text-xl font-bold">State Viewer (temps réel)</h1>
      <StateViewer />
    </main>
  );
}

