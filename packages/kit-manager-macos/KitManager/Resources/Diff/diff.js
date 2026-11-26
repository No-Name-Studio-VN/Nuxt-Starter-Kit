'use strict';

const target = document.getElementById('diff');

function styleFileNames() {
  for (const name of target.querySelectorAll('.d2h-file-name')) {
    const path = name.textContent.trim();
    const separator = path.lastIndexOf('/');
    name.title = path;
    if (name.matches('a')) name.setAttribute('aria-label', path);
    if (separator < 0 || path.includes('→')) continue;
    const directory = document.createElement('span');
    directory.className = 'file-directory';
    directory.textContent = path.slice(0, separator);
    name.replaceChildren(path.slice(separator + 1), directory);
  }
}

function labelScrollAreas() {
  for (const file of target.querySelectorAll('.d2h-file-diff')) {
    file.tabIndex = 0;
    file.setAttribute('role', 'region');
    file.setAttribute('aria-label', 'Unified diff');
  }
  for (const sides of target.querySelectorAll('.d2h-files-diff')) {
    const labels = document.createElement('div');
    labels.className = 'pane-labels';
    labels.setAttribute('aria-hidden', 'true');
    sides.querySelectorAll('.d2h-file-side-diff').forEach((pane, index) => {
      const title = index === 0 ? 'Before' : 'After';
      const label = document.createElement('span');
      label.textContent = title;
      labels.append(label);
      pane.tabIndex = 0;
      pane.setAttribute('role', 'region');
      pane.setAttribute('aria-label', `${title} changes`);
    });
    sides.before(labels);
  }
}

window.renderDiff = (patch, layout) => {
  const renderer = new window.Diff2HtmlUI(target, patch, {
    outputFormat: layout,
    colorScheme: 'light', // The stylesheet sets the colours for both appearances.
    drawFileList: false,
    fileListToggle: false,
    fileContentToggle: false,
    stickyFileHeaders: false,
    synchronisedScroll: false,
    highlight: true,
    matching: 'none',
    maxLineLengthHighlight: 200,
    diffMaxChanges: 4000,
    diffMaxLineLength: 4000,
    diffTooBigMessage: () => 'File diff exceeds the display limit.',
  });
  renderer.draw();
  for (const header of target.querySelectorAll('.d2h-file-header')) {
    header.setAttribute('role', 'heading');
    header.setAttribute('aria-level', '2');
  }
  styleFileNames();
  labelScrollAreas();
};
