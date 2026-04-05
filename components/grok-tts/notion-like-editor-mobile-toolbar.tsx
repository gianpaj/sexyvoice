'use client';

import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';

// --- Hooks ---
import { useIsBreakpoint } from '@/hooks/tiptap/use-is-breakpoint';
import { useTiptapEditor } from '@/hooks/tiptap/use-tiptap-editor';
import { useWindowSize } from '@/hooks/tiptap/use-window-size';

// --- Tiptap UI ---
// import {
//   ColorHighlightPopover,
//   ColorHighlightPopoverButton,
//   ColorHighlightPopoverContent,
// } from "@/components/tiptap/tiptap-ui/color-highlight-popover"

import { DeleteNodeButton } from '@/components/tiptap/tiptap-ui/delete-node-button';
import { ResetAllFormattingButton } from '@/components/tiptap/tiptap-ui/reset-all-formatting-button';
// import {
//   canSetLink,
//   LinkButton,
//   LinkContent,
//   LinkPopover,
// } from "@/components/tiptap/tiptap-ui/link-popover"
// import { MarkButton } from "@/components/tiptap/tiptap-ui/mark-button"
// import { TextAlignButton } from "@/components/tiptap/tiptap-ui/text-align-button"
import { SlashCommandTriggerButton } from '@/components/tiptap/tiptap-ui/slash-command-trigger-button';

// import { CopyAnchorLinkButton } from "@/components/tiptap/tiptap-ui/copy-anchor-link-button"
// import { TurnIntoDropdownContent } from "@/components/tiptap/tiptap-ui/turn-into-dropdown"
// import { useRecentColors } from "@/components/tiptap/tiptap-ui/color-text-popover"
// import {
//   ColorTextButton,
//   TEXT_COLORS,
// } from "@/components/tiptap/tiptap-ui/color-text-button"
// import {
//   canColorHighlight,
//   ColorHighlightButton,
//   HIGHLIGHT_COLORS,
// } from "@/components/tiptap/tiptap-ui/color-highlight-button"

// import { DuplicateButton } from "@/components/tiptap/tiptap-ui/duplicate-button"
// import { CopyToClipboardButton } from "@/components/tiptap/tiptap-ui/copy-to-clipboard-button"

import { MoreVerticalIcon } from '@/components/tiptap/tiptap-icons/more-vertical-icon';
import { MoveNodeButton } from '@/components/tiptap/tiptap-ui/move-node-button';
import {
  Button,
  ButtonGroup,
} from '@/components/tiptap/tiptap-ui-primitive/button';
// --- UI Primitives ---
import {
  Card,
  CardBody,
  CardGroupLabel,
  CardItemGroup,
} from '@/components/tiptap/tiptap-ui-primitive/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/tiptap/tiptap-ui-primitive/dropdown-menu';
// import { Spacer } from "@/components/tiptap/tiptap-ui-primitive/spacer"
import { Separator } from '@/components/tiptap/tiptap-ui-primitive/separator';
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/tiptap/tiptap-ui-primitive/toolbar';
import { useCursorVisibility } from '@/hooks/tiptap/use-cursor-visibility';
// --- Utils ---
import { getNodeDisplayName } from '@/lib/tiptap-utils';

// import { ImageNodeFloating } from "@/components/tiptap/tiptap-node/image-node/image-node-floating"

// =============================================================================
// Types & Constants
// =============================================================================

const TOOLBAR_VIEWS = {
  MAIN: 'main',
  HIGHLIGHTER: 'highlighter',
  LINK: 'link',
} as const;

type ToolbarViewId = (typeof TOOLBAR_VIEWS)[keyof typeof TOOLBAR_VIEWS];

export interface ToolbarViewType {
  content: React.ReactNode;
  desktopComponent?: React.ReactNode;
  icon: React.ReactNode;
  id: string;
  mobileButton?: (onClick: () => void) => React.ReactNode;
  shouldShow?: (editor: Editor | null) => boolean;
  title: string;
}

interface ToolbarState {
  isMainView: boolean;
  setViewId: (id: ToolbarViewId) => void;
  showMainView: () => void;
  showView: (id: ToolbarViewId) => void;
  viewId: ToolbarViewId;
}

