import calculateNodeHeight from './calculateNodeHeight';
import getSizingData from './getSizingData';

export function resizeTextarea(
  textarea: HTMLTextAreaElement | null,
  minRows = 0,
  maxRows = 10,
  cssVariable = '--ta2-height',
) {
  if (!textarea) return;
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
