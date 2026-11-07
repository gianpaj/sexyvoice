'use client';

import { Placeholder } from '@tiptap/extensions';
import { Slice } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type MouseEvent,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from 'react';

import { SpotlightField } from '@/components/spotlight-field';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CHARACTERS_LIMIT_GRACE } from '@/lib/ui-constants';
import { SlashDropdownMenu } from '../tiptap/tiptap-ui/slash-dropdown-menu/slash-dropdown-menu';
import type {
  SuggestionItem,
  SuggestionMenuProps,
} from '../tiptap/tiptap-ui-utils/suggestion-menu';
import { AutoConvertTags } from './auto-convert-tags';
import { EMPTY_WRAPPER_TEXT, TAG_CATALOGS, type TagProvider } from './catalog';
import { createInstantTagNode, InstantTag } from './instant-tag';
import { isWrapperSuggestionAllowed } from './suggestion-rules';
import {
  createWrapperBoundaryNode,
  docToTaggedText,
  taggedTextToDoc,
} from './text';
import { UnknownTagHighlight } from './unknown-tag-highlight';
import { WrapperBoundary } from './wrapper-boundary';

import './tag-editor.css';

interface TagDef {
  /** Set for wrapper tags. */
  closeTag?: string;
  description: string;
  label: string;
  tag: string;
}

type WrapperTagDef = TagDef & { closeTag: string };

function tagDefinition(tag: string, closeTag?: string): TagDef {
  const name = tag.slice(1, -1);
  return { closeTag, description: name, label: name, tag };
}

export interface TagEditorProps {
  ariaLabelledBy?: string;
  charactersLimit: number;
  dir?: 'ltr' | 'rtl';
  disabled?: boolean;
  enforceCharactersLimit?: boolean;
  id?: string;
  onChange: (text: string) => void;
  placeholder?: string;
  provider: TagProvider;
  testId?: string;
  /** Rendered at the end of the toolbar row, such as the character count. */
  toolbarEnd?: ReactNode;
  value: string;
}

interface EditorSelectionSnapshot {
  empty: boolean;
  from: number;
  to: number;
}

type EditorInstance = NonNullable<ReturnType<typeof useEditor>>;

function getDomSelectionSnapshot(
  editor: EditorInstance,
): EditorSelectionSnapshot | null {
  const selection = window.getSelection();

  if (!(selection && selection.rangeCount > 0)) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const editorDom = editor.view.dom;
  const startNode = range.startContainer;
  const endNode = range.endContainer;

  if (!(editorDom.contains(startNode) && editorDom.contains(endNode))) {
    return null;
  }

  try {
    const anchor = editor.view.posAtDOM(startNode, range.startOffset);
    const head = editor.view.posAtDOM(endNode, range.endOffset);

    return {
      empty: anchor === head,
      from: Math.min(anchor, head),
      to: Math.max(anchor, head),
    };
  } catch {
    return null;
  }
}

function clampEditorPosition(editor: EditorInstance, position: number): number {
  const maxPosition = Math.max(1, editor.state.doc.content.size - 1);

  return Math.min(Math.max(position, 1), maxPosition);
}

function normalizeEditorSelectionSnapshot(
  editor: EditorInstance,
  selection: EditorSelectionSnapshot,
): EditorSelectionSnapshot {
  const from = clampEditorPosition(editor, selection.from);
  const to = clampEditorPosition(editor, selection.to);
  const normalizedFrom = Math.min(from, to);
  const normalizedTo = Math.max(from, to);

  return {
    empty: normalizedFrom === normalizedTo,
    from: normalizedFrom,
    to: normalizedTo,
  };
}

function getEditorSelectionSnapshot(
  editor: EditorInstance,
): EditorSelectionSnapshot {
  const { empty, from, to } = editor.state.selection;

  return { empty, from, to };
}

function getEditorEndSelectionSnapshot(
  editor: EditorInstance,
): EditorSelectionSnapshot {
  const position = clampEditorPosition(
    editor,
    editor.state.doc.content.size - 1,
  );

  return { empty: true, from: position, to: position };
}

