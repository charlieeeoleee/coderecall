let itemFeedbackModulePromise = null;

function loadItemFeedbackModule() {
  if (!itemFeedbackModulePromise) {
    window.CODE_RECALL_ITEM_FEEDBACK_MANUAL = true;
    itemFeedbackModulePromise = import("./item-feedback.js?v=20260510b");
  }
  return itemFeedbackModulePromise;
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-item-feedback]");
  if (!button) return;

  event.preventDefault();
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Opening...";

  try {
    await loadItemFeedbackModule();
    window.openCodeRecallItemFeedback?.(button);
  } catch (error) {
    console.error("Unable to load item feedback form:", error);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}, true);
