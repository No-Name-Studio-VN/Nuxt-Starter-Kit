"use strict";

const target = document.getElementById("diff");

// Treat file-list links as in-document controls without issuing a navigation.
target.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  event.preventDefault();
  const href = link.getAttribute("href");
  if (!href?.startsWith("#")) return;
  const header = document.getElementById(href.slice(1))?.querySelector(".d2h-file-header");
  if (!header) return;
  header.tabIndex = -1;
  header.focus({ preventScroll: true });
  header.scrollIntoView({ block: "start" });
});

function useCollapsibleFileList() {
  const wrapper = target.querySelector(".d2h-file-list-wrapper");
  const heading = wrapper?.querySelector(".d2h-file-list-header");
  const title = heading?.querySelector(".d2h-file-list-title");
  const list = wrapper?.querySelector(".d2h-file-list");
  if (!list || !title) return;
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.className = "d2h-file-list-header";
  summary.textContent = title.textContent;
  details.open = list.children.length <= 5;
  details.append(summary, list);
  wrapper.replaceChildren(details);
}

window.renderDiff = (patch, layout) => {
  const renderer = new Diff2HtmlUI(target, patch, {
    outputFormat: layout,
    colorScheme: "auto",
    drawFileList: true,
    fileListToggle: false, // Use a keyboard-accessible details element instead.
    highlight: true,
    matching: "none",
    maxLineLengthHighlight: 200,
    diffMaxChanges: 4000,
    diffMaxLineLength: 4000,
    diffTooBigMessage: () => "File diff exceeds the display limit.",
  });
  renderer.draw();
  useCollapsibleFileList();
};
