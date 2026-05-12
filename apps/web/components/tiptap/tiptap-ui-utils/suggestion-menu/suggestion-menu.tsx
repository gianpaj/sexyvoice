import { flip, offset, shift, size } from '@floating-ui/react';
import { PluginKey } from '@tiptap/pm/state';
import {
  exitSuggestion,
  Suggestion,
  type SuggestionKeyDownProps,
  SuggestionPluginKey,
  type SuggestionProps,
} from '@tiptap/suggestion';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import type {
  SuggestionItem,
  SuggestionMenuProps,
} from '@/components/tiptap/tiptap-ui-utils/suggestion-menu/suggestion-menu-types';
import { calculateStartPosition } from '@/components/tiptap/tiptap-ui-utils/suggestion-menu/suggestion-menu-utils';
import { useFloatingElement } from '@/hooks/tiptap/use-floating-element';
import { useMenuNavigation } from '@/hooks/tiptap/use-menu-navigation';
import { useTiptapEditor } from '@/hooks/tiptap/use-tiptap-editor';

function shouldCloseSuggestionForQuery(
  char: string | undefined,
  query: string,
): boolean {
  if (!query) {
    return false;
  }

  if (char === '[') {
    return query.includes(']');
  }

  if (char === '<') {
    return query.includes('>');
  }

  return false;
}

interface SuggestionMenuState {
  command: ((item: SuggestionItem) => void) | null;
  decorationNode: HTMLElement | null;
  items: SuggestionItem[];
  query: string;
  show: boolean;
}

type SuggestionMenuAction =
  | {
      type: 'update';
      payload: {
        command: (item: SuggestionItem) => void;
        decorationNode: HTMLElement | null;
        items: SuggestionItem[];
        query: string;
        show?: boolean;
      };
    }
  | { type: 'set-open'; payload: boolean }
  | { type: 'reset' };

const initialSuggestionMenuState: SuggestionMenuState = {
  command: null,
  decorationNode: null,
  items: [],
  query: '',
  show: false,
};

function suggestionMenuReducer(
  state: SuggestionMenuState,
  action: SuggestionMenuAction,
): SuggestionMenuState {
  switch (action.type) {
    case 'update':
      return {
        ...state,
        ...action.payload,
      };
    case 'set-open':
      return {
        ...state,
        show: action.payload,
      };
    case 'reset':
      return initialSuggestionMenuState;
    default:
      return state;
  }
}

/**
 * A component that renders a suggestion menu for Tiptap editors.
 * Displays a floating menu when a trigger character is typed.
 */