function moveEditorSelectionToEnd(
  editor: EditorInstance,
): EditorSelectionSnapshot {
  const selection = getEditorEndSelectionSnapshot(editor);
  editor.commands.setTextSelection(selection.from);

  return selection;
}

interface AppliedEditorContent {
  selection: EditorSelectionSnapshot;
  text: string;
}

/**
 * Replaces content without emitting an update. Read the applied text back because
 * the schema and tag conversion can normalize it before the parent receives it.
 */
function applyEditorContent(
  editor: EditorInstance,
  text: string,
  provider: TagProvider,
): AppliedEditorContent {
  editor.commands.setContent(taggedTextToDoc(text, provider), {
    emitUpdate: false,
  });

  return {
    selection: moveEditorSelectionToEnd(editor),
    text: docToTaggedText(editor.getJSON(), provider),
  };
}

interface SlashMenuConfig {
  allow?: NonNullable<SuggestionMenuProps['allow']>;
  items: SuggestionItem[];
  pluginKey: string;
  triggerChar: '[' | '<';
}

interface EditorContentAreaProps {
  slashMenus: SlashMenuConfig[];
}

function createInstantTagSuggestionItem(
  tag: TagDef,
  onSelect: () => void,
): SuggestionItem {
  return {
    keywords: [tag.label, tag.tag, tag.description],
    onSelect,
    subtext: tag.description,
    title: tag.label,
  };
}

function createWrapperTagSuggestionItem(
  tag: WrapperTagDef,
  onSelect: () => void,
): SuggestionItem {
  return {
    keywords: [tag.label, tag.tag, tag.closeTag, tag.description],
    onSelect,
    subtext: tag.description,
    title: tag.label,
  };
}

function EditorContentArea({ slashMenus }: EditorContentAreaProps) {
  const t = useTranslations('ttsEditor');
  const { editor } = use(EditorContext)!;

  if (!editor) {
    return null;
  }

  return (
    <EditorContent
      className="editor-content mx-auto flex h-full w-full max-w-3xl flex-1 flex-col"
      editor={editor}
      role="presentation"
    >
      {slashMenus.map((menu) => (
        <SlashDropdownMenu
          allow={menu.allow}
          char={menu.triggerChar}
          decorationContent={t('filterTags')}
          deleteQueryOnEscape={false}
          items={menu.items}
          key={menu.pluginKey}
          label={t('tagSuggestions')}
          pluginKey={menu.pluginKey}
        />
      ))}
    </EditorContent>
  );
}

/**
 * Speech text with inline tags as chips, for providers with a tag catalog.
 * Extensions read the provider once, so a provider change remounts it.
 */
export function TagEditor(props: TagEditorProps) {
  return <ProviderTagEditor key={props.provider} {...props} />;
}

