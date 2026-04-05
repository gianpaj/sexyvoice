import type { Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';

import { useFloatingToolbarVisibility } from '@/hooks/tiptap/use-floating-toolbar-visibility';
import { useIsBreakpoint } from '@/hooks/tiptap/use-is-breakpoint';
// --- Hooks ---
import { useTiptapEditor } from '@/hooks/tiptap/use-tiptap-editor';
import { useUiEditorState } from '@/hooks/tiptap/use-ui-editor-state';

// --- Node ---
// import { ImageNodeFloating } from "@/components/tiptap/tiptap-node/image-node/image-node-floating"

// --- Icons ---
import { MoreVerticalIcon } from '@/components/tiptap/tiptap-icons/more-vertical-icon';

// --- UI ---
// import { ColorTextPopover } from "@/components/tiptap/tiptap-ui/color-text-popover"

// --- UI ---
// import { ColorTextPopover } from "@/components/tiptap/tiptap-ui/color-text-popover"

// import { LinkPopover } from "@/components/tiptap/tiptap-ui/link-popover"
// import type { Mark } from "@/components/tiptap/tiptap-ui/mark-button"
// import { canToggleMark, MarkButton } from "@/components/tiptap/tiptap-ui/mark-button"
// import type { TextAlign } from "@/components/tiptap/tiptap-ui/text-align-button"
// import {
//   canSetTextAlign,
//   TextAlignButton,
// } from "@/components/tiptap/tiptap-ui/text-align-button"
import { TurnIntoDropdown } from '@/components/tiptap/tiptap-ui/turn-into-dropdown';
// --- Primitive UI Components ---
import type { ButtonProps } from '@/components/tiptap/tiptap-ui-primitive/button';
import { Button } from '@/components/tiptap/tiptap-ui-primitive/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/tiptap/tiptap-ui-primitive/popover';
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/tiptap/tiptap-ui-primitive/toolbar';
// --- UI Utils ---
import { FloatingElement } from '@/components/tiptap/tiptap-ui-utils/floating-element';
// --- Utils ---
import { isSelectionValid } from '@/lib/tiptap-utils';

export function NotionToolbarFloating() {
  const { editor } = useTiptapEditor();
  const isMobile = useIsBreakpoint('max', 480);
  const { lockDragHandle, commentInputVisible } = useUiEditorState(editor);

  const { shouldShow } = useFloatingToolbarVisibility({
    editor,
    isSelectionValid,
    extraHideWhen: Boolean(commentInputVisible),
  });

  if (lockDragHandle || isMobile) return null;

  return (
    <FloatingElement shouldShow={shouldShow}>
      <Toolbar variant="floating">
        <ToolbarSeparator />

        <ToolbarGroup>
          <TurnIntoDropdown hideWhenUnavailable={true} />
        </ToolbarGroup>

        <ToolbarSeparator />
        {/*
        <ToolbarGroup>
          <MarkButton hideWhenUnavailable={true} type="bold" />
          <MarkButton hideWhenUnavailable={true} type="italic" />
          <MarkButton hideWhenUnavailable={true} type="underline" />
          <MarkButton hideWhenUnavailable={true} type="strike" />
          <MarkButton hideWhenUnavailable={true} type="code" />
        </ToolbarGroup>*/}

        <MoreOptions hideWhenUnavailable={true} />
      </Toolbar>
    </FloatingElement>
  );
}

// function canMoreOptions(editor: Editor | null): boolean {
//   if (!editor) {
//     return false;
//   }

//   const canTextAlignAny = ['left', 'center', 'right', 'justify'].some((align) =>
//     canSetTextAlign(editor, align as TextAlign),
//   );

//   const canMarkAny = ['superscript', 'subscript'].some((type) =>
//     canToggleMark(editor, type as Mark),
//   );

//   return canMarkAny || canTextAlignAny;
// }

function shouldShowMoreOptions(params: {
  editor: Editor | null;
  hideWhenUnavailable: boolean;
}): boolean {
  const { editor, hideWhenUnavailable } = params;

  if (!editor) {
    return false;
  }

  // if (hideWhenUnavailable && !editor.isActive('code')) {
  //   return canMoreOptions(editor);
  // }

  return Boolean(editor?.isEditable);
}

export interface MoreOptionsProps extends Omit<ButtonProps, 'type'> {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null;
  /**
   * Whether to hide the dropdown when no options are available.
   * @default false
   */
  hideWhenUnavailable?: boolean;
}

export function MoreOptions({
  editor: providedEditor,
  hideWhenUnavailable = false,
  ...props
}: MoreOptionsProps) {
  const { editor } = useTiptapEditor(providedEditor);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!editor) return;

    const handleSelectionUpdate = () => {
      setShow(
        shouldShowMoreOptions({
          editor,
          hideWhenUnavailable,
        }),
      );
    };

    handleSelectionUpdate();

    editor.on('selectionUpdate', handleSelectionUpdate);

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, hideWhenUnavailable]);

  if (!(show && editor && editor.isEditable)) {
    return null;
  }

  return (
    <>
      <ToolbarSeparator />
      <ToolbarGroup>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              data-style="ghost"
              role="button"
              tabIndex={-1}
              tooltip="More options"
              type="button"
              {...props}
            >
              <MoreVerticalIcon className="tiptap-button-icon" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            alignOffset={4}
            asChild
            side="top"
            sideOffset={4}
          >
            <Toolbar tabIndex={0} variant="floating">
              <ToolbarSeparator />
            </Toolbar>
          </PopoverContent>
        </Popover>
      </ToolbarGroup>
    </>
  );
}
