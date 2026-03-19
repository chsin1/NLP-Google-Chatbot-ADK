export const WALKTHROUGH_SEEN_KEY = "telecom_walkthrough_seen_v1";
export const WALKTHROUGH_DISMISSED_KEY = "telecom_walkthrough_dismissed_v1";

function readFlag(storage, key) {
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(storage, key, value = true) {
  try {
    if (value) storage.setItem(key, "1");
    else storage.removeItem(key);
  } catch {
    // non-blocking
  }
}

function removeWalkthroughNodes(doc = document) {
  doc.querySelectorAll(".walkthrough-overlay, .walkthrough-popover").forEach((node) => node.remove());
  doc.querySelectorAll(".walkthrough-highlight").forEach((node) => node.classList.remove("walkthrough-highlight"));
}

function createButton(label, className = "", onClick = () => {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

export function createWalkthroughController({
  storage = window.localStorage,
  doc = document,
  targets = [],
  isBlockedStep = () => false,
  onStart = () => {},
  onFinish = () => {},
  onSkip = () => {}
} = {}) {
  let index = 0;
  let running = false;

  function markSeen() {
    writeFlag(storage, WALKTHROUGH_SEEN_KEY, true);
  }

  function markDismissed() {
    writeFlag(storage, WALKTHROUGH_DISMISSED_KEY, true);
  }

  function clearDismissed() {
    writeFlag(storage, WALKTHROUGH_DISMISSED_KEY, false);
  }

  function shouldAutoStart() {
    return !readFlag(storage, WALKTHROUGH_SEEN_KEY) && !readFlag(storage, WALKTHROUGH_DISMISSED_KEY);
  }

  function teardown() {
    running = false;
    removeWalkthroughNodes(doc);
  }

  function renderStep() {
    removeWalkthroughNodes(doc);
    const step = targets[index];
    if (!step) {
      markSeen();
      teardown();
      onFinish();
      return;
    }
    const target = doc.querySelector(step.selector);
    if (!target) {
      index += 1;
      renderStep();
      return;
    }
    target.classList.add("walkthrough-highlight");

    const overlay = doc.createElement("div");
    overlay.className = "walkthrough-overlay";
    doc.body.appendChild(overlay);

    const card = doc.createElement("section");
    card.className = "walkthrough-popover";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Product walkthrough");
    card.innerHTML = `
      <h4>${step.title}</h4>
      <p>${step.body}</p>
      <div class="walkthrough-progress">Step ${index + 1} of ${targets.length}</div>
    `;

    const controls = doc.createElement("div");
    controls.className = "walkthrough-controls";
    const skipBtn = createButton("Skip", "secondary", () => {
      markDismissed();
      teardown();
      onSkip();
    });
    const backBtn = createButton("Back", "secondary", () => {
      index = Math.max(0, index - 1);
      renderStep();
    });
    backBtn.disabled = index === 0;
    const nextBtn = createButton(index === targets.length - 1 ? "Done" : "Next", "primary", () => {
      index += 1;
      renderStep();
    });
    controls.append(skipBtn, backBtn, nextBtn);
    card.appendChild(controls);
    doc.body.appendChild(card);

    const rect = target.getBoundingClientRect();
    const top = Math.max(16, rect.bottom + 10 + window.scrollY);
    const left = Math.min(window.innerWidth - 320, Math.max(16, rect.left + window.scrollX));
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function start({ force = false } = {}) {
    if (running) return { started: true, reason: "already_running" };
    if (!force && !shouldAutoStart()) return { started: false, reason: "already_seen_or_dismissed" };
    if (isBlockedStep()) return { started: false, reason: "blocked_step" };
    running = true;
    index = 0;
    clearDismissed();
    onStart();
    renderStep();
    return { started: true, reason: "started" };
  }

  function replay() {
    return start({ force: true });
  }

  return {
    shouldAutoStart,
    start,
    replay,
    markSeen,
    markDismissed,
    teardown
  };
}
