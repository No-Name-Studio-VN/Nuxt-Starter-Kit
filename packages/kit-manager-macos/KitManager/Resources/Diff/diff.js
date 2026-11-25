'use strict';

const target = document.getElementById('diff');

// Treat file-list links as in-document controls without issuing a navigation.
target.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  event.preventDefault();
  const href = link.getAttribute('href');
  if (!href?.startsWith('#')) return;
  const header = document.getElementById(href.slice(1))?.querySelector('.d2h-file-header');
  if (!header) return;
  header.tabIndex = -1;
  header.focus({ preventScroll: true });
  header.scrollIntoView({ block: 'start' });
});

function useCollapsibleFileList() {
  const wrapper = target.querySelector('.d2h-file-list-wrapper');
  const list = wrapper?.querySelector('.d2h-file-list');
  if (!list) return;
  const count = list.children.length;
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = count === 1 ? '1 changed file' : `${count} changed files`;
  details.open = count <= 5;
  details.append(summary, list);
  wrapper.replaceChildren(details);
}

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

window.renderDiff = (patch, layout, showsFileList = true) => {
  const renderer = new window.Diff2HtmlUI(target, patch, {
    outputFormat: layout,
    colorScheme: 'light', // The stylesheet sets the colours for both appearances.
    drawFileList: showsFileList,
    fileListToggle: false, // Use a keyboard-accessible details element instead.
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
  useCollapsibleFileList();
  styleFileNames();
  labelScrollAreas();
};
