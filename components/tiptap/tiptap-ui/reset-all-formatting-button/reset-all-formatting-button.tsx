import { forwardRef, useCallback } from 'react';

// --- Tiptap UI ---
import type { UseResetAllFormattingConfig } from '@/components/tiptap/tiptap-ui/reset-all-formatting-button';
import {
  RESET_ALL_FORMATTING_SHORTCUT_KEY,
  useResetAllFormatting,
} from '@/components/tiptap/tiptap-ui/reset-all-formatting-button';
import { Badge } from '@/components/tiptap/tiptap-ui-primitive/badge';
// --- UI Primitives ---
import type { ButtonProps } from '@/components/tiptap/tiptap-ui-primitive/button';
import { Button } from '@/components/tiptap/tiptap-ui-primitive/button';
// --- Hooks ---
import { useTiptapEditor } from '@/hooks/tiptap/use-tiptap-editor';
// --- Lib ---
import { parseShortcutKeys } from '@/lib/tiptap-utils';

export interface ResetAllFormattingButtonProps
  extends Omit<ButtonProps, 'type'>,
    UseResetAllFormattingConfig {
  /**
   * Optional show shortcut keys in the button.
   * @default false
   */
  showShortcut?: boolean;
  /**
   * Optional text to display alongside the icon.
   */
  text?: string;
}

export function ResetAllFormattingShortcutBadge({
  shortcutKeys = RESET_ALL_FORMATTING_SHORTCUT_KEY,
}: {
  shortcutKeys?: string;
}) {
  return <Badge>{parseShortcutKeys({ shortcutKeys })}</Badge>;
}

/**
 * Button component for resetting formatting of a node in a Tiptap editor.
 * Removes all marks and converts non-paragraph nodes to paragraphs.
 *
 * For custom button implementations, use the `useResetAllFormatting` hook instead.
 */
export const ResetAllFormattingButton = forwardRef<
  HTMLButtonElement,
  ResetAllFormattingButtonProps
>(
  (
    {
      editor: providedEditor,
      text,
      hideWhenUnavailable = false,
      preserveMarks = ['inlineThread'],
      onResetAllFormatting,
      showShortcut = false,
      onClick,
      children,
      ...buttonProps
    },
    ref,
  ) => {
    const { editor } = useTiptapEditor(providedEditor);
    const {
      isVisible,
      canReset,
      handleResetFormatting,
      label,
      shortcutKeys,
      Icon,
    } = useResetAllFormatting({
      editor,
      preserveMarks,
      hideWhenUnavailable,
      onResetAllFormatting,
    });

    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        handleResetFormatting();
      },
      [handleResetFormatting, onClick],
    );

    if (!isVisible) {
      return null;
    }

    return (
      <Button
        aria-label={label}
        data-active-state="off"
        data-disabled={!canReset}
        data-style="ghost"
        disabled={!canReset}
        onClick={handleClick}
        role="button"
        tabIndex={-1}
        tooltip="Reset formatting"
        type="button"
        {...buttonProps}
        ref={ref}
      >
        {children ?? (
          <>
            <Icon className="tiptap-button-icon" />
            {text && <span className="tiptap-button-text">{text}</span>}
            {showShortcut && (
              <ResetAllFormattingShortcutBadge shortcutKeys={shortcutKeys} />
            )}
          </>
        )}
      </Button>
    );
  },
);

ResetAllFormattingButton.displayName = 'ResetAllFormattingButton';
