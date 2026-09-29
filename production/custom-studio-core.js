/* Hands of Gold - Custom Jewelry Studio core
   Lifted verbatim from script.js so custom-jewelry.html can run the studio
   without loading 97KB of homepage-only code. Same ids, same behaviour.
   Added 2026-09-08. */
(function () {
  "use strict";
  function init() {
    // Custom jewelry builder
    const choiceGroups = document.querySelectorAll("[data-choice-group]");
    const budgetSelect = document.getElementById("custom-budget");
    const sizeInput = document.getElementById("custom-size");
    const notesInput = document.getElementById("custom-notes");
    const customSummary = document.getElementById("custom-summary");
    const copyButton = document.getElementById("copy-custom-design");
    const copyStatus = document.getElementById("custom-copy-status");

    function selectedValue(groupName) {
      return document.querySelector(`[data-choice-group="${groupName}"] .custom-choice.is-selected`)?.dataset.value || "";
    }

    function buildCustomText() {
      const parts = [
        selectedValue("piece"),
        selectedValue("metal"),
        selectedValue("stones"),
        budgetSelect?.value || ""
      ].filter(Boolean);
      const size = sizeInput?.value?.trim();
      const notes = notesInput?.value?.trim();
      let text = parts.join(" · ");
      if (size) text += ` · Size/Dimensions: ${size}`;
      if (notes) text += ` · Notes: ${notes}`;
      return text;
    }

    function refreshCustomSummary() {
      if (customSummary) customSummary.textContent = buildCustomText();
    }

    choiceGroups.forEach(group => {
      group.querySelectorAll(".custom-choice").forEach(button => {
        button.addEventListener("click", () => {
          group.querySelectorAll(".custom-choice").forEach(b => b.classList.remove("is-selected"));
          button.classList.add("is-selected");
          refreshCustomSummary();
        });
      });
    });
    budgetSelect?.addEventListener("change", refreshCustomSummary);
    sizeInput?.addEventListener("input", refreshCustomSummary);
    notesInput?.addEventListener("input", refreshCustomSummary);

    copyButton?.addEventListener("click", async () => {
      const text = `Hands of Gold custom jewelry request: ${buildCustomText()}`;
      try {
        await navigator.clipboard.writeText(text);
        if (copyStatus) copyStatus.textContent = "Design details copied to your device. They have not been sent to Hands of Gold. Call us and paste or read the request when you are ready.";
      } catch {
        if (copyStatus) copyStatus.textContent = text;
      }
    });
    refreshCustomSummary();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
