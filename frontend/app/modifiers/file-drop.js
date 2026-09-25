import { modifier } from 'ember-modifier';

function carriesFiles(event) {
  return [...(event.dataTransfer?.types ?? [])].includes('Files');
}

// Accepts dropped files only; a disabled zone still swallows the drop so the browser never opens the file.
export default modifier((element, [onFiles], { disabled = false }) => {
  const stopHighlight = () => element.classList.remove('is-dropping');

  const onDragOver = (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    if (!disabled) element.classList.add('is-dropping');
  };
  // Moving onto a child also fires dragleave; only a real exit clears.
  const onDragLeave = (event) => {
    if (element.contains(event.relatedTarget)) return;
    stopHighlight();
  };
  const onDrop = (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    stopHighlight();
    const files = [...(event.dataTransfer.files ?? [])];
    if (!disabled && files.length) onFiles?.(files);
  };

  element.addEventListener('dragover', onDragOver);
  element.addEventListener('dragleave', onDragLeave);
  element.addEventListener('drop', onDrop);
  return () => {
    element.removeEventListener('dragover', onDragOver);
    element.removeEventListener('dragleave', onDragLeave);
    element.removeEventListener('drop', onDrop);
    stopHighlight();
  };
});
