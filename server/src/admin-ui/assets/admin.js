// Small enhancements for admin pages. Every page also works without this file.
(() => {
  // Ask before destructive actions.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    const question = form.dataset.confirm;
    if (question && !window.confirm(question)) {
      event.preventDefault();
      return;
    }
    // Instant feedback on click: the button shows it is working, and cannot be pressed twice.
    if (form.hasAttribute('data-no-busy')) return;
    const button = event.submitter;
    if (button) {
      setTimeout(() => {
        button.setAttribute('aria-busy', 'true');
        button.disabled = true;
      }, 0);
    }
    form.dataset.submitting = 'true';
  });

  // Warn before leaving a form with unsaved changes.
  for (const form of document.querySelectorAll('form[data-dirty-check]')) {
    const initial = new URLSearchParams(new FormData(form)).toString();
    window.addEventListener('beforeunload', (event) => {
      if (form.dataset.submitting) return;
      if (new URLSearchParams(new FormData(form)).toString() !== initial) event.preventDefault();
    });
  }

  // Ctrl+S / Cmd+S saves the main form.
  const saveForm = document.querySelector('form[data-hotkey-save]');
  if (saveForm) {
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveForm.requestSubmit();
      }
    });
  }

  // "Select all" in bulk tables.
  for (const toggle of document.querySelectorAll('[data-select-all]')) {
    toggle.addEventListener('change', () => {
      for (const box of toggle.closest('form').querySelectorAll('input[name="ids"]')) box.checked = toggle.checked;
    });
  }

  // Changing a role select submits its form right away.
  for (const form of document.querySelectorAll('form[data-autosubmit]')) {
    form.querySelector('select')?.addEventListener('change', () => form.requestSubmit());
    form.querySelector('button')?.setAttribute('hidden', '');
  }

  // Copy buttons.
  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
      const text = document.querySelector(button.dataset.copy)?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = 'Copied';
      } catch {
        window.getSelection().selectAllChildren(document.querySelector(button.dataset.copy));
        button.textContent = 'Selected, press Ctrl+C';
      }
    });
  }

  for (const button of document.querySelectorAll('[data-print]')) button.addEventListener('click', () => window.print());

  // Success notices fade away; errors stay until fixed.
  for (const notice of document.querySelectorAll('[data-autohide]')) {
    setTimeout(() => notice.classList.add('fade'), 3500);
    setTimeout(() => notice.remove(), 4000);
    const url = new URL(window.location.href);
    url.searchParams.delete('notice');
    window.history.replaceState(null, '', url);
  }

  document.querySelector('[data-focus]')?.focus();
})();