function ProviderTagEditor({
  ariaLabelledBy,
  provider,
  disabled = false,
  dir = 'ltr',
  id,
  testId = 'generate-textarea',
  enforceCharactersLimit = true,
  charactersLimit,
  onChange,
  placeholder,
  toolbarEnd,
  value,
}: TagEditorProps) {
  const t = useTranslations();
  const catalog = TAG_CATALOGS[provider];
  const instantGroups = catalog.groups.map(({ labelKey, tags }) => ({
    label: t(labelKey),
    tags: tags.map((tag) => tagDefinition(tag)),
  }));
  const instantTags = instantGroups.flatMap(({ tags }) => tags);
  const wrappingTags = catalog.wrappers.map(
    ([openTag, closeTag]) => tagDefinition(openTag, closeTag) as WrapperTagDef,
  );
  const [effectsOpen, setEffectsOpen] = useState(false);
  const charactersLimitRef = useRef(charactersLimit);
  const enforceCharactersLimitRef = useRef(enforceCharactersLimit);
  const onChangeRef = useRef(onChange);
  const contentResetSelectionRef = useRef<EditorSelectionSnapshot | null>(null);
  const lastSelectionRef = useRef<EditorSelectionSnapshot>({
    empty: true,
    from: 1,
    to: 1,
  });

  useEffect(() => {
    charactersLimitRef.current = charactersLimit;
    enforceCharactersLimitRef.current = enforceCharactersLimit;
    onChangeRef.current = onChange;
  }, [charactersLimit, enforceCharactersLimit, onChange]);

  const editor = useEditor({
    content: taggedTextToDoc(value, provider),
    coreExtensionOptions: {
      clipboardTextSerializer: { blockSeparator: '\n' },
    },
    editable: !disabled,
    editorProps: {
      attributes: {
        'aria-label': placeholder ?? t('ttsEditor.label'),
        ...(ariaLabelledBy ? { 'aria-labelledby': ariaLabelledBy } : {}),
        'aria-disabled': String(disabled),
        dir,
        ...(id ? { id } : {}),
        'aria-multiline': 'true',
        autoCorrect: 'false',
        class:
          'min-h-[8rem] w-full bg-transparent text-sm leading-6 outline-none whitespace-pre-wrap break-words',
        'data-testid': testId,
        role: 'textbox',
        spellCheck: 'false',
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData
          ?.getData('text/plain')
          .replace(/\r\n?/g, '\n');
        if (!text) return false;

        // Parse clipboard text for the active provider. HTML chips from another
        // provider must stay literal text rather than lose unsupported tags.
        const doc = view.state.schema.nodeFromJSON(
          taggedTextToDoc(text, provider),
        );
        view.dispatch(
          view.state.tr
            .replaceSelection(new Slice(doc.content, 1, 1))
            .scrollIntoView(),
        );
        return true;
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        listItem: false,
        orderedList: false,
        strike: false,
      }),
      Placeholder.configure({
        emptyNodeClass: 'is-empty',
        placeholder,
      }),
      InstantTag.configure({ provider }),
      WrapperBoundary,
      UnknownTagHighlight.configure({ provider }),
      AutoConvertTags.configure({ provider }),
    ],
    immediatelyRender: false,
    onCreate: ({ editor: nextEditor }) => {
      lastSelectionRef.current = getEditorSelectionSnapshot(nextEditor);
    },
    onSelectionUpdate: ({ editor: nextEditor }) => {
      const selection = getEditorSelectionSnapshot(nextEditor);
      const resetSelection = contentResetSelectionRef.current;
      lastSelectionRef.current = selection;

      if (
        resetSelection &&
        (!selection.empty ||
          selection.from !== resetSelection.from ||
          selection.to !== resetSelection.to)
      ) {
        contentResetSelectionRef.current = null;
      }
    },
    onUpdate: ({ editor: nextEditor }) => {
      const fullText = docToTaggedText(nextEditor.getJSON(), provider);
      // Clamps user input only, mirroring `maxLength` on the other limited
      // textareas. Text arriving from the parent is applied as given — see the
      // content synchronization effect below.
      const clampedText = enforceCharactersLimitRef.current
        ? fullText.slice(0, charactersLimitRef.current + CHARACTERS_LIMIT_GRACE)
        : fullText;
      let text = fullText;

      if (clampedText !== fullText) {
        const applied = applyEditorContent(nextEditor, clampedText, provider);
        lastSelectionRef.current = applied.selection;
        contentResetSelectionRef.current = applied.selection;
        text = applied.text;
      }

      onChange(text);
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const current = docToTaggedText(editor.getJSON(), provider);
    if (current === value) {
      return;
    }

    // Preserve external values, including over-limit text shared with other
    // editors. The parent blocks generation until the text fits the limit.
    const applied = applyEditorContent(editor, value, provider);
    lastSelectionRef.current = applied.selection;
    contentResetSelectionRef.current = applied.selection;

    // Reconcile normalized content once. The callback ref keeps parent renders
    // from resetting the document and caret when the input value is unchanged.
    if (applied.text !== value) {
      onChangeRef.current(applied.text);
    }
  }, [editor, value, provider]);

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  const insertInstantTag = (tag: TagDef) => {
    if (!editor || disabled) {
      return;
    }

    const selection = normalizeEditorSelectionSnapshot(
      editor,
      lastSelectionRef.current,
    );
    lastSelectionRef.current = selection;
    const serialized = docToTaggedText(editor.getJSON(), provider);
    const selectedTextLength = selection.empty
      ? 0
      : docToTaggedText(
          editor.state.doc.cut(selection.from, selection.to).toJSON(),
          provider,
        ).length;
    const nextLength = serialized.length - selectedTextLength + tag.tag.length;

    if (enforceCharactersLimit && nextLength > charactersLimit) {
      return;
    }

    editor
      .chain()
      .focus()
      .setTextSelection({ from: selection.from, to: selection.to })
      .insertContent(createInstantTagNode(tag.tag))
      .run();
    setEffectsOpen(false);
  };

  const insertWrapperTag = (tag: WrapperTagDef) => {
    if (!editor || disabled) {
      return;
    }

    const selection = normalizeEditorSelectionSnapshot(
      editor,
      lastSelectionRef.current,
    );
    lastSelectionRef.current = selection;
    const wrapperLength = tag.tag.length + tag.closeTag.length;

    const serialized = docToTaggedText(editor.getJSON(), provider);
    const nextLength = serialized.length + wrapperLength;

    if (enforceCharactersLimit && nextLength > charactersLimit) {
      return;
    }

    const openBoundary = createWrapperBoundaryNode(
      'open',
      tag.tag,
      tag.closeTag,
    );
    const closeBoundary = createWrapperBoundaryNode(
      'close',
      tag.tag,
      tag.closeTag,
    );

    editor
      .chain()
      .focus()
      .setTextSelection({ from: selection.from, to: selection.to })
      .run();

    if (selection.empty) {
      const insertFrom = selection.from;
      const tr = editor.state.tr.replaceSelectionWith(
        editor.schema.nodeFromJSON(openBoundary),
      );

      tr.insert(insertFrom + 1, editor.schema.text(EMPTY_WRAPPER_TEXT));
      tr.insert(insertFrom + 2, editor.schema.nodeFromJSON(closeBoundary));

      const cursorPos = insertFrom + 2;
      tr.setSelection(TextSelection.create(tr.doc, cursorPos));
      editor.view.dispatch(tr);
      editor.chain().focus().setTextSelection(cursorPos).run();
    } else {
      const selectedSlice = editor.state.doc.slice(
        selection.from,
        selection.to,
      );
      const tr = editor.state.tr.replaceSelectionWith(
        editor.schema.nodeFromJSON(openBoundary),
      );

      tr.insert(selection.from + 1, selectedSlice.content);
      const closeBoundaryPos = selection.from + 1 + selectedSlice.content.size;
      tr.insert(closeBoundaryPos, editor.schema.nodeFromJSON(closeBoundary));

      const cursorPos = closeBoundaryPos + 1;
      tr.setSelection(TextSelection.create(tr.doc, cursorPos));
      editor.view.dispatch(tr);
      editor.chain().focus().setTextSelection(cursorPos).run();
    }

    setEffectsOpen(false);
  };

  const preserveSelection = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const preserveEditorSelection = (event: MouseEvent<HTMLButtonElement>) => {
    if (editor) {
      const snapshot = getDomSelectionSnapshot(editor);
      const resetSelection = contentResetSelectionRef.current;
      const isContentResetSnapshot =
        snapshot && resetSelection && snapshot.empty;

      if (snapshot && !isContentResetSnapshot) {
        lastSelectionRef.current = snapshot;
      } else if (!isContentResetSnapshot) {
        lastSelectionRef.current = getEditorSelectionSnapshot(editor);
      }
      contentResetSelectionRef.current = null;
    }

    event.preventDefault();
  };

  const handleInsertTag = (tag: TagDef) => {
    if (tag.closeTag) {
      insertWrapperTag(tag as WrapperTagDef);
      return;
    }

    insertInstantTag(tag);
  };

  const handleInsertTagRef = useRef(handleInsertTag);
  useEffect(() => {
    handleInsertTagRef.current = handleInsertTag;
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional "latest ref" sync — handleInsertTag is rebuilt each render on purpose so the long-lived slash-menu callbacks always invoke the current closure.
  }, [handleInsertTag]);

  const slashMenus: SlashMenuConfig[] = [
    {
      items: instantTags.map((tag) =>
        createInstantTagSuggestionItem(tag, () =>
          handleInsertTagRef.current(tag),
        ),
      ),
      pluginKey: `${provider}InstantTagMenu`,
      triggerChar: '[',
    },
    ...(wrappingTags.length > 0
      ? [
          {
            allow: ({ editor, range, state }) =>
              isWrapperSuggestionAllowed({ editor, provider, range, state }),
            items: wrappingTags.map((tag) =>
              createWrapperTagSuggestionItem(tag, () =>
                handleInsertTagRef.current(tag),
              ),
            ),
            pluginKey: `${provider}WrapperTagMenu`,
            triggerChar: '<' as const,
          } satisfies SlashMenuConfig,
        ]
      : []),
  ];

  if (!editor) {
    return (
      <div className="w-full">
        <div className="min-h-[8rem] rounded-md border border-input bg-background p-3" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="space-y-2">
        <SpotlightField>
          <div className="editor-wrapper relative min-h-[8rem] rounded-md bg-transparent p-3 text-sm ring-offset-background">
            <EditorContext.Provider value={{ editor }}>
              <EditorContentArea slashMenus={slashMenus} />
            </EditorContext.Provider>
          </div>
        </SpotlightField>

        <div className="mt-2 flex items-center gap-2">
          <Popover onOpenChange={setEffectsOpen} open={effectsOpen}>
            <PopoverTrigger asChild>
              <Button
                disabled={disabled}
                onMouseDown={preserveEditorSelection}
                size="sm"
                variant="outline"
              >
                <Sparkles className="mr-1.5 size-3.5" />
                {t(catalog.effectsLabelKey)}
                <ChevronDown className="ml-1 size-3" />
              </Button>
            </PopoverTrigger>

            <PopoverContent
              align="start"
              className="bg-background p-0 sm:w-100"
            >
              <div className="max-h-[400px] overflow-y-auto">
                {instantGroups.map((group) => (
                  <div
                    className="border-border border-b p-3 last:border-b-0"
                    key={group.label}
                  >
                    <h4 className="mb-2 font-medium text-sm">{group.label}</h4>
                    <div className="grid grid-cols-2 gap-1">
                      {group.tags.map((tag) => (
                        <button
                          className="min-h-10 min-w-0 break-all rounded-sm px-2 py-1.5 text-left font-mono text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                          disabled={disabled}
                          key={tag.tag}
                          onClick={() => handleInsertTag(tag)}
                          onMouseDown={preserveSelection}
                          type="button"
                        >
                          {tag.tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {wrappingTags.length > 0 && (
                  <div className="p-3">
                    <h4 className="mb-2 font-medium text-sm">
                      {t('generate.grok.wrappingEffectPlaceholder')}
                    </h4>
                    <div className="grid grid-cols-2 gap-1">
                      {wrappingTags.map((tag) => (
                        <button
                          className="w-full min-w-0 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                          key={tag.tag}
                          onClick={() => handleInsertTag(tag)}
                          onMouseDown={preserveSelection}
                          type="button"
                        >
                          <div className="min-w-0 font-medium">
                            <span className="inline-block whitespace-nowrap">
                              {tag.tag}
                              ...
                            </span>
                            <wbr />
                            <span className="inline-block whitespace-nowrap">
                              {tag.closeTag}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex-1" />

          {toolbarEnd}
        </div>
      </div>
    </div>
  );
}
