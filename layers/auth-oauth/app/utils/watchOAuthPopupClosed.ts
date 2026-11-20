export function watchOAuthPopupClosed(popup: Pick<Window, 'closed'>, onClosed: () => void) {
  const interval = setInterval(() => {
    try {
      if (!popup.closed) return;
    } catch {
      return;
    }

    stop();
    onClosed();
  }, 500);

  function stop() {
    clearInterval(interval);
  }

  return stop;
}