// =============================================================================
// Hooks
// =============================================================================

function useToolbarState(isMobile: boolean): ToolbarState {
  const [viewId, setViewId] = useState<ToolbarViewId>(TOOLBAR_VIEWS.MAIN);

  useEffect(() => {
    if (!isMobile && viewId !== TOOLBAR_VIEWS.MAIN) {
      setViewId(TOOLBAR_VIEWS.MAIN);
    }
  }, [isMobile, viewId]);

  return {
    viewId,
    setViewId,
    isMainView: viewId === TOOLBAR_VIEWS.MAIN,
    showMainView: () => setViewId(TOOLBAR_VIEWS.MAIN),
    showView: (id: ToolbarViewId) => setViewId(id),
  };
}

function hasTextSelection(editor: Editor | null): boolean {
  if (!editor?.isEditable) return false;

  const { selection } = editor.state;
  return !selection.empty;
}

// =============================================================================
// Sub-Components
// =============================================================================

// =============================================================================
// Dropdown Menu Components
// =============================================================================

interface DropdownMenuActionsProps {
  editor: Editor | null;
}

function DropdownMenuActions({ editor }: DropdownMenuActionsProps) {
  const isMobile = useIsBreakpoint();
  if (!editor) return;

  return (
    <Card>
      <CardBody>
        <CardItemGroup>
          <CardGroupLabel>{getNodeDisplayName(editor)}</CardGroupLabel>
          <ButtonGroup>
            <DropdownMenuItem asChild>
              <ResetAllFormattingButton text="Reset formatting" />
            </DropdownMenuItem>
          </ButtonGroup>
        </CardItemGroup>

        <Separator orientation="horizontal" />

        <ButtonGroup>
          <DropdownMenuItem asChild>
            <DeleteNodeButton showShortcut={!isMobile} text="Delete" />
          </DropdownMenuItem>
        </ButtonGroup>
      </CardBody>
    </Card>
  );
}

function MoreActionsDropdown({ editor }: DropdownMenuActionsProps) {
  return (
    <DropdownMenu modal={true}>
      <DropdownMenuTrigger asChild>
        <Button data-appearance="subdued" data-style="ghost">
          <MoreVerticalIcon className="tiptap-button-icon" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent portal={true}>
        <DropdownMenuActions editor={editor} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =============================================================================
// Main Toolbar Content
// =============================================================================

interface MainToolbarContentProps {
  editor: Editor | null;
  isMobile: boolean;
  onViewChange: (viewId: ToolbarViewId) => void;
}

function MainToolbarContent({ editor }: MainToolbarContentProps) {
  const hasSelection = hasTextSelection(editor);
  const hasContent = (editor?.getText().length ?? 0) > 0;

  return (
    <>
      <ToolbarGroup>
        <SlashCommandTriggerButton />
        <MoreActionsDropdown editor={editor} />

        <ToolbarSeparator />
      </ToolbarGroup>

      {(hasSelection || hasContent) && (
        <>
          <ToolbarSeparator />

          <ToolbarGroup>
            <ToolbarSeparator />
          </ToolbarGroup>
        </>
      )}

      <ToolbarGroup>
        <MoveNodeButton direction="down" />
        <MoveNodeButton direction="up" />
      </ToolbarGroup>
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export interface MobileToolbarProps {
  editor?: Editor | null;
}

export function MobileToolbar({ editor: providedEditor }: MobileToolbarProps) {
  const { editor } = useTiptapEditor(providedEditor);
  const isMobile = useIsBreakpoint('max', 480);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolbarState = useToolbarState(isMobile);

  const { height } = useWindowSize();
  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
  });

  if (!(isMobile && editor?.isEditable)) {
    return null;
  }

  return (
    <Toolbar
      ref={toolbarRef}
      style={{
        ...(isMobile
          ? {
              bottom: `calc(100% - ${height - rect.y}px)`,
            }
          : {}),
      }}
    >
      {toolbarState.isMainView && (
        <MainToolbarContent
          editor={editor}
          isMobile={isMobile}
          onViewChange={toolbarState.showView}
        />
      )}
    </Toolbar>
  );
}
