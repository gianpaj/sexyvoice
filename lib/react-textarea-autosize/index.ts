import calculateNodeHeight from './calculateNodeHeight';
import getSizingData from './getSizingData';

export function resizeTextarea(
  textarea: HTMLTextAreaElement | null,
  cssVariable = '--ta2-height',
) {
  if (!textarea) return;
  const minRows = 6;
  const maxRows = 10;
  // Use RAF to ensure DOM measurements are accurate
  requestAnimationFrame(() => {
    const nodeSizingData = getSizingData(textarea);

    if (!nodeSizingData) return;

    const [height] = calculateNodeHeight(
      nodeSizingData,
      textarea.value || textarea.placeholder || 'x',
      minRows,
      maxRows,
    );
    textarea.style.setProperty(cssVariable, `${height}px`, 'important');
  });
}
