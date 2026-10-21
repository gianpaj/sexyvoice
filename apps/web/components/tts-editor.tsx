'use client';

import { Placeholder } from '@tiptap/extensions';
import { Slice } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ChevronDown, Crown, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type MouseEvent, use, useEffect, useRef, useState } from 'react';

import { AutoConvertGrokTags } from '@/components/grok-tts/extensions/auto-convert-grok-tags';
import {
  createWrapperBoundaryNode,
  WrapperBoundary,
} from '@/components/grok-tts/extensions/grok-wrapper-boundary';
import {
  createInstantTagNode,
  InstantTag,
} from '@/components/grok-tts/extensions/instant-tag';
import { UnsupportedGrokTagHighlight } from '@/components/grok-tts/extensions/unsupported-grok-tag-highlight';
import { isGrokWrapperSuggestionAllowed } from '@/components/grok-tts/suggestion-rules';
import { SpotlightField } from '@/components/spotlight-field';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUiEditorState } from '@/hooks/tiptap/use-ui-editor-state';
import {
  GROK_EMPTY_WRAPPING_TEXT,
  GROK_INSTANT_TAG_DEFINITIONS,
  GROK_WRAPPING_TAG_DEFINITIONS,
  type TtsEditorProvider,
  type TtsInstantTag,
  ttsTextToTipTapDoc,
  ttsTipTapDocToText,
} from '@/lib/tts-editor';
import { CHARACTERS_LIMIT_GRACE } from '@/lib/ui-constants';
import { cn } from '@/lib/utils';
import { VOXTRAL_TAG_GROUPS } from '@/lib/voxtral-tags';
import { UiState } from './tiptap/tiptap-extension/ui-state-extension';
import { SlashDropdownMenu } from './tiptap/tiptap-ui/slash-dropdown-menu/slash-dropdown-menu';
import type {
  SuggestionItem,
  SuggestionMenuProps,
} from './tiptap/tiptap-ui-utils/suggestion-menu';

import './grok-tts-editor.css';

interface InstantTagDef {
  description: string;
  label: string;
  tag: TtsInstantTag;
}

const VOXTRAL_GROUPS = VOXTRAL_TAG_GROUPS.map(({ labelKey, tags }) => ({
  labelKey,
  tags: tags.map((tag) => ({
    tag,
    label: tag.slice(1, -1),
    description: tag.slice(1, -1),
  })),
}));

const WRAPPING_TAGS = GROK_WRAPPING_TAG_DEFINITIONS.map(
  ({ closeTag, description, label, openTag }) => ({
    closeTag,
    description,
    label,
    tag: openTag,
  }),
);

type WrapperTagDef = (typeof WRAPPING_TAGS)[number];
type TagDef = InstantTagDef | WrapperTagDef;

const XAI_LANGUAGE_OPTIONS = [
  { label: 'langArabicEgypt', value: 'ar-EG' },
  { label: 'langArabicSaudiArabia', value: 'ar-SA' },
  { label: 'langArabicUnitedArabEmirates', value: 'ar-AE' },
  { label: 'langBengali', value: 'bn' },
  { label: 'langChinese', value: 'zh' },
  { label: 'langFrench', value: 'fr' },
  { label: 'langGerman', value: 'de' },
  { label: 'langHindi', value: 'hi' },
  { label: 'langIndonesian', value: 'id' },
  { label: 'langItalian', value: 'it' },
  { label: 'langJapanese', value: 'ja' },
  { label: 'langKorean', value: 'ko' },
  { label: 'langPortugueseBrazil', value: 'pt-BR' },
  { label: 'langPortuguesePortugal', value: 'pt-PT' },
  { label: 'langRussian', value: 'ru' },
  { label: 'langSpanishSpain', value: 'es-ES' },
  { label: 'langSpanishMexico', value: 'es-MX' },
  { label: 'langTurkish', value: 'tr' },
  { label: 'langVietnamese', value: 'vi' },
] as const;

interface BaseTTSEditorProps {
  ariaLabelledBy?: string;
  charactersLimit: number;
  dir?: 'ltr' | 'rtl';
  disabled?: boolean;
  enforceCharactersLimit?: boolean;
  id?: string;
  isPaidUser?: boolean;
  onChange: (text: string) => void;
  placeholder?: string;
  showCharacterCount?: boolean;
  testId?: string;
  value: string;
}

