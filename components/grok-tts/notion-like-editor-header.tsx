// --- Tiptap UI ---
// import { UndoRedoButton } from '@/components/tiptap/tiptap-ui/undo-redo-button';
// import { ButtonGroup } from '@/components/tiptap/tiptap-ui-primitive/button';
import { Separator } from '@/components/tiptap/tiptap-ui-primitive/separator';
// --- UI Primitives ---
import { Spacer } from '@/components/tiptap/tiptap-ui-primitive/spacer';

export function NotionEditorHeader() {
  return (
    <header className="sticky top-0 z-50 flex h-12 w-full items-center justify-between border-gray-200 border-b bg-white px-3 py-2 dark:border-gray-800 dark:bg-black">
      <Spacer />
      <div className="flex flex-row items-center gap-2">
        <Separator />
      </div>
    </header>
  );
}
