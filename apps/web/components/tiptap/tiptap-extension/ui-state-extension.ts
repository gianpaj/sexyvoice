import { Extension } from '@tiptap/core';

export interface UiState {
  commentInputVisible: boolean;
  isDragging: boolean;
  lockDragHandle: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    uiState: {
      commentInputShow: () => ReturnType;
      commentInputHide: () => ReturnType;

      setLockDragHandle: (value: boolean) => ReturnType;

      resetUiState: () => ReturnType;
      setIsDragging: (value: boolean) => ReturnType;
    };
  }

  interface Storage {
    uiState: UiState;
  }
}

export const defaultUiState: UiState = {
  commentInputVisible: false,
  lockDragHandle: false,
  isDragging: false,
} as const;

export const UiState = Extension.create<UiState>({
  name: 'uiState',

  addStorage() {
    return {
      ...defaultUiState,
    };
  },

  addCommands() {
    const createBooleanSetter =
      (key: keyof UiState) => (value: boolean) => () => {
        this.storage[key] = value;
        return true;
      };

    const createToggle = (key: keyof UiState, value: boolean) => () => () => {
      this.storage[key] = value;
      return true;
    };

    return {
      // AI Generation commands

      // Comment input commands
      commentInputShow: createToggle('commentInputVisible', true),
      commentInputHide: createToggle('commentInputVisible', false),

      // Drag handle commands
      setLockDragHandle: createBooleanSetter('lockDragHandle'),
      setIsDragging: createBooleanSetter('isDragging'),

      // Reset command
      resetUiState: () => () => {
        Object.assign(this.storage, { ...defaultUiState });
        return true;
      },
    };
  },

  onCreate() {
    Object.assign(this.storage, { ...defaultUiState });
  },
});
