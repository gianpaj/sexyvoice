import { Chat } from '@/components/call/chat';
// import { PresetShare } from "@/components/preset-share";

export default function Dashboard() {
  return (
    <main className="flex w-full flex-1 flex-col md:p-4 lg:mt-16">
      <div className="mx-auto flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-separator1 bg-bg1">
        <Chat />
      </div>
    </main>
  );
}
