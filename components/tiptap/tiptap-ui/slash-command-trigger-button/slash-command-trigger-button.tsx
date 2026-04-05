import { forwardRef, useCallback } from 'react';

// --- Tiptap UI ---
import type { UseSlashCommandTriggerConfig } from '@/components/tiptap/tiptap-ui/slash-command-trigger-button';
import {
  SLASH_COMMAND_TRIGGER_SHORTCUT_KEY,
  useSlashCommandTrigger,
} from '@/components/tiptap/tiptap-ui/slash-command-trigger-button';
import { Badge } from '@/components/tiptap/tiptap-ui-primitive/badge';
// --- UI Primitives ---
import type { ButtonProps } from '@/components/tiptap/tiptap-ui-primitive/button';
import { Button } from '@/components/tiptap/tiptap-ui-primitive/button';
// --- Hooks ---
import { useTiptapEditor } from '@/hooks/tiptap/use-tiptap-editor';
// --- Lib ---
import { parseShortcutKeys } from '@/lib/tiptap-utils';

export interface SlashCommandTriggerButtonProps
  extends Omit<ButtonProps, 'type'>,
    UseSlashCommandTriggerConfig {
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

export function SlashCommandShortcutBadge({
  shortcutKeys = SLASH_COMMAND_TRIGGER_SHORTCUT_KEY,
}: {
  shortcutKeys?: string;
}) {
  return <Badge>{parseShortcutKeys({ shortcutKeys })}</Badge>;
}

/**
 * Button component for inserting slash commands in a Tiptap editor.
 *
 * For custom button implementations, use the `useSlashCommand` hook instead.
 */
export const SlashCommandTriggerButton = forwardRef<
  HTMLButtonElement,
  SlashCommandTriggerButtonProps
>(
  (
    {
      editor: providedEditor,
      node,
      nodePos,
      text,
      trigger = '/',
      hideWhenUnavailable = false,
      onTriggered,
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
      canInsert,
      handleSlashCommand,
      label,
      shortcutKeys,
      Icon,
    } = useSlashCommandTrigger({
      editor,
      node,
      nodePos,
      trigger,
      hideWhenUnavailable,
      onTriggered,
    });

    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        handleSlashCommand();
      },
      [handleSlashCommand, onClick],
    );

    if (!isVisible) {
      return null;
    }

    return (
      <Button
        aria-label={label}
        data-disabled={!canInsert}
        data-style="ghost"
        disabled={!canInsert}
        onClick={handleClick}
        role="button"
        tabIndex={-1}
        tooltip={label}
        type="button"
        {...buttonProps}
        ref={ref}
      >
        {children ?? (
          <>
            <Icon className="tiptap-button-icon" />
            {text && <span className="tiptap-button-text">{text}</span>}
            {showShortcut && (
              <SlashCommandShortcutBadge shortcutKeys={shortcutKeys} />
            )}
          </>
        )}
      </Button>
    );
  },
);

SlashCommandTriggerButton.displayName = 'SlashCommandTriggerButton';
