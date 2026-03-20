'use client';

import { ChevronDown, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { cn } from '@/lib/utils';

const INSTANT_TAGS = [
  { tag: '[pause]', label: 'pause', description: 'Brief pause' },
  { tag: '[long-pause]', label: 'long-pause', description: 'Extended pause' },
  { tag: '[laugh]', label: 'laugh', description: 'Laughter' },
  { tag: '[chuckle]', label: 'chuckle', description: 'Soft laughter' },
  { tag: '[giggle]', label: 'giggle', description: 'Light laughter' },
  { tag: '[cry]', label: 'cry', description: 'Crying sound' },
  { tag: '[sigh]', label: 'sigh', description: 'Sighing' },
  { tag: '[breath]', label: 'breath', description: 'Breath sound' },
  { tag: '[inhale]', label: 'inhale', description: 'Inhalation' },
  { tag: '[exhale]', label: 'exhale', description: 'Exhalation' },
  { tag: '[tsk]', label: 'tsk', description: 'Disapproving tsk' },
  {
    tag: '[tongue-click]',
    label: 'tongue-click',
    description: 'Tongue click',
  },
  { tag: '[lip-smack]', label: 'lip-smack', description: 'Lip smacking' },
  {
    tag: '[hum-tune]',
    label: 'hum-tune',
    description: 'Humming vocalization',
  },
] as const;

const WRAPPER_TAGS = [
  {
    tag: '<soft>',
    closeTag: '</soft>',
    label: 'soft',
    description: 'Reduced volume',
  },
  {
    tag: '<whisper>',
    closeTag: '</whisper>',
    label: 'whisper',
    description: 'Whispered delivery',
  },
  {
    tag: '<loud>',
    closeTag: '</loud>',
    label: 'loud',
    description: 'Increased volume',
  },
  {
    tag: '<emphasis>',
    closeTag: '</emphasis>',
    label: 'emphasis',
    description: 'Emphasized word/phrase',
  },
  {
    tag: '<slow>',
    closeTag: '</slow>',
    label: 'slow',
    description: 'Slower delivery',
  },
  {
    tag: '<fast>',
    closeTag: '</fast>',
    label: 'fast',
    description: 'Faster delivery',
  },
  {
    tag: '<higher-pitch>',
    closeTag: '</higher-pitch>',
    label: 'higher-pitch',
    description: 'Raised pitch',
  },
  {
    tag: '<lower-pitch>',
    closeTag: '</lower-pitch>',
    label: 'lower-pitch',
    description: 'Lowered pitch',
  },
  {
    tag: '<build-intensity>',
    closeTag: '</build-intensity>',
    label: 'build-intensity',
    description: 'Crescendo effect',
  },
  {
    tag: '<decrease-intensity>',
    closeTag: '</decrease-intensity>',
    label: 'decrease-intensity',
    description: 'Diminuendo',
  },
  {
    tag: '<laugh-speak>',
    closeTag: '</laugh-speak>',
    label: 'laugh-speak',
    description: 'Speaking while laughing',
  },
  {
    tag: '<sing-song>',
    closeTag: '</sing-song>',
    label: 'sing-song',
    description: 'Melodic delivery',
  },
] as const;

interface TagChip {
  id: string;
  label: string;
  tag: string;
  type: 'instant' | 'open' | 'close';
}

interface EditorContent {
  type: 'text' | 'chip';
  value: string | TagChip;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function TagChipComponent({
  chip,
  isSelected,
  onClick,
  onRemove,
}: {
  chip: TagChip;
  isSelected: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  const isInstant = chip.type === 'instant';
  let displayLabel: string;
  if (isInstant) {
    displayLabel = `[${chip.label}]`;
  } else if (chip.type === 'close') {
    displayLabel = `</${chip.label}>`;
  } else {
    displayLabel = `<${chip.label}>`;
  }

  return (
    <button
      className={cn(
        'mx-0.5 inline-flex cursor-pointer select-none items-center gap-1 rounded border-none bg-transparent px-1.5 py-0.5 font-medium text-xs',
        isInstant
          ? 'border border-border bg-muted text-muted-foreground'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
        isSelected && 'ring-2 ring-ring ring-offset-1',
      )}
      onClick={onClick}
      type="button"
    >
      {displayLabel}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: nested inside button, can't use button */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: nested inside button */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: parent button handles keyboard */}
      <span
        className="-mr-0.5 rounded-sm p-0.5 hover:bg-foreground/10"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="size-3" />
      </span>
    </button>
  );
}

type InstantTagDef = (typeof INSTANT_TAGS)[number];
type WrapperTagDef = (typeof WRAPPER_TAGS)[number];
type TagDef = InstantTagDef | WrapperTagDef;

interface GrokTTSEditorProps {
  codec?: string;
  maxLength: number;
  onChange: (text: string) => void;
  onCodecChange?: (codec: string) => void;
  placeholder?: string;
  value: string;
}

export function GrokTTSEditor({
  codec = 'mp3',
  maxLength,
  onChange,
  onCodecChange,
  placeholder,
  value,
}: GrokTTSEditorProps) {
  const [content, setContent] = useState<EditorContent[]>(() =>
    value ? [{ type: 'text', value }] : [],
  );
  const [inputValue, setInputValue] = useState('');
  const [cursorIndex, setCursorIndex] = useState(-1);
  const [selectedChipIndex, setSelectedChipIndex] = useState<number | null>(
    null,
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState('');
  const [suggestionType, setSuggestionType] = useState<'instant' | 'wrapper'>(
    'instant',
  );
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = useMemo(() => {
    const filter = suggestionFilter.toLowerCase();
    if (suggestionType === 'instant') {
      return INSTANT_TAGS.filter((t) => t.label.toLowerCase().includes(filter));
    }
    return WRAPPER_TAGS.filter((t) => t.label.toLowerCase().includes(filter));
  }, [suggestionFilter, suggestionType]);

  // Sync content -> parent text
  const getOutputString = useCallback(
    (contentItems: EditorContent[], uncommitted: string) => {
      let output = '';
      for (const item of contentItems) {
        if (item.type === 'text') {
          output += item.value;
        } else {
          const chip = item.value as TagChip;
          output += chip.tag;
        }
      }
      output += uncommitted;
      return output;
    },
    [],
  );

  const syncToParent = useCallback(
    (contentItems: EditorContent[], uncommitted: string) => {
      const text = getOutputString(contentItems, uncommitted);
      onChange(text);
    },
    [getOutputString, onChange],
  );

  const handleEditorClick = useCallback(() => {
    inputRef.current?.focus();
    setSelectedChipIndex(null);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;

      // Enforce maxLength
      const currentLen = getOutputString(content, '').length;
      const remaining = maxLength - currentLen;
      const clampedVal = val.slice(0, remaining + inputValue.length);

      setInputValue(clampedVal);
      setSelectedChipIndex(null);
      syncToParent(content, clampedVal);

      const lastChar = clampedVal.slice(-1);
      if (lastChar === '[') {
        setShowSuggestions(true);
        setSuggestionType('instant');
        setSuggestionFilter('');
        setHighlightedIndex(0);
      } else if (lastChar === '<') {
        setShowSuggestions(true);
        setSuggestionType('wrapper');
        setSuggestionFilter('');
        setHighlightedIndex(0);
      } else if (showSuggestions) {
        const triggerChar = suggestionType === 'instant' ? '[' : '<';
        const triggerIndex = clampedVal.lastIndexOf(triggerChar);
        if (triggerIndex !== -1) {
          setSuggestionFilter(clampedVal.slice(triggerIndex + 1));
          setHighlightedIndex(0);
        } else {
          setShowSuggestions(false);
          setSuggestionFilter('');
        }
      }
    },
    [
      content,
      getOutputString,
      inputValue.length,
      maxLength,
      showSuggestions,
      suggestionType,
      syncToParent,
    ],
  );

  const insertTag = useCallback(
    (tagDef: TagDef, fromEffectsPanel = false) => {
      const isWrapper = 'closeTag' in tagDef;
      const newContent = [...content];
      const insertPosition =
        cursorIndex === -1 ? newContent.length : cursorIndex;

      let textToAdd = inputValue;
      if (!fromEffectsPanel && showSuggestions) {
        const triggerChar = suggestionType === 'instant' ? '[' : '<';
        const triggerIndex = textToAdd.lastIndexOf(triggerChar);
        if (triggerIndex !== -1) {
          textToAdd = textToAdd.slice(0, triggerIndex);
        }
      }

      if (textToAdd.trim()) {
        newContent.splice(insertPosition, 0, {
          type: 'text',
          value: textToAdd,
        });
      }

      const chipInsertPosition = textToAdd.trim()
        ? insertPosition + 1
        : insertPosition;

      if (isWrapper) {
        const wrapperDef = tagDef as WrapperTagDef;
        const openChip: TagChip = {
          id: generateId(),
          type: 'open',
          tag: wrapperDef.tag,
          label: wrapperDef.label,
        };
        const closeChip: TagChip = {
          id: generateId(),
          type: 'close',
          tag: wrapperDef.closeTag,
          label: wrapperDef.label,
        };
        newContent.splice(
          chipInsertPosition,
          0,
          { type: 'chip', value: openChip },
          { type: 'chip', value: closeChip },
        );
        setCursorIndex(chipInsertPosition + 1);
      } else {
        const instantDef = tagDef as InstantTagDef;
        const chip: TagChip = {
          id: generateId(),
          type: 'instant',
          tag: instantDef.tag,
          label: instantDef.label,
        };
        newContent.splice(chipInsertPosition, 0, {
          type: 'chip',
          value: chip,
        });
        setCursorIndex(-1);
      }

      setContent(newContent);
      setInputValue('');
      setShowSuggestions(false);
      setSuggestionFilter('');
      syncToParent(newContent, '');

      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [
      content,
      cursorIndex,
      inputValue,
      showSuggestions,
      suggestionType,
      syncToParent,
    ],
  );

  const handleSuggestionClick = useCallback(
    (tagDef: TagDef) => {
      insertTag(tagDef);
    },
    [insertTag],
  );

  const removeChip = useCallback(
    (index: number) => {
      const newContent = content.filter((_, i) => i !== index);
      setContent(newContent);
      setSelectedChipIndex(null);
      syncToParent(newContent, inputValue);
      inputRef.current?.focus();
    },
    [content, inputValue, syncToParent],
  );

  const handleKeyDown = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keyboard handler needs branching for many key combinations
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSuggestions) {
          setShowSuggestions(false);
          setSuggestionFilter('');
          const triggerChar = suggestionType === 'instant' ? '[' : '<';
          const triggerIndex = inputValue.lastIndexOf(triggerChar);
          if (triggerIndex !== -1) {
            setInputValue(inputValue.slice(0, triggerIndex));
          }
        }
        setSelectedChipIndex(null);
        return;
      }

      if (showSuggestions && filteredSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredSuggestions.length - 1,
          );
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSuggestionClick(filteredSuggestions[highlightedIndex]);
          return;
        }
      }

      if (e.key === 'ArrowLeft' && inputValue === '') {
        e.preventDefault();
        const chipIndices = content
          .map((item, i) => (item.type === 'chip' ? i : -1))
          .filter((i) => i !== -1);

        if (chipIndices.length === 0) return;

        if (selectedChipIndex === null) {
          const insertPos = cursorIndex === -1 ? content.length : cursorIndex;
          const chipsBeforeCursor = chipIndices.filter((i) => i < insertPos);
          if (chipsBeforeCursor.length > 0) {
            setSelectedChipIndex(chipsBeforeCursor.at(-1) ?? null);
          }
        } else {
          const currentIdx = chipIndices.indexOf(selectedChipIndex);
          if (currentIdx > 0) {
            setSelectedChipIndex(chipIndices[currentIdx - 1]);
          }
        }
        return;
      }

      if (
        e.key === 'ArrowRight' &&
        inputValue === '' &&
        selectedChipIndex !== null
      ) {
        e.preventDefault();
        const chipIndices = content
          .map((item, i) => (item.type === 'chip' ? i : -1))
          .filter((i) => i !== -1);

        const currentIdx = chipIndices.indexOf(selectedChipIndex);
        if (currentIdx < chipIndices.length - 1) {
          setSelectedChipIndex(chipIndices[currentIdx + 1]);
        } else {
          setSelectedChipIndex(null);
        }
        return;
      }

      if (
        (e.key === 'Backspace' || e.key === 'Delete') &&
        selectedChipIndex !== null
      ) {
        e.preventDefault();
        removeChip(selectedChipIndex);
        return;
      }

      if (
        e.key === 'Backspace' &&
        inputValue === '' &&
        content.length > 0 &&
        selectedChipIndex === null
      ) {
        e.preventDefault();
        const insertPos = cursorIndex === -1 ? content.length : cursorIndex;
        if (insertPos > 0) {
          const newContent = [...content];
          newContent.splice(insertPos - 1, 1);
          setContent(newContent);
          syncToParent(newContent, '');
          if (cursorIndex !== -1) {
            setCursorIndex(cursorIndex - 1);
          }
        }
        return;
      }

      if (e.key.length === 1 && selectedChipIndex !== null) {
        setSelectedChipIndex(null);
      }
    },
    [
      content,
      cursorIndex,
      filteredSuggestions,
      handleSuggestionClick,
      highlightedIndex,
      inputValue,
      removeChip,
      selectedChipIndex,
      showSuggestions,
      suggestionType,
      syncToParent,
    ],
  );

  const commitInput = useCallback(() => {
    if (inputValue.trim()) {
      const newContent = [...content];
      const insertPosition =
        cursorIndex === -1 ? newContent.length : cursorIndex;
      newContent.splice(insertPosition, 0, {
        type: 'text',
        value: inputValue,
      });
      setContent(newContent);
      setInputValue('');
      setCursorIndex(-1);
      syncToParent(newContent, '');
    }
    setShowSuggestions(false);
    setSuggestionFilter('');
  }, [content, cursorIndex, inputValue, syncToParent]);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
        setSuggestionFilter('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLength = getOutputString(content, inputValue).length;

  const renderInput = (key: string) => (
    <span className="inline-flex items-center" key={key}>
      <input
        className="w-auto min-w-[2px] bg-transparent text-sm outline-none"
        onBlur={commitInput}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={content.length === 0 ? placeholder : ''}
        ref={inputRef}
        style={{ width: inputValue ? `${inputValue.length}ch` : '100%' }}
        type="text"
        value={inputValue}
      />
    </span>
  );

  const renderContent = () => {
    const items: React.ReactNode[] = [];
    const insertPosition = cursorIndex === -1 ? content.length : cursorIndex;

    content.forEach((item, index) => {
      if (index === insertPosition) {
        items.push(renderInput('input'));
      }

      if (item.type === 'text') {
        items.push(
          <span className="text-sm" key={`text-${index}`}>
            {item.value as string}
          </span>,
        );
      } else {
        const chip = item.value as TagChip;
        items.push(
          <TagChipComponent
            chip={chip}
            isSelected={selectedChipIndex === index}
            key={chip.id}
            onClick={() => {
              setSelectedChipIndex(index);
              inputRef.current?.focus();
            }}
            onRemove={() => removeChip(index)}
          />,
        );
      }
    });

    if (cursorIndex === -1) {
      items.push(renderInput('input'));
    }

    return items;
  };

  return (
    <div className="w-full">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: editor area delegates focus to inner input */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: editor area delegates focus */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by inner input */}
      <div
        className="relative min-h-[8rem] cursor-text rounded-md border border-input bg-background p-3 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        onClick={handleEditorClick}
        ref={editorRef}
      >
        <div className="flex flex-wrap items-center gap-y-1">
          {renderContent()}
        </div>

        {/* Autocomplete suggestions */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div
            className="absolute z-50 mt-1 w-64 rounded-md border border-border bg-popover shadow-lg"
            ref={suggestionsRef}
          >
            <div className="p-2">
              <div className="mb-2 font-medium text-muted-foreground text-xs">
                {suggestionType === 'instant' ? 'Instant Tags' : 'Wrapper Tags'}
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {filteredSuggestions.map((tag, index) => (
                  <button
                    className={cn(
                      'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                      index === highlightedIndex && 'bg-accent',
                    )}
                    key={tag.tag}
                    onClick={() => handleSuggestionClick(tag)}
                    type="button"
                  >
                    <span className="font-medium">
                      {suggestionType === 'instant'
                        ? `[${tag.label}]`
                        : `<${tag.label}>`}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {tag.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="mt-2 flex items-center gap-2">
        <Popover onOpenChange={setEffectsOpen} open={effectsOpen}>
          <PopoverTrigger asChild>
            <Button className="h-8" size="sm" variant="outline">
              <Sparkles className="mr-1.5 size-3.5" />
              Effects
              <ChevronDown className="ml-1 size-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-0">
            <div className="max-h-[400px] overflow-y-auto">
              <div className="border-border border-b p-3">
                <h4 className="mb-2 font-medium text-sm">Instant Tags</h4>
                <div className="grid grid-cols-2 gap-1">
                  {INSTANT_TAGS.map((tag) => (
                    <button
                      className="rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                      key={tag.tag}
                      onClick={() => {
                        insertTag(tag, true);
                        setEffectsOpen(false);
                      }}
                      type="button"
                    >
                      <div className="font-medium">[{tag.label}]</div>
                      <div className="text-muted-foreground">
                        {tag.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3">
                <h4 className="mb-2 font-medium text-sm">Wrapper Tags</h4>
                <div className="grid grid-cols-2 gap-1">
                  {WRAPPER_TAGS.map((tag) => (
                    <button
                      className="rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                      key={tag.tag}
                      onClick={() => {
                        insertTag(tag, true);
                        setEffectsOpen(false);
                      }}
                      type="button"
                    >
                      <div className="font-medium">
                        {'<'}
                        {tag.label}
                        {'>'}
                      </div>
                      <div className="text-muted-foreground">
                        {tag.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {onCodecChange && (
          <Select onValueChange={onCodecChange} value={codec}>
            <SelectTrigger className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mp3">MP3</SelectItem>
              <SelectItem value="wav">WAV</SelectItem>
            </SelectContent>
          </Select>
        )}

        <div className="flex-1" />

        <span
          className={cn(
            'text-muted-foreground text-xs',
            currentLength > maxLength && 'font-bold text-red-500',
          )}
        >
          {currentLength} / {maxLength}
        </span>
      </div>

      {/* Keyboard hint */}
      <div className="mt-1 text-center text-muted-foreground text-xs">
        Type <kbd className="rounded bg-muted px-1 py-0.5 font-mono">[</kbd> for
        instant tags or{' '}
        <kbd className="rounded bg-muted px-1 py-0.5 font-mono">{'<'}</kbd> for
        wrapper tags
      </div>
    </div>
  );
}
