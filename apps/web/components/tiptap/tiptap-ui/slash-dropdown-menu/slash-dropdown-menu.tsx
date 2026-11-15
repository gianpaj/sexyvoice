import { useEffect, useRef } from 'react';

import type {
  SuggestionItem,
  SuggestionMenuProps,
  SuggestionMenuRenderProps,
} from '@/components/tiptap/tiptap-ui-utils/suggestion-menu';
import {
  filterSuggestionItems,
  SuggestionMenu,
} from '@/components/tiptap/tiptap-ui-utils/suggestion-menu';
import { cn } from '@/lib/utils';

type SlashDropdownMenuProps = Omit<
  SuggestionMenuProps,
  'items' | 'children'
> & {
  items: SuggestionItem[];
  pluginKey?: string;
  selector?: string;
};

type OverflowPosition = 'none' | 'top' | 'bottom' | 'both';

function getElementOverflowPosition(
  targetElement: Element,
  containerElement: HTMLElement,
): OverflowPosition {
  const targetBounds = targetElement.getBoundingClientRect();
  const containerBounds = containerElement.getBoundingClientRect();

  const isOverflowingTop = targetBounds.top < containerBounds.top;
  const isOverflowingBottom = targetBounds.bottom > containerBounds.bottom;

  if (isOverflowingTop && isOverflowingBottom) return 'both';
  if (isOverflowingTop) return 'top';
  if (isOverflowingBottom) return 'bottom';
  return 'none';
}

export const SlashDropdownMenu = ({
  items,
  pluginKey = 'slashDropdownMenu',
  selector = 'tiptap-slash-dropdown-menu',
  ...restProps
}: SlashDropdownMenuProps) => (
  <SuggestionMenu
    decorationClass="inline-block bg-gray-800 p-0 rounded-sm outline-[3.5px] md:outline-[5px] outline-gray-800 [&.is-empty]:after:content-[attr(data-decoration-content)] [&.is-empty]:after:text-gray-500"
    items={({ query }) => filterSuggestionItems(items, query)}
    pluginKey={pluginKey}
    selector={selector}
    {...restProps}
  >
    {(props) => <List {...props} />}
  </SuggestionMenu>
);

const Item = (props: {
  item: SuggestionItem;
  isSelected: boolean;
  onSelect: () => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const { item, isSelected, onSelect, scrollContainerRef } = props;
  const itemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!(itemRef.current && isSelected && scrollContainer)) return;

    const overflow = getElementOverflowPosition(
      itemRef.current,
      scrollContainer,
    );
    const itemRect = itemRef.current.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();

    if (overflow === 'top') {
      scrollContainer.scrollTop -= containerRect.top - itemRect.top;
    } else if (overflow === 'bottom') {
      scrollContainer.scrollTop += itemRect.bottom - containerRect.bottom;
    }
  }, [isSelected, scrollContainerRef]);

  return (
    <button
      className={cn(
        'inline-flex h-8 w-full items-center justify-start gap-1 rounded-lg bg-transparent px-2 text-left font-medium text-gray-300 text-sm transition-colors hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4',
        isSelected && 'bg-gray-800! text-white',
      )}
      onClick={onSelect}
      ref={itemRef}
      type="button"
    >
      <div className="flex-1 truncate">{item.title}</div>
    </button>
  );
};

const List = ({
  items,
  selectedIndex,
  onSelect,
}: SuggestionMenuRenderProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="wrap-break-word relative flex min-w-[15rem] flex-col overflow-hidden rounded-lg border border-gray-800 bg-gray-950 bg-clip-border shadow-sm outline-none"
      style={{
        maxHeight: 'var(--suggestion-menu-max-height)',
      }}
    >
      <div
        className="w-full flex-auto overflow-y-auto p-2"
        ref={scrollContainerRef}
      >
        {items.map((item, index) => (
          <Item
            isSelected={index === selectedIndex}
            item={item}
            key={`item-${index}-${item.title}`}
            onSelect={() => onSelect(item)}
            scrollContainerRef={scrollContainerRef}
          />
        ))}
      </div>
    </div>
  );
};