export type TTSEditorProps = BaseTTSEditorProps &
  (
    | {
        provider: 'grok';
        selectedGrokLanguage: string;
        setSelectedGrokLanguage: (text: string) => void;
      }
    | {
        provider: 'voxtral';
        selectedGrokLanguage?: never;
        setSelectedGrokLanguage?: never;
      }
  );

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
  provider: TtsEditorProvider,
): AppliedEditorContent {
  editor.commands.setContent(ttsTextToTipTapDoc(text, provider), {
    emitUpdate: false,
  });

  return {
    selection: moveEditorSelectionToEnd(editor),
    text: ttsTipTapDocToText(editor.getJSON(), provider),
  };
}

interface GrokSlashMenuConfig {
  allow?: NonNullable<SuggestionMenuProps['allow']>;
  customItems: SuggestionItem[];
  pluginKey: string;
  triggerChar: '[' | '<';
}

interface EditorContentAreaProps {
  slashMenus: GrokSlashMenuConfig[];
}

function createInstantTagSuggestionItem(
  tag: InstantTagDef,
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

/**
 * EditorContent component that renders the actual editor
 */
export function EditorContentArea({ slashMenus }: EditorContentAreaProps) {
  const { editor } = use(EditorContext)!;
  const { isDragging } = useUiEditorState(editor);

  // useScrollToHash()

  if (!editor) {
    return null;
  }

  return (
    <EditorContent
      className="editor-content mx-auto flex h-full w-full max-w-3xl flex-1 flex-col"
      editor={editor}
      role="presentation"
      style={{
        cursor: isDragging ? 'grabbing' : 'auto',
      }}
    >
      {slashMenus.map((menu) => (
        <SlashDropdownMenu
          allow={menu.allow}
          char={menu.triggerChar}
          config={{
            customItems: menu.customItems,
            enabledItems: [],
            showGroups: false,
          }}
          deleteQueryOnEscape={false}
          key={menu.pluginKey}
          pluginKey={menu.pluginKey}
        />
      ))}
    </EditorContent>
  );
}

export function TTSEditor(props: TTSEditorProps) {
  return <ProviderTTSEditor key={props.provider} {...props} />;
}

function ProviderTTSEditor({
  ariaLabelledBy,
  provider,
  disabled = false,
  dir = 'ltr',
  id,
  testId = 'generate-textarea',
  showCharacterCount = true,
  enforceCharactersLimit = true,
  isPaidUser,
  charactersLimit,
  onChange,
  placeholder,
  selectedGrokLanguage,
  setSelectedGrokLanguage,
  value,
}: TTSEditorProps) {
  const t = useTranslations('generate.grok');
  const tGenerate = useTranslations('generate');
  const tEditor = useTranslations('ttsEditor');
  const instantGroups =
    provider === 'grok'
      ? [
          {
            label: t('inlineEffectPlaceholder'),
            tags: GROK_INSTANT_TAG_DEFINITIONS,
          },
        ]
      : VOXTRAL_GROUPS.map(({ labelKey, tags }) => ({
          label: tEditor(labelKey),
          tags,
        }));
  const instantTags = instantGroups.flatMap(({ tags }) => [...tags]);
  const wrappingTags = provider === 'grok' ? WRAPPING_TAGS : [];
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [currentLength, setCurrentLength] = useState(value.length);
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
    content: ttsTextToTipTapDoc(value, provider),
    coreExtensionOptions: {
      clipboardTextSerializer: { blockSeparator: '\n' },
    },
    editable: !disabled,
    editorProps: {
      attributes: {
        'aria-label': placeholder ?? tEditor('label'),
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
      handleDOMEvents: {
        keydown: () => false,
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain');
        if (!text) return false;

        // Parse clipboard text for the active provider. HTML chips from another
        // provider must stay literal text rather than lose unsupported tags.
        const doc = view.state.schema.nodeFromJSON(
          ttsTextToTipTapDoc(text, provider),
        );
        view.dispatch(
          view.state.tr
            .replaceSelection(new Slice(doc.content, 1, 1))
            .scrollIntoView(),
        );
        return true;
      },
      handleTextInput: () => false,
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
        emptyNodeClass: 'is-empty with-slash',
        placeholder,
      }),
      InstantTag.configure({ provider }),
      WrapperBoundary,
      UnsupportedGrokTagHighlight.configure({ provider }),
      AutoConvertGrokTags.configure({ provider }),
      UiState,
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
      const fullText = ttsTipTapDocToText(nextEditor.getJSON(), provider);
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

      setCurrentLength(text.length);
      onChange(text);
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const current = ttsTipTapDocToText(editor.getJSON(), provider);
    if (current === value) {
      setCurrentLength(current.length);
      return;
    }

    // Preserve external values, including over-limit text shared with other
    // editors. The parent blocks generation until the text fits the limit.
    const applied = applyEditorContent(editor, value, provider);
    lastSelectionRef.current = applied.selection;
    contentResetSelectionRef.current = applied.selection;
    setCurrentLength(applied.text.length);

    // Reconcile normalized content once. The callback ref keeps parent renders
    // from resetting the document and caret when the input value is unchanged.
    if (applied.text !== value) {
      onChangeRef.current(applied.text);
    }
  }, [editor, value, provider]);

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  const insertInstantTag = (tag: InstantTagDef) => {
    if (!editor || disabled) {
      return;
    }

    const selection = normalizeEditorSelectionSnapshot(
      editor,
      lastSelectionRef.current,
    );
    lastSelectionRef.current = selection;
    const serialized = ttsTipTapDocToText(editor.getJSON(), provider);
    const selectedTextLength = selection.empty
      ? 0
      : ttsTipTapDocToText(
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

    const serialized = ttsTipTapDocToText(editor.getJSON(), provider);
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

      tr.insert(insertFrom + 1, editor.schema.text(GROK_EMPTY_WRAPPING_TEXT));
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
    if ('closeTag' in tag) {
      insertWrapperTag(tag);
      return;
    }

    insertInstantTag(tag);
  };

  const handleInsertTagRef = useRef(handleInsertTag);
  useEffect(() => {
    handleInsertTagRef.current = handleInsertTag;
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional "latest ref" sync — handleInsertTag is rebuilt each render on purpose so the long-lived slash-menu callbacks always invoke the current closure.
  }, [handleInsertTag]);

  const translatedGrokLanguages = [
    { label: t('langAutomatic'), value: 'auto' },
    { label: t('langEnglish'), value: 'en' },
    ...XAI_LANGUAGE_OPTIONS.map(({ value, label }) => ({
      label: t(label as Parameters<typeof t>[0]),
      value,
    })),
  ];

  const slashMenus: GrokSlashMenuConfig[] = [
    {
      customItems: instantTags.map((tag) =>
        createInstantTagSuggestionItem(tag, () =>
          handleInsertTagRef.current(tag),
        ),
      ),
      pluginKey: `${provider}InstantTagMenu`,
      triggerChar: '[',
    },
    ...(provider === 'grok'
      ? [
          {
            allow: ({ editor, range, state }) =>
              isGrokWrapperSuggestionAllowed({ editor, range, state }),
            customItems: wrappingTags.map((tag) =>
              createWrapperTagSuggestionItem(tag, () =>
                handleInsertTagRef.current(tag),
              ),
            ),
            pluginKey: `${provider}WrapperTagMenu`,
            triggerChar: '<' as const,
          } satisfies GrokSlashMenuConfig,
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
    <>
      {provider === 'grok' && (
        <div className="space-y-2 sm:w-1/3">
          <div className="font-medium text-sm">{t('languageLabel')}</div>
          <Select
            disabled={disabled}
            onValueChange={setSelectedGrokLanguage}
            value={selectedGrokLanguage}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('languageSelectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {translatedGrokLanguages.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
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
                  {provider === 'grok'
                    ? t('inlineEffectPlaceholder')
                    : tEditor('effects')}
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
                      <h4 className="mb-2 font-medium text-sm">
                        {group.label}
                      </h4>
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
                        {t('wrappingEffectPlaceholder')}
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

            {showCharacterCount && (
              <div
                className={cn(
                  'flex items-center justify-end gap-1.5 text-muted-foreground text-sm tabular-nums',
                  enforceCharactersLimit &&
                    currentLength > charactersLimit &&
                    'text-red-500',
                )}
                data-testid="generate-character-count"
              >
                {enforceCharactersLimit
                  ? `${currentLength} / ${charactersLimit}`
                  : currentLength}
                <TooltipProvider>
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <Crown
                        className={cn(
                          'h-3.5 w-3.5 cursor-default',
                          isPaidUser
                            ? 'text-muted-foreground/50'
                            : 'text-yellow-400',
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {isPaidUser
                          ? tGenerate('paidCharacterLimitTooltip')
                          : tGenerate('upgradeCharacterLimitTooltip')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