export const SuggestionMenu = ({
  editor: providedEditor,
  floatingOptions,
  selector = 'tiptap-suggestion-menu',
  children,
  maxHeight = 384,
  pluginKey = SuggestionPluginKey,
  ...internalSuggestionProps
}: SuggestionMenuProps) => {
  const { editor } = useTiptapEditor(providedEditor);
  const [state, dispatch] = useReducer(
    suggestionMenuReducer,
    initialSuggestionMenuState,
  );
  const {
    show,
    decorationNode: internalDecorationNode,
    command: internalCommand,
    items: internalItems,
    query: internalQuery,
  } = state;

  // If later we want the floating stick to the position while browser is scrolling,
  // we can uncomment this part and pass the getBoundingClientRect prop to FloatingElement instead of referenceElement.
  // const [internalClientRect, setInternalClientRect] = useState<DOMRect | null>(
  //   null
  // )

  const { ref, style, getFloatingProps, isMounted } = useFloatingElement(
    show,
    internalDecorationNode,
    1000,
    {
      placement: 'bottom-start',
      middleware: [
        offset(10),
        flip({
          mainAxis: true,
          crossAxis: false,
        }),
        shift(),
        size({
          apply({ availableHeight, elements }) {
            if (elements.floating) {
              const maxHeightValue = maxHeight
                ? Math.min(maxHeight, availableHeight)
                : availableHeight;

              elements.floating.style.setProperty(
                '--suggestion-menu-max-height',
                `${maxHeightValue}px`,
              );
            }
          },
        }),
      ],
      onOpenChange(open) {
        if (!open) {
          dispatch({ type: 'set-open', payload: false });
        }
      },
      ...floatingOptions,
    },
  );

  const internalSuggestionPropsRef = useRef(internalSuggestionProps);
  const normalizedPluginKey = useMemo(
    () =>
      pluginKey instanceof PluginKey ? pluginKey : new PluginKey(pluginKey),
    [pluginKey],
  );

  useEffect(() => {
    internalSuggestionPropsRef.current = internalSuggestionProps;
  });

  const resetMenuState = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  const closePopup = useCallback(() => {
    if (editor && !editor.isDestroyed) {
      const triggerChar = internalSuggestionPropsRef.current.char;
      const { selection } = editor.state;
      const previousNode = selection.$head?.nodeBefore;
      const cursorPosition = selection.$from.pos;

      if (triggerChar) {
        const startPosition = previousNode
          ? calculateStartPosition(cursorPosition, previousNode, triggerChar)
          : selection.$from.start();

        if (startPosition < cursorPosition) {
          editor.view.dispatch(
            editor.state.tr.deleteRange(startPosition, cursorPosition),
          );
        }
      }

      exitSuggestion(editor.view, normalizedPluginKey);
      return;
    }

    resetMenuState();
  }, [editor, normalizedPluginKey, resetMenuState]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    const existingPlugin = editor.state.plugins.find(
      (plugin) => plugin.spec.key === pluginKey,
    );
    if (existingPlugin) {
      editor.unregisterPlugin(pluginKey);
    }

    const suggestion = Suggestion({
      pluginKey: normalizedPluginKey,
      editor,

      command({ editor, range, props }) {
        if (!range) {
          return;
        }

        const { view, state } = editor;
        const { selection } = state;

        const cursorPosition = selection.$from.pos;
        const previousNode = selection.$head?.nodeBefore;

        const startPosition = previousNode
          ? calculateStartPosition(
              cursorPosition,
              previousNode,
              internalSuggestionPropsRef.current.char,
            )
          : selection.$from.start();

        const transaction = state.tr.deleteRange(startPosition, cursorPosition);
        view.dispatch(transaction);

        const nodeAfter = view.state.selection.$to.nodeAfter;
        const overrideSpace = nodeAfter?.text?.startsWith(' ');
        const rangeToUse = { ...range };

        if (overrideSpace) {
          rangeToUse.to += 1;
        }

        props.onSelect({ editor, range: rangeToUse, context: props.context });
      },

      render: () => {
        return {
          onStart: (props: SuggestionProps<SuggestionItem>) => {
            dispatch({
              type: 'update',
              payload: {
                decorationNode: (props.decorationNode as HTMLElement) ?? null,
                command: props.command,
                items: props.items,
                query: props.query,
                show: true,
              },
            });
          },

          onUpdate: (props: SuggestionProps<SuggestionItem>) => {
            if (
              shouldCloseSuggestionForQuery(
                internalSuggestionPropsRef.current.char,
                props.query,
              )
            ) {
              exitSuggestion(editor.view, normalizedPluginKey);
              return;
            }

            dispatch({
              type: 'update',
              payload: {
                decorationNode: (props.decorationNode as HTMLElement) ?? null,
                command: props.command,
                items: props.items,
                query: props.query,
              },
            });
          },

          onKeyDown: (props: SuggestionKeyDownProps) => {
            if (props.event.key === 'Escape') {
              closePopup();
              return true;
            }
            return false;
          },

          onExit: () => {
            resetMenuState();
          },
        };
      },
      ...internalSuggestionPropsRef.current,
    });

    editor.registerPlugin(suggestion);

    return () => {
      if (!editor.isDestroyed) {
        editor.unregisterPlugin(normalizedPluginKey);
      }
    };
  }, [editor, pluginKey, normalizedPluginKey, closePopup, resetMenuState]);

  const onSelect = useCallback(
    (item: SuggestionItem) => {
      closePopup();

      if (internalCommand) {
        internalCommand(item);
      }
    },
    [closePopup, internalCommand],
  );

  const { selectedIndex } = useMenuNavigation({
    editor,
    query: internalQuery,
    items: internalItems,
    onSelect,
    onClose: closePopup,
  });

  if (!(isMounted && show && editor)) {
    return null;
  }

  return (
    <div
      ref={ref}
      style={style}
      {...getFloatingProps()}
      aria-label="Suggestions"
      className="tiptap-suggestion-menu"
      data-selector={selector}
      onPointerDown={(e) => e.preventDefault()}
      role="listbox"
    >
      {children({
        items: internalItems,
        selectedIndex,
        onSelect,
      })}
    </div>
  );
};
