import { forwardRef } from 'react';

// --- Tiptap UI ---
import type { UseTurnIntoDropdownConfig } from '@/components/tiptap/tiptap-ui/turn-into-dropdown';
import {
  getFilteredBlockTypeOptions,
  useTurnIntoDropdown,
} from '@/components/tiptap/tiptap-ui/turn-into-dropdown';
// --- Hooks ---
import { useTiptapEditor } from '@/hooks/tiptap/use-tiptap-editor';

// --- Tiptap UI Components ---
// import { TextButton } from "@/components/tiptap/tiptap-ui/text-button"
// import { HeadingButton } from "@/components/tiptap/tiptap-ui/heading-button"
// import { ListButton } from "@/components/tiptap/tiptap-ui/list-button"
// import { BlockquoteButton } from "@/components/tiptap/tiptap-ui/blockquote-button"
// import { CodeBlockButton } from "@/components/tiptap/tiptap-ui/code-block-button"

// --- Tiptap UI Components ---
// import { TextButton } from "@/components/tiptap/tiptap-ui/text-button"
// import { HeadingButton } from "@/components/tiptap/tiptap-ui/heading-button"
// import { ListButton } from "@/components/tiptap/tiptap-ui/list-button"
// import { BlockquoteButton } from "@/components/tiptap/tiptap-ui/blockquote-button"
// import { CodeBlockButton } from "@/components/tiptap/tiptap-ui/code-block-button"

// --- UI Primitives ---
import type { ButtonProps } from '@/components/tiptap/tiptap-ui-primitive/button';
import {
  Button,
  ButtonGroup,
} from '@/components/tiptap/tiptap-ui-primitive/button';
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

export interface TurnIntoDropdownContentProps {
  blockTypes?: string[];
  useCardLayout?: boolean;
}

export const TurnIntoDropdownContent: React.FC<
  TurnIntoDropdownContentProps
> = ({ blockTypes, useCardLayout = true }) => {
  const filteredOptions = getFilteredBlockTypeOptions(blockTypes);

  const renderButtons = () => (
    <ButtonGroup>
      {filteredOptions.map((option, index) =>
        renderBlockTypeButton(
          option,
          `${option.type}-${option.level ?? index}`,
        ),
      )}
    </ButtonGroup>
  );

  if (!useCardLayout) return renderButtons();

  return (
    <Card>
      <CardBody>
        <CardItemGroup>
          <CardGroupLabel>Turn into</CardGroupLabel>
          {renderButtons()}
        </CardItemGroup>
      </CardBody>
    </Card>
  );
};

function renderBlockTypeButton(
  option: ReturnType<typeof getFilteredBlockTypeOptions>[0],
  key: string,
) {
  switch (option.type) {
    case 'heading':
      if (!option.level) {
        return null;
      }

      return (
        <DropdownMenuItem asChild key={key}>
          Heading TO REPLACE
        </DropdownMenuItem>
      );

    default:
      return null;
  }
}

export interface TurnIntoDropdownProps
  extends Omit<ButtonProps, 'type'>,
    UseTurnIntoDropdownConfig {
  /**
   * Whether to use card layout for the dropdown content
   * @default true
   */
  useCardLayout?: boolean;
}

/**
 * Dropdown component for transforming block types in a Tiptap editor.
 * For custom dropdown implementations, use the `useTurnIntoDropdown` hook instead.
 */
export const TurnIntoDropdown = forwardRef<
  HTMLButtonElement,
  TurnIntoDropdownProps
>(
  (
    {
      editor: providedEditor,
      hideWhenUnavailable = false,
      blockTypes,
      useCardLayout = true,
      onOpenChange,
      children,
      ...buttonProps
    },
    ref,
  ) => {
    const { editor } = useTiptapEditor(providedEditor);
    const {
      isVisible,
      canToggle,
      isOpen,
      activeBlockType,
      handleOpenChange,
      label,
      Icon,
    } = useTurnIntoDropdown({
      editor,
      hideWhenUnavailable,
      blockTypes,
      onOpenChange,
    });

    if (!isVisible) {
      return null;
    }

    return (
      <DropdownMenu onOpenChange={handleOpenChange} open={isOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={label}
            data-disabled={!canToggle}
            data-style="ghost"
            disabled={!canToggle}
            role="button"
            tabIndex={-1}
            tooltip="Turn into"
            type="button"
            {...buttonProps}
            ref={ref}
          >
            {children ?? (
              <>
                <span className="tiptap-button-text">
                  {activeBlockType?.label || 'Text'}
                </span>
                <Icon className="tiptap-button-dropdown-small" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start">
          <TurnIntoDropdownContent
            blockTypes={blockTypes}
            useCardLayout={useCardLayout}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

TurnIntoDropdown.displayName = 'TurnIntoDropdown';
